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
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";

type Body = {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  customFields?: Record<string, unknown>;
};

type CustomFieldMap = Record<string, string | number | boolean>;

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function findLead(tenantId: string, email: string, phone: string) {
  if (phone) {
    const phoneSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .where("telefone", "==", phone)
      .limit(1)
      .get();
    if (!phoneSnap.empty) return phoneSnap.docs[0];
  }

  if (email) {
    const emailSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!emailSnap.empty) return emailSnap.docs[0];
  }

  return null;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
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

    const leadSnap = await findLead(tenantId, email, telefone);
    const leadRef = leadSnap ? leadSnap.ref : adminDb.collection("leads").doc();
    const existingLead = leadSnap ? (leadSnap.data() as Record<string, unknown>) : {};
    let assignedUserId = clean(existingLead.ownerId, 140) || null;
    let assignedUserName = clean(existingLead.owner, 140) || null;

    if (!assignedUserId) {
      const inboundAssignee = await resolveInboundAssignment(tenantId, { channel: "site_chat" });
      assignedUserId = inboundAssignee?.userId || null;
      assignedUserName = inboundAssignee?.name || null;
    }

    await leadRef.set(
      {
        tenantId,
        nome: nome || clean(existingLead.nome, 180) || "Lead sem nome",
        email: email || clean(existingLead.email, 180),
        telefone: telefone || clean(existingLead.telefone, 40),
        empresa: empresa || clean(existingLead.empresa, 180),
        origem: clean(form.sourceLabel, 120) || "Site chat",
        channel: "site_chat",
        sourceType: "site_chat_widget",
        sourceId: formId,
        ownerId: assignedUserId,
        owner: assignedUserName,
        tags: Array.from(new Set(["site_chat", "captacao_widget"])).slice(0, 8),
        customFields: {
          ...((existingLead.customFields && typeof existingLead.customFields === "object")
            ? (existingLead.customFields as Record<string, unknown>)
            : {}),
          ...customFieldValues,
        },
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: leadSnap ? existingLead.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const existingChatSnap = await adminDb
      .collection("chats")
      .where("tenantId", "==", tenantId)
      .where("leadId", "==", leadRef.id)
      .where("channel", "==", "site_chat")
      .limit(1)
      .get();

    const publicAccessToken = randomUUID();
    const chatRef = existingChatSnap.empty ? adminDb.collection("chats").doc() : existingChatSnap.docs[0].ref;
    const chatPayload: Record<string, unknown> = {
      tenantId,
      leadId: leadRef.id,
      channel: "site_chat",
      sourceType: "site_chat_widget",
      sourceId: formId,
      contactName: nome || clean(existingLead.nome, 180) || "Lead",
      contactPhone: telefone || clean(existingLead.telefone, 40),
      contactEmail: email || clean(existingLead.email, 180),
      company: empresa || clean(existingLead.empresa, 180),
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
      phone: telefone || clean(existingLead.telefone, 40),
      leadId: leadRef.id,
      channel: "site_chat",
      name: nome || clean(existingLead.nome, 180) || "Lead",
      email: email || clean(existingLead.email, 180),
      company: empresa || clean(existingLead.empresa, 180),
    });

    if (mensagem) {
      const messageRef = await adminDb.collection("messages").add({
        chatId: chatRef.id,
        tenantId,
        leadId: leadRef.id,
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
        leadId: leadRef.id,
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
      leadId: leadRef.id,
      chatId: chatRef.id,
      token: publicAccessToken,
    });
  } catch (error) {
    console.error("Erro ao iniciar chat publico:", error);
    return NextResponse.json({ error: "Falha ao iniciar chat." }, { status: 500 });
  }
}

