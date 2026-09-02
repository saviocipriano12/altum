import { after, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import {
  isCaptureFieldVisible,
  normalizeCaptureFields,
  normalizeCaptureFieldValue,
} from "@/lib/capture-form";
import { enqueueIncomingMessageJob, kickAiQueueNow, processAiJobNow, triggerAiQueueWorker } from "@/lib/server/ai/queue";
import { runLeadAutomations } from "@/lib/server/automations";
import { buildIncomingChatOperationalPatch, resolveFirstResponseSlaMinutes } from "@/lib/server/chat-operations";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";

type Body = {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  customFields?: Record<string, unknown>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  landingPage?: string;
  referrer?: string;
};

type CustomFieldMap = Record<string, string | number | boolean>;

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    await assertPublicRateLimit(req, { scope: "capture_chat_start", subject: formId, limit: 5, windowMs: 10 * 60 * 1000 });
    const body = (await req.json()) as Body;

    const formSnap = await adminDb.collection("capture_forms").doc(formId).get();
    if (!formSnap.exists) {
      return NextResponse.json({ error: "Formulario nao encontrado." }, { status: 404 });
    }

    const form = formSnap.data() as Record<string, unknown>;
    if (String(form.status || "draft") !== "active") {
      return NextResponse.json({ error: "Formulario indisponivel." }, { status: 403 });
    }

    const fields = normalizeCaptureFields(form.fields);
    const tenantId = clean(form.tenantId, 140);
    const tenantSettings = await getTenantSettings(tenantId);
    const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
    const nome = clean(body.nome, 180);
    const email = clean(body.email, 180).toLowerCase();
    const telefone = normalizePhoneBR(clean(body.telefone, 40));
    const empresa = clean(body.empresa, 180);
    const mensagem = clean(body.mensagem, 4000);
    const utmSource = clean(body.utmSource, 120);
    const utmMedium = clean(body.utmMedium, 120);
    const utmCampaign = clean(body.utmCampaign, 180);
    const utmTerm = clean(body.utmTerm, 160);
    const utmContent = clean(body.utmContent, 240);
    const gclid = clean(body.gclid, 240);
    const fbclid = clean(body.fbclid, 240);
    const landingPage = clean(body.landingPage, 500);
    const referrer = clean(body.referrer, 500);
    const customFieldEntries = fields
      .map((field) => [field.id, normalizeCaptureFieldValue(field, body.customFields?.[field.id])] as const)
      .filter(
        (
          entry
        ): entry is readonly [string, string | number | boolean] => entry[1] !== null
      );
    const customFieldValues: CustomFieldMap = Object.fromEntries(customFieldEntries);

    const missingRequiredField = fields.find((field) => {
      if (!field.required) return false;
      if (!isCaptureFieldVisible(field, customFieldValues)) return false;
      const value = customFieldValues[field.id];
      return value === undefined || value === null || value === "";
    });

    if (missingRequiredField) {
      return NextResponse.json({ error: `Campo obrigatorio: ${missingRequiredField.label}.` }, { status: 400 });
    }

    if (!nome && !email && !telefone) {
      return NextResponse.json({ error: "Informe nome, telefone ou email." }, { status: 400 });
    }

    const existingLeadSnap = telefone || email
      ? await adminDb
          .collection("leads")
          .where("tenantId", "==", tenantId)
          .where(telefone ? "telefone" : "email", "==", telefone || email)
          .limit(1)
          .get()
      : null;
    const existingLead =
      existingLeadSnap && !existingLeadSnap.empty
        ? (existingLeadSnap.docs[0].data() as Record<string, unknown>)
        : {};
    let assignedUserId = clean(existingLead.ownerId, 140) || null;
    let assignedUserName = clean(existingLead.owner, 140) || null;

    if (!assignedUserId) {
      const inboundAssignee = await resolveInboundAssignment(tenantId, { channel: "site_chat" });
      assignedUserId = inboundAssignee?.userId || null;
      assignedUserName = inboundAssignee?.name || null;
    }

    const intake = await recordInboundLead({
      tenantId,
      sourceType: "site_chat_widget",
      sourceId: null,
      sourceLabel: clean(form.sourceLabel, 120) || "Site chat",
      channel: "site_chat",
      nome,
      email,
      telefone,
      empresa,
      mensagem,
      customFields: customFieldValues,
      tags: ["site_chat", "captacao_widget"],
      defaultOwnerId: assignedUserId,
      defaultOwnerName: assignedUserName,
      attribution: {
        source: utmSource || clean(form.sourceLabel, 120) || "site_chat",
        medium: utmMedium || "chat",
        campaign: utmCampaign,
        term: utmTerm,
        content: utmContent,
        formId,
        formName: clean(form.name, 140) || "Widget chat",
        landingPage,
        referrer,
        gclid,
        fbclid,
        channel: "site_chat",
        sourceType: "site_chat_widget",
        sourceLabel: clean(form.sourceLabel, 120) || "Site chat",
      },
      submission: {
        formId,
        formName: clean(form.name, 140) || "Widget chat",
        sourceLabel: clean(form.sourceLabel, 120) || "Site chat",
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        gclid,
        fbclid,
        landingPage,
        referrer,
      },
      automationActorId: "site_chat_widget",
      automationActorName: "Site Chat Widget",
    });

    const leadRef = adminDb.collection("leads").doc(intake.leadId);
    const leadSnap = await leadRef.get();
    const resolvedLead = leadSnap.exists ? (leadSnap.data() as Record<string, unknown>) : {};
    assignedUserId = clean(resolvedLead.ownerId, 140) || assignedUserId;
    assignedUserName = clean(resolvedLead.owner, 140) || assignedUserName;

    const existingChatSnap = await adminDb
      .collection("chats")
      .where("tenantId", "==", tenantId)
      .where("leadId", "==", intake.leadId)
      .where("channel", "==", "site_chat")
      .limit(1)
      .get();

    const publicAccessToken = randomUUID();
    const chatRef = existingChatSnap.empty ? adminDb.collection("chats").doc() : existingChatSnap.docs[0].ref;
    const chatPayload: Record<string, unknown> = {
      tenantId,
      leadId: intake.leadId,
      channel: "site_chat",
      sourceType: "site_chat_widget",
      sourceId: formId,
      contactName: nome || clean(resolvedLead.nome, 180) || "Lead",
      contactPhone: telefone || clean(resolvedLead.telefone, 40),
      contactEmail: email || clean(resolvedLead.email, 180),
      company: empresa || clean(resolvedLead.empresa, 180),
      priority: "medium",
      ownerId: assignedUserId,
      ownerName: assignedUserName,
      assignedUserName,
      publicAccessToken,
      publicAccessTokenCreatedAt: FieldValue.serverTimestamp(),
      lastMessage: mensagem || "Conversa iniciada no site",
      lastMessageTime: FieldValue.serverTimestamp(),
      ...buildIncomingChatOperationalPatch({
        status: "open",
        assignedTo: assignedUserId,
        slaMinutes,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existingChatSnap.empty) {
      chatPayload.createdAt = FieldValue.serverTimestamp();
    }

    await chatRef.set(chatPayload, { merge: true });

    await upsertContactProfile({
      tenantId,
      phone: telefone || clean(resolvedLead.telefone, 40),
      leadId: intake.leadId,
      channel: "site_chat",
      name: nome || clean(resolvedLead.nome, 180) || "Lead",
      email: email || clean(resolvedLead.email, 180),
      company: empresa || clean(resolvedLead.empresa, 180),
    });

    if (mensagem) {
      const messageRef = await adminDb.collection("messages").add({
        chatId: chatRef.id,
        tenantId,
        leadId: intake.leadId,
        sender: "client",
        text: mensagem,
        type: "text",
        status: "received",
        channel: "site_chat",
        createdAt: FieldValue.serverTimestamp(),
      });

      await runLeadAutomations({
        tenantId,
        trigger: "message_received",
        leadId: intake.leadId,
        chatId: chatRef.id,
        channel: "site_chat",
        messageText: mensagem,
        actorId: "site_chat_widget",
        actorName: "Site Chat Widget",
      });

      const queue = await enqueueIncomingMessageJob({
        tenantId,
        chatId: chatRef.id,
        messageId: messageRef.id,
        source: "site_chat_widget",
        dedupeKey: `${tenantId}_${messageRef.id}`,
      });
      await processAiJobNow(queue.jobId);
      await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
      triggerAiQueueWorker({ limit: 8, drain: true });
      after(async () => {
        await processAiJobNow(queue.jobId);
        await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
        triggerAiQueueWorker({ limit: 8, drain: true });
      });
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      leadId: intake.leadId,
      chatId: chatRef.id,
      token: publicAccessToken,
    });
  } catch (error) {
    if (error instanceof PublicRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    console.error("Erro ao iniciar chat publico:", error);
    return NextResponse.json({ error: "Falha ao iniciar chat." }, { status: 500 });
  }
}

