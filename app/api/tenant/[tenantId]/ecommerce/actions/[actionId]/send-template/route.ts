import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { sendTenantChatTemplate } from "@/lib/server/chat-dispatch";
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

async function ensureWhatsAppChat(input: {
  tenantId: string;
  leadId: string;
  phone: string;
  name: string;
  actorName: string;
}) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Acao sem telefone valido para WhatsApp.");

  const existing = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("contactPhone", "==", phone)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.set(
      {
        leadId: input.leadId || clean(doc.data().leadId, 180) || null,
        contactName: input.name || clean(doc.data().contactName, 180) || phone,
        channel: "whatsapp",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return doc.id;
  }

  const created = await adminDb.collection("chats").add({
    tenantId: input.tenantId,
    leadId: input.leadId || null,
    channel: "whatsapp",
    contactName: input.name || phone,
    contactPhone: phone,
    contactPhoneNormalized: phone,
    status: "open",
    ownerName: input.actorName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageTime: FieldValue.serverTimestamp(),
    lastMessage: "",
  });
  return created.id;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; actionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, actionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
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

    const chatId = await ensureWhatsAppChat({
      tenantId,
      leadId: clean(action.leadId, 180),
      phone: clean(action.customerPhone, 80),
      name: clean(action.customerName, 180),
      actorName: user.name,
    });

    const result = await sendTenantChatTemplate({
      tenantId,
      chatId,
      templateName,
      languageCode,
      bodyParams: resolvedParams,
      actor: { id: user.uid, name: user.name },
      pauseAi: true,
      pauseMinutes: 30,
    });

    const markDone = body.markDone !== false;
    await actionRef.set(
      {
        status: markDone ? "done" : "sent",
        whatsappSentAt: FieldValue.serverTimestamp(),
        whatsappSentBy: user.uid,
        whatsappSentByName: user.name,
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

    const leadId = clean(action.leadId, 180);
    if (leadId) {
      await adminDb.collection("leads").doc(leadId).collection("events").add({
        type: "ecommerce_whatsapp_template",
        title: "Template WhatsApp enviado",
        detail: `${templateName} enviado para acao ecommerce.`,
        actorId: user.uid,
        actorName: user.name,
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
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao enviar template ecommerce:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar template ecommerce." },
      { status: 500 }
    );
  }
}

