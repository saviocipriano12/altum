import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { sendTenantChatTemplate } from "@/lib/server/chat-dispatch";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  automationTemplateForAction,
  interpolateEcommerceTemplateParams,
  normalizeEcommerceActionType,
  normalizeEcommerceAutomationSettings,
} from "@/lib/server/ecommerce";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    if (!hasTenantCapability(membership, "manage_channels") && !hasTenantCapability(membership, "respond_inbox")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para processar automacoes ecommerce.");
    }

    const body = (await req.json().catch(() => ({}))) as { limit?: number; dryRun?: boolean };
    const limit = Math.max(1, Math.min(25, Number(body.limit || 10)));
    const dryRun = body.dryRun === true;

    const settingsSnap = await adminDb.collection("tenant_settings").doc(tenantId).get();
    const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
    const automation = normalizeEcommerceAutomationSettings(settings.ecommerceAutomation);
    if (!automation.autoSendEnabled && !dryRun) {
      return NextResponse.json({ error: "Envio automatico ecommerce esta desativado." }, { status: 400 });
    }

    const actionsSnap = await adminDb
      .collection("ecommerce_commercial_actions")
      .where("tenantId", "==", tenantId)
      .where("status", "==", "pending")
      .limit(limit)
      .get();

    const results: Array<{ actionId: string; status: string; message?: string; chatId?: string }> = [];
    for (const doc of actionsSnap.docs) {
      const action = doc.data() as Record<string, unknown>;
      const actionType = normalizeEcommerceActionType(action.type);
      if (!actionType) {
        results.push({ actionId: doc.id, status: "skipped", message: "tipo invalido" });
        continue;
      }
      const template = automationTemplateForAction(automation, actionType);
      if (!template.enabled || !template.templateName) {
        results.push({ actionId: doc.id, status: "skipped", message: "template desativado" });
        continue;
      }
      if (!clean(action.customerPhone, 80)) {
        results.push({ actionId: doc.id, status: "skipped", message: "sem telefone" });
        continue;
      }

      const params = interpolateEcommerceTemplateParams(template.params, action);
      if (dryRun) {
        results.push({ actionId: doc.id, status: "ready", message: template.templateName });
        continue;
      }

      try {
        const chatId = await ensureWhatsAppChat({
          tenantId,
          leadId: clean(action.leadId, 180),
          phone: clean(action.customerPhone, 80),
          name: clean(action.customerName, 180),
          actorName: user.name,
        });
        const sent = await sendTenantChatTemplate({
          tenantId,
          chatId,
          templateName: template.templateName,
          languageCode: template.languageCode,
          bodyParams: params,
          actor: { id: user.uid, name: user.name },
          pauseAi: true,
          pauseMinutes: 30,
        });

        await doc.ref.set(
          {
            status: "done",
            whatsappSentAt: FieldValue.serverTimestamp(),
            whatsappSentBy: user.uid,
            whatsappSentByName: user.name,
            whatsappChatId: chatId,
            whatsappTemplateName: template.templateName,
            whatsappTemplateLanguage: template.languageCode,
            whatsappTemplateParams: params,
            whatsappMetaMessageId: sent.metaMessageId || null,
            resolvedAt: FieldValue.serverTimestamp(),
            resolvedBy: user.uid,
            resolvedByName: user.name,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        results.push({ actionId: doc.id, status: "sent", chatId });
      } catch (error) {
        await doc.ref.set(
          {
            status: "pending",
            lastSendError: error instanceof Error ? error.message : "send_failed",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        results.push({ actionId: doc.id, status: "failed", message: error instanceof Error ? error.message : "send_failed" });
      }
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      dryRun,
      processed: results.length,
      results,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao processar automacoes ecommerce:", error);
    return NextResponse.json({ error: "Falha ao processar automacoes ecommerce." }, { status: 500 });
  }
}

