import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { deliverEcommerceActionTemplate, EcommerceDeliveryPendingError } from "@/lib/server/ecommerce-action-delivery";
import { ChatOutboundIdempotencyError } from "@/lib/server/chat-outbound-idempotency";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  automationTemplateForAction,
  interpolateEcommerceTemplateParams,
  normalizeEcommerceActionType,
  normalizeEcommerceAutomationSettings,
} from "@/lib/server/ecommerce";

type Body = {
  templateName?: string;
  languageCode?: string;
  bodyParams?: string[];
  markDone?: boolean;
};

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeTemplateName(value: unknown) {
  return clean(value, 120).replace(/\s+/g, "_").toLowerCase();
}

function normalizeBodyParams(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => clean(item, 200)).filter(Boolean).slice(0, 20);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; actionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, actionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    if (!hasTenantCapability(membership, "respond_inbox") && !hasTenantCapability(membership, "manage_channels")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para enviar WhatsApp.");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const actionRef = adminDb.collection("ecommerce_commercial_actions").doc(clean(actionId, 180));
    const actionSnap = await actionRef.get();
    if (!actionSnap.exists) return NextResponse.json({ error: "Acao nao encontrada." }, { status: 404 });
    const action = actionSnap.data() as Record<string, unknown>;
    if (clean(action.tenantId, 180) !== tenantId) {
      return NextResponse.json({ error: "Acao fora do tenant informado." }, { status: 403 });
    }

    const actionType = normalizeEcommerceActionType(action.type);
    if (!actionType) return NextResponse.json({ error: "Tipo de acao ecommerce invalido." }, { status: 400 });

    const settingsSnap = await adminDb.collection("tenant_settings").doc(tenantId).get();
    const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
    const automation = normalizeEcommerceAutomationSettings(settings.ecommerceAutomation);
    const template = automationTemplateForAction(automation, actionType);
    const templateName = normalizeTemplateName(body.templateName) || template.templateName;
    const languageCode = clean(body.languageCode, 24) || template.languageCode || "pt_BR";
    const bodyParams = normalizeBodyParams(body.bodyParams);
    const resolvedParams = bodyParams.length ? bodyParams : interpolateEcommerceTemplateParams(template.params, action);

    if (!templateName) return NextResponse.json({ error: "Template nao configurado para esta acao." }, { status: 400 });

    const result = await deliverEcommerceActionTemplate({
      tenantId,
      actionId: actionRef.id,
      templateName,
      languageCode,
      bodyParams: resolvedParams,
      actor: { id: user.uid, name: user.name },
    });
    const chatId = result.chatId;

    const markDone = body.markDone !== false;
    await actionRef.set(
      {
        status: markDone ? "done" : "sent",
        whatsappSentAt: FieldValue.serverTimestamp(),
        whatsappSentBy: result.actor.id,
        whatsappSentByName: result.actor.name,
        whatsappChatId: chatId,
        whatsappTemplateName: templateName,
        whatsappTemplateLanguage: languageCode,
        whatsappTemplateParams: resolvedParams,
        whatsappMetaMessageId: result.metaMessageId || null,
        resolvedAt: markDone ? FieldValue.serverTimestamp() : null,
        resolvedBy: markDone ? user.uid : null,
        resolvedByName: markDone ? user.name : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const leadId = result.leadId;
    if (leadId) {
      const leadRef = adminDb.collection("leads").doc(leadId);
      const eventRef = leadRef.collection("events").doc(`ecommerce-template-${result.jobId}`);
      await adminDb.runTransaction(async tx => {
        const [lead, event] = await Promise.all([tx.get(leadRef), tx.get(eventRef)]);
        if (!lead.exists || lead.data()?.tenantId !== tenantId) throw new Error("Lead alterado apos envio. Evento nao foi gravado fora da empresa.");
        if (event.exists) {
          if (event.data()?.metadata?.actionId !== actionRef.id) throw new Error("Evento de envio ecommerce fora do escopo.");
          return;
        }
        tx.create(eventRef, {
          type: "ecommerce_whatsapp_template",
          title: "Template WhatsApp enviado",
          detail: `${templateName} enviado para acao ecommerce.`,
          actorId: result.actor.id,
          actorName: result.actor.name,
          metadata: {
            actionId: actionRef.id,
            actionType,
            chatId,
            templateName,
            languageCode,
            metaMessageId: result.metaMessageId || "",
          },
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      actionId: actionRef.id,
      chatId,
      templateName,
      languageCode,
      metaMessageId: result.metaMessageId,
    });
  } catch (error) {
    if (error instanceof EcommerceDeliveryPendingError) return NextResponse.json({ ok: false, pending: true, code: "delivery_pending", jobId: error.jobId, chatId: error.chatId, error: error.message }, { status: 409 });
    if (error instanceof ChatOutboundIdempotencyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao enviar template ecommerce:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar template ecommerce." },
      { status: 500 }
    );
  }
}

