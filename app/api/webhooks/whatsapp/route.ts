import { after, NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  extractWebhookPhoneNumberId,
  getWhatsAppChannelByPhoneNumberId,
  getWhatsAppChannelByVerifyToken,
  verifyMetaSignature,
} from "@/app/lib/server/whatsapp-channel";
import { normalizePhone } from "@/app/lib/server/phone";
import { enqueueIncomingMessageJob, kickAiQueueNow, triggerAiQueueWorker } from "@/lib/server/ai/queue";
import { cacheInboundMessageMedia } from "@/lib/server/ai/multimodal";
import { runLeadAutomations } from "@/lib/server/automations";
import { buildIncomingChatOperationalPatch, resolveFirstResponseSlaMinutes } from "@/lib/server/chat-operations";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";

function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `evt_${Date.now()}`;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function normalizeInboundMessageType(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (["audio", "image", "video", "document", "sticker", "location", "contact", "interactive", "template", "text"].includes(raw)) {
    return raw;
  }
  return "text";
}

function buildWhatsappMediaText(message: Record<string, unknown>, fallbackText: string) {
  if (fallbackText) return fallbackText;
  const type = normalizeInboundMessageType(message.type);
  if (type === "audio") return "[Audio recebido]";
  if (type === "image") return "[Imagem recebida]";
  if (type === "video") return "[Video recebido]";
  if (type === "document") return "[Arquivo recebido]";
  if (type === "sticker") return "[Sticker recebido]";
  if (type === "location") return "[Localizacao recebida]";
  return "";
}

function extractWhatsappMediaMeta(message: Record<string, unknown>) {
  const type = normalizeInboundMessageType(message.type);
  const payload =
    type !== "text" && message[type] && typeof message[type] === "object"
      ? (message[type] as Record<string, unknown>)
      : {};

  return {
    type,
    text: buildWhatsappMediaText(message, String((message as { text?: { body?: unknown } }).text?.body || "").trim()),
    mediaUrl: "",
    mediaName: String(payload.filename || payload.caption || "").trim() || null,
    mediaMimeType: String(payload.mime_type || "").trim() || null,
    mediaDuration: typeof payload.voice === "boolean" ? null : null,
    mediaWidth: null as number | null,
    mediaHeight: null as number | null,
    mediaThumbnail: null as string | null,
    mediaId: String(payload.id || "").trim() || null,
  };
}

async function resolveLeadOwner(phone: string, tenantId: string) {
  const scopedSnap = await adminDb
    .collection("leads")
    .where("telefone", "==", phone)
    .where("tenantId", "==", tenantId)
    .limit(1)
    .get();

  if (!scopedSnap.empty) {
    const leadDoc = scopedSnap.docs[0];
    const leadData = leadDoc.data() as { ownerId?: string; tenantId?: string };
    return {
      ownerId: leadData.ownerId || null,
      leadId: leadDoc.id,
      tenantId: leadData.tenantId || tenantId,
    };
  }

  if (tenantId === "ALTUM_AGENCY") {
    const legacySnap = await adminDb
      .collection("leads")
      .where("telefone", "==", phone)
      .limit(1)
      .get();

    if (!legacySnap.empty) {
      const leadDoc = legacySnap.docs[0];
      const leadData = leadDoc.data() as { ownerId?: string; tenantId?: string };
      return {
        ownerId: leadData.ownerId || null,
        leadId: leadDoc.id,
        tenantId: leadData.tenantId || tenantId,
      };
    }
  }

  return {
    ownerId: null as string | null,
    leadId: null as string | null,
    tenantId,
  };
}

async function resolveOwnerName(ownerId: string | null) {
  if (!ownerId) return null;
  const userSnap = await adminDb.collection("users").doc(ownerId).get();
  if (!userSnap.exists) return null;
  const userData = userSnap.data() as { name?: string };
  return userData.name || null;
}

async function claimWebhookEvent(input: {
  tenantId: string;
  phoneNumberId: string;
  metaMessageId: string;
}) {
  const metaMessageId = input.metaMessageId.trim();
  if (!metaMessageId) {
    return {
      shouldProcess: true,
      eventRef: null as DocumentReference | null,
      reason: "missing_meta_message_id",
    };
  }

  const eventId = sanitizeId(`${input.tenantId}_${input.phoneNumberId}_${metaMessageId}`, 220);
  const eventRef = adminDb.collection("whatsapp_webhook_events").doc(eventId);

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) {
      tx.set(eventRef, {
        tenantId: input.tenantId,
        phoneNumberId: input.phoneNumberId,
        metaMessageId,
        status: "claimed",
        attempts: 1,
        claimedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { shouldProcess: true, reason: "claimed_new" };
    }

    const data = snap.data() as {
      status?: string;
      claimedAt?: unknown;
    };

    const status = String(data.status || "").toLowerCase();
    const claimedAt = toDate(data.claimedAt);
    const isClaimStale = !claimedAt || Date.now() - claimedAt.getTime() > 5 * 60_000;

    if (status === "processed") {
      return { shouldProcess: false, reason: "duplicate_processed" };
    }

    if (status === "claimed" && !isClaimStale) {
      return { shouldProcess: false, reason: "duplicate_claimed" };
    }

    tx.set(
      eventRef,
      {
        status: "claimed",
        attempts: FieldValue.increment(1),
        claimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { shouldProcess: true, reason: status === "failed" ? "reclaimed_failed" : "reclaimed_stale" };
  });

  return {
    shouldProcess: result.shouldProcess,
    eventRef,
    reason: result.reason,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }

  const channel = await getWhatsAppChannelByVerifyToken(token);
  if (!channel) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(req: Request) {
  let eventRef: DocumentReference | null = null;

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const phoneNumberId = extractWebhookPhoneNumberId(body);
    if (!phoneNumberId) {
      return NextResponse.json({ status: "ignored_no_phone_number_id" });
    }

    const channel = await getWhatsAppChannelByPhoneNumberId(phoneNumberId);
    if (!channel) {
      return NextResponse.json({ status: "ignored_unknown_channel" });
    }

    if (!verifyMetaSignature(rawBody, signature, channel.appSecret)) {
      return NextResponse.json({ error: "Assinatura invalida." }, { status: 401 });
    }

    const entry = Array.isArray(body.entry)
      ? ((body.entry[0] as Record<string, unknown> | undefined) ?? undefined)
      : undefined;
    const changes = entry && Array.isArray(entry.changes)
      ? (entry.changes as Array<Record<string, unknown>>)
      : [];
    const firstChange = changes[0];
    const valueObj =
      firstChange &&
      typeof firstChange.value === "object" &&
      firstChange.value
        ? (firstChange.value as Record<string, unknown>)
        : undefined;
    const message = Array.isArray(valueObj?.messages)
      ? (valueObj.messages[0] as Record<string, unknown> | undefined)
      : undefined;

    if (!message || typeof message !== "object") {
      return NextResponse.json({ status: "ignored_no_message" });
    }

    const tenantId = channel.tenantId;
    const tenantSettings = await getTenantSettings(tenantId);
    const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
    const inboundMetaMessageId = String((message as { id?: unknown }).id || "").trim();

    const claim = await claimWebhookEvent({
      tenantId,
      phoneNumberId: channel.phoneNumberId,
      metaMessageId: inboundMetaMessageId,
    });

    if (!claim.shouldProcess) {
      return NextResponse.json({
        status: "ignored_duplicate_message",
        reason: claim.reason,
        tenantId,
        phoneNumberId: channel.phoneNumberId,
      });
    }

    eventRef = claim.eventRef;

    const from = normalizePhone(String((message as { from?: unknown }).from || ""));
    const mediaMeta = extractWhatsappMediaMeta(message);
    const text = mediaMeta.text;
    const contactName =
      String(
        (valueObj as { contacts?: Array<{ profile?: { name?: unknown } }> } | undefined)?.contacts?.[0]
          ?.profile?.name || ""
      ) ||
      from ||
      "Contato";

    if (!from) {
      return NextResponse.json({ status: "ignored_invalid_phone" });
    }

    const ownerFromLead = await resolveLeadOwner(from, tenantId);
    let resolvedLeadId = ownerFromLead.leadId;
    let resolvedOwnerId = ownerFromLead.ownerId;
    let resolvedOwnerName = await resolveOwnerName(resolvedOwnerId);

    if (!resolvedLeadId) {
      const inboundAssignee = await resolveInboundAssignment(tenantId, { channel: "whatsapp", priority: "medium" });
      const intake = await recordInboundLead({
        tenantId,
        sourceType: "whatsapp_inbound",
        sourceId: `whatsapp_${from}`,
        sourceLabel: "WhatsApp",
        channel: "whatsapp",
        nome: contactName,
        telefone: from,
        mensagem: text,
        tags: ["whatsapp", "inbound"],
        defaultOwnerId: inboundAssignee?.userId || null,
        defaultOwnerName: inboundAssignee?.name || null,
        automationActorId: "whatsapp_webhook",
        automationActorName: "WhatsApp Webhook",
      });

      resolvedLeadId = intake.leadId;
      resolvedOwnerId = inboundAssignee?.userId || null;
      resolvedOwnerName = inboundAssignee?.name || null;
    } else if (!resolvedOwnerId) {
      const inboundAssignee = await resolveInboundAssignment(tenantId, { channel: "whatsapp", priority: "medium" });
      if (inboundAssignee) {
        resolvedOwnerId = inboundAssignee.userId;
        resolvedOwnerName = inboundAssignee.name;

        await adminDb.collection("leads").doc(resolvedLeadId).set(
          {
            ownerId: inboundAssignee.userId,
            owner: inboundAssignee.name,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    const chatsRef = adminDb.collection("chats");
    const chatQuery = await chatsRef
      .where("contactPhone", "==", from)
      .where("tenantId", "==", tenantId)
      .limit(1)
      .get();

    let chatId: string;
    let currentOwnerId = resolvedOwnerId;

    if (chatQuery.empty) {
      const newChat = await chatsRef.add({
        contactName,
        contactPhone: from,
        contactPhoneNormalized: from,
        channel: "whatsapp",
        lastMessage: text,
        lastMessageTime: FieldValue.serverTimestamp(),
        ownerId: resolvedOwnerId,
        ownerName: resolvedOwnerName,
        assignedUserName: resolvedOwnerName,
        leadId: resolvedLeadId,
        tenantId,
        channelPhoneNumberId: channel.phoneNumberId,
        ...buildIncomingChatOperationalPatch({
          status: "open",
          assignedTo: resolvedOwnerId,
          slaMinutes,
        }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      chatId = newChat.id;
    } else {
      const chatDoc = chatQuery.docs[0];
      const chatData = chatDoc.data() as {
        ownerId?: string;
        leadId?: string;
        assignedTo?: string;
      };

      chatId = chatDoc.id;
      currentOwnerId = chatData.ownerId || chatData.assignedTo || resolvedOwnerId;

      await chatDoc.ref.set(
        {
          contactName,
          channel: "whatsapp",
          lastMessage: text,
          lastMessageTime: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ownerId: currentOwnerId,
          ownerName: currentOwnerId ? await resolveOwnerName(currentOwnerId) : null,
          assignedUserName: currentOwnerId ? await resolveOwnerName(currentOwnerId) : null,
          leadId: chatData.leadId || resolvedLeadId,
          tenantId,
          channelPhoneNumberId: channel.phoneNumberId,
          ...buildIncomingChatOperationalPatch({
            status: "open",
            assignedTo: currentOwnerId,
            slaMinutes,
          }),
        },
        { merge: true }
      );
    }

    let leadEmail = "";
    let leadCompany = "";
    if (resolvedLeadId) {
      const leadSnap = await adminDb.collection("leads").doc(resolvedLeadId).get();
      if (leadSnap.exists) {
        const leadData = leadSnap.data() as { email?: unknown; empresa?: unknown };
        leadEmail = typeof leadData.email === "string" ? leadData.email.trim() : "";
        leadCompany = typeof leadData.empresa === "string" ? leadData.empresa.trim() : "";
      }
    }

    await upsertContactProfile({
      tenantId,
      phone: from,
      leadId: resolvedLeadId,
      channel: "whatsapp",
      name: contactName,
      email: leadEmail,
      company: leadCompany,
    });

    let incomingMessageRef: DocumentReference;

    if (inboundMetaMessageId) {
      const inboundDocId = sanitizeId(`in_${tenantId}_${channel.phoneNumberId}_${inboundMetaMessageId}`, 240);
      incomingMessageRef = adminDb.collection("messages").doc(inboundDocId);

      await incomingMessageRef.set(
        {
          chatId,
          text,
          sender: "client",
          type: mediaMeta.type,
          ownerId: currentOwnerId,
          tenantId,
          channelPhoneNumberId: channel.phoneNumberId,
          inboundMetaMessageId,
          source: "whatsapp_webhook",
          mediaUrl: mediaMeta.mediaUrl,
          mediaName: mediaMeta.mediaName,
          mediaMimeType: mediaMeta.mediaMimeType,
          mediaDuration: mediaMeta.mediaDuration,
          mediaWidth: mediaMeta.mediaWidth,
          mediaHeight: mediaMeta.mediaHeight,
          mediaThumbnail: mediaMeta.mediaThumbnail,
          mediaId: mediaMeta.mediaId,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      incomingMessageRef = await adminDb.collection("messages").add({
        chatId,
        text,
        sender: "client",
        type: mediaMeta.type,
        ownerId: currentOwnerId,
        tenantId,
        channelPhoneNumberId: channel.phoneNumberId,
        source: "whatsapp_webhook",
        mediaUrl: mediaMeta.mediaUrl,
        mediaName: mediaMeta.mediaName,
        mediaMimeType: mediaMeta.mediaMimeType,
        mediaDuration: mediaMeta.mediaDuration,
        mediaWidth: mediaMeta.mediaWidth,
        mediaHeight: mediaMeta.mediaHeight,
        mediaThumbnail: mediaMeta.mediaThumbnail,
        mediaId: mediaMeta.mediaId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (resolvedLeadId) {
      await runLeadAutomations({
        tenantId,
        trigger: "message_received",
        leadId: resolvedLeadId,
        chatId,
        channel: "whatsapp",
        messageText: text,
        actorId: "whatsapp_webhook",
        actorName: "WhatsApp Webhook",
      });
    }

    const queue = await enqueueIncomingMessageJob({
      tenantId,
      chatId,
      messageId: incomingMessageRef.id,
      source: "webhook_whatsapp",
      dedupeKey: `${tenantId}_${incomingMessageRef.id}`,
    });

    await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
    triggerAiQueueWorker({ limit: 8, drain: true });
    after(async () => {
      if (["audio", "image", "video", "document"].includes(String(mediaMeta.type || "").toLowerCase())) {
        await cacheInboundMessageMedia({
          tenantId,
          chatId,
          messageId: incomingMessageRef.id,
          message: {
            type: mediaMeta.type,
            mediaUrl: mediaMeta.mediaUrl,
            mediaName: mediaMeta.mediaName,
            mediaMimeType: mediaMeta.mediaMimeType,
            mediaId: mediaMeta.mediaId,
            channelPhoneNumberId: channel.phoneNumberId,
          },
        }).catch((error) => {
          console.error("Falha ao cachear midia inbound do WhatsApp:", error);
        });
      }
      await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
      triggerAiQueueWorker({ limit: 8, drain: true });
    });

    if (eventRef) {
      await eventRef.set(
        {
          status: "processed",
          chatId,
          tenantId,
          messageDocId: incomingMessageRef.id,
          queueJobId: queue.jobId,
          queueCreated: queue.created,
          queueStatus: queue.status,
          processedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      status: "ok",
      chatId,
      tenantId,
      phoneNumberId: channel.phoneNumberId,
      queueJobId: queue.jobId,
      queueCreated: queue.created,
    });
  } catch (error) {
    if (eventRef) {
      await eventRef.set(
        {
          status: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 300) : "Erro desconhecido.",
          failedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    console.error("Erro no webhook WhatsApp:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}


