import { after, NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  extractWebhookPhoneNumberId,
  getWhatsAppChannelById,
  getWhatsAppChannelByPhoneNumberId,
  getWhatsAppChannelByVerifyToken,
  verifyMetaSignature,
} from "@/app/lib/server/whatsapp-channel";
import { normalizePhone } from "@/app/lib/server/phone";
import { enqueueIncomingMessageJob, kickAiQueueNow, processAiJobNow, triggerAiQueueWorker } from "@/lib/server/ai/queue";
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

function cleanString(value: unknown, max = 320) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeOptOutText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWhatsAppOptOutMessage(value: string) {
  const text = normalizeOptOutText(value);
  if (!text) return false;
  if (["parar", "stop", "sair", "cancelar", "remover", "descadastrar"].includes(text)) return true;
  return [
    "parar de receber",
    "pare de mandar",
    "nao quero receber",
    "nao mandar mensagem",
    "remova meu contato",
    "remover meu contato",
    "tirar meu contato",
    "cancelar inscricao",
  ].some((phrase) => text.includes(phrase));
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    mediaMimeType: cleanString(payload.mime_type, 180) || null,
    mediaDuration: cleanNumber(payload.duration) ?? cleanNumber(payload.duration_ms),
    mediaWidth: cleanNumber(payload.width),
    mediaHeight: cleanNumber(payload.height),
    mediaSize: cleanNumber(payload.file_size),
    mediaThumbnail: null as string | null,
    mediaId: String(payload.id || "").trim() || null,
  };
}

function extractWhatsappProfilePhoto(valueObj: Record<string, unknown> | undefined) {
  const contacts = Array.isArray(valueObj?.contacts) ? valueObj.contacts : [];
  const firstContact = contacts[0] && typeof contacts[0] === "object" ? (contacts[0] as Record<string, unknown>) : {};
  const profile =
    firstContact.profile && typeof firstContact.profile === "object"
      ? (firstContact.profile as Record<string, unknown>)
      : {};

  return (
    cleanString(profile.photo_url, 1200) ||
    cleanString(profile.avatar_url, 1200) ||
    cleanString(profile.profile_pic_url, 1200) ||
    null
  );
}

type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

type ParsedWhatsAppStatusEvent = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  timestampMs: number | null;
  recipientId: string;
  errorCode: string;
  errorMessage: string;
};

function normalizeWhatsAppDeliveryStatus(value: unknown): WhatsAppDeliveryStatus | null {
  const normalized = cleanString(value, 40).toLowerCase();
  if (normalized === "sent" || normalized === "delivered" || normalized === "read" || normalized === "failed") {
    return normalized;
  }
  return null;
}

function parseWhatsAppTimestampMs(value: unknown) {
  const raw = cleanString(value, 40);
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  // Meta pode enviar em segundos.
  return numeric > 1_000_000_000_000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
}

function extractWhatsappStatusEvents(valueObj: Record<string, unknown> | undefined) {
  const statuses = Array.isArray(valueObj?.statuses) ? valueObj.statuses : [];
  return statuses
    .map((item) => {
      const statusEntry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const normalizedStatus = normalizeWhatsAppDeliveryStatus(statusEntry.status);
      const messageId = cleanString(statusEntry.id, 260);
      if (!normalizedStatus || !messageId) return null;

      const errors = Array.isArray(statusEntry.errors) ? statusEntry.errors : [];
      const firstError = errors[0] && typeof errors[0] === "object" ? (errors[0] as Record<string, unknown>) : {};

      return {
        messageId,
        status: normalizedStatus,
        timestampMs: parseWhatsAppTimestampMs(statusEntry.timestamp),
        recipientId: cleanString(statusEntry.recipient_id, 80),
        errorCode: cleanString(firstError.code, 80),
        errorMessage: cleanString(firstError.title, 240) || cleanString(firstError.message, 240),
      } satisfies ParsedWhatsAppStatusEvent;
    })
    .filter((item): item is ParsedWhatsAppStatusEvent => Boolean(item));
}

async function persistWhatsappStatusEvents(input: {
  tenantId: string;
  phoneNumberId: string;
  events: ParsedWhatsAppStatusEvent[];
}) {
  let matchedMessages = 0;
  let updatedChats = 0;

  for (const statusEvent of input.events) {
    const messageSnap = await adminDb
      .collection("messages")
      .where("metaMessageId", "==", statusEvent.messageId)
      .limit(20)
      .get();

    const matchingDocs = messageSnap.docs.filter((doc) => {
      const data = doc.data() as { tenantId?: unknown; sender?: unknown };
      return (
        cleanString(data.tenantId, 180) === input.tenantId &&
        cleanString(data.sender, 20).toLowerCase() !== "client"
      );
    });

    const deliveryAtDate = statusEvent.timestampMs ? new Date(statusEvent.timestampMs) : null;
    const batch = adminDb.batch();
    const touchedChatIds = new Set<string>();

    for (const messageDoc of matchingDocs) {
      const data = messageDoc.data() as { chatId?: unknown };
      const chatId = cleanString(data.chatId, 180);
      if (chatId) touchedChatIds.add(chatId);

      batch.set(
        messageDoc.ref,
        {
          status: statusEvent.status,
          deliveryStatus: statusEvent.status,
          deliveryUpdatedAt: FieldValue.serverTimestamp(),
          deliveryAt: deliveryAtDate || FieldValue.serverTimestamp(),
          deliveryError: statusEvent.errorMessage || "",
          deliveryErrorCode: statusEvent.errorCode || "",
          deliveryRecipientId: statusEvent.recipientId || "",
          channelPhoneNumberId: input.phoneNumberId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    for (const chatId of touchedChatIds) {
      batch.set(
        adminDb.collection("chats").doc(chatId),
        {
          lastOutboundDeliveryStatus: statusEvent.status,
          lastOutboundDeliveryAt: deliveryAtDate || FieldValue.serverTimestamp(),
          lastOutboundMetaMessageId: statusEvent.messageId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      updatedChats += 1;
    }

    const deliverySnap = await adminDb
      .collection("outbound_campaign_deliveries")
      .where("tenantId", "==", input.tenantId)
      .where("metaMessageId", "==", statusEvent.messageId)
      .limit(20)
      .get();

    for (const deliveryDoc of deliverySnap.docs) {
      batch.set(
        deliveryDoc.ref,
        {
          status: statusEvent.status,
          deliveryStatus: statusEvent.status,
          deliveryUpdatedAt: FieldValue.serverTimestamp(),
          deliveryAt: deliveryAtDate || FieldValue.serverTimestamp(),
          deliveryError: statusEvent.errorMessage || "",
          deliveryErrorCode: statusEvent.errorCode || "",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const eventDocId = sanitizeId(
      `${input.tenantId}_${input.phoneNumberId}_${statusEvent.messageId}_${statusEvent.status}_${statusEvent.timestampMs || Date.now()}`,
      240
    );
    batch.set(
      adminDb.collection("whatsapp_delivery_events").doc(eventDocId),
      {
        tenantId: input.tenantId,
        phoneNumberId: input.phoneNumberId,
        metaMessageId: statusEvent.messageId,
        status: statusEvent.status,
        recipientId: statusEvent.recipientId || "",
        errorCode: statusEvent.errorCode || "",
        errorMessage: statusEvent.errorMessage || "",
        deliveryAt: deliveryAtDate || null,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    matchedMessages += matchingDocs.length;
  }

  return {
    processedEvents: input.events.length,
    matchedMessages,
    updatedChats,
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

async function persistGenericWhatsAppInbound(input: {
  channel: NonNullable<Awaited<ReturnType<typeof getWhatsAppChannelById>>>;
  from: string;
  text: string;
  contactName?: string;
  messageId?: string;
  messageType?: string;
}) {
  const tenantId = input.channel.tenantId;
  const phoneNumberId = input.channel.phoneNumberId || input.channel.id;
  const from = normalizePhone(input.from);
  const text = cleanString(input.text, 4000);
  const contactName = cleanString(input.contactName, 180) || from || "Contato";
  const inboundMessageId = cleanString(input.messageId, 260) || `generic_${Date.now()}_${from}`;
  const messageType = normalizeInboundMessageType(input.messageType || "text");

  if (!from) {
    return { status: "ignored_invalid_phone" };
  }

  const tenantSettings = await getTenantSettings(tenantId);
  const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
  const claim = await claimWebhookEvent({ tenantId, phoneNumberId, metaMessageId: inboundMessageId });
  if (!claim.shouldProcess) {
    return {
      status: "ignored_duplicate_message",
      reason: claim.reason,
      tenantId,
      phoneNumberId,
    };
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
      sourceLabel: input.channel.displayName || "WhatsApp",
      channel: "whatsapp",
      nome: contactName,
      telefone: from,
      mensagem: text,
      tags: ["whatsapp", "inbound"],
      defaultOwnerId: inboundAssignee?.userId || null,
      defaultOwnerName: inboundAssignee?.name || null,
      automationActorId: "whatsapp_gateway",
      automationActorName: "WhatsApp Gateway",
    });
    resolvedLeadId = intake.leadId;
    resolvedOwnerId = inboundAssignee?.userId || null;
    resolvedOwnerName = inboundAssignee?.name || null;
  }

  const chatsRef = adminDb.collection("chats");
  const chatQuery = await chatsRef
    .where("contactPhone", "==", from)
    .where("tenantId", "==", tenantId)
    .limit(1)
    .get();

  let chatId = "";
  if (chatQuery.empty) {
    const newChat = await chatsRef.add({
      contactName,
      contactPhone: from,
      contactPhoneNormalized: from,
      channel: "whatsapp",
      channelId: input.channel.id,
      channelPhoneNumberId: phoneNumberId,
      lastMessage: text,
      lastMessageTime: FieldValue.serverTimestamp(),
      ownerId: resolvedOwnerId,
      ownerName: resolvedOwnerName,
      assignedUserName: resolvedOwnerName,
      leadId: resolvedLeadId,
      tenantId,
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
    const chatData = chatDoc.data() as { ownerId?: string; assignedTo?: string; leadId?: string };
    const currentOwnerId = chatData.ownerId || chatData.assignedTo || resolvedOwnerId;
    chatId = chatDoc.id;
    await chatDoc.ref.set(
      {
        contactName,
        channel: "whatsapp",
        channelId: input.channel.id,
        channelPhoneNumberId: phoneNumberId,
        lastMessage: text,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ownerId: currentOwnerId,
        ownerName: currentOwnerId ? await resolveOwnerName(currentOwnerId) : null,
        assignedUserName: currentOwnerId ? await resolveOwnerName(currentOwnerId) : null,
        leadId: chatData.leadId || resolvedLeadId,
        tenantId,
        ...buildIncomingChatOperationalPatch({
          status: "open",
          assignedTo: currentOwnerId,
          slaMinutes,
        }),
      },
      { merge: true }
    );
  }

  await upsertContactProfile({
    tenantId,
    phone: from,
    leadId: resolvedLeadId,
    channel: "whatsapp",
    name: contactName,
  });

  const incomingMessageRef = adminDb
    .collection("messages")
    .doc(sanitizeId(`in_${tenantId}_${phoneNumberId}_${inboundMessageId}`, 240));

  await incomingMessageRef.set(
    {
      chatId,
      text,
      sender: "client",
      type: messageType,
      tenantId,
      channel: "whatsapp",
      channelId: input.channel.id,
      channelPhoneNumberId: phoneNumberId,
      inboundMetaMessageId: inboundMessageId,
      source: "whatsapp_gateway",
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (resolvedLeadId) {
    await runLeadAutomations({
      tenantId,
      trigger: "message_received",
      leadId: resolvedLeadId,
      chatId,
      channel: "whatsapp",
      messageText: text,
      actorId: "whatsapp_gateway",
      actorName: "WhatsApp Gateway",
    });
  }

  const queue = await enqueueIncomingMessageJob({
    tenantId,
    chatId,
    messageId: incomingMessageRef.id,
    source: "webhook_whatsapp",
    dedupeKey: `${tenantId}_${incomingMessageRef.id}`,
  });

  await processAiJobNow(queue.jobId);
  triggerAiQueueWorker({ limit: 8, drain: true });

  return {
    status: "ok",
    tenantId,
    chatId,
    phoneNumberId,
    queueJobId: queue.jobId,
    queueCreated: queue.created,
  };
}

export async function POST(req: Request) {
  let eventRef: DocumentReference | null = null;

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const genericChannelId =
      cleanString(req.headers.get("x-altum-whatsapp-channel-id"), 180) ||
      cleanString(body.channelId, 180);
    if (genericChannelId) {
      const channel = await getWhatsAppChannelById(genericChannelId);
      if (!channel) {
        return NextResponse.json({ status: "ignored_unknown_channel" }, { status: 404 });
      }

      const authHeader = cleanString(req.headers.get("authorization"), 500);
      if (channel.accessToken && authHeader !== `Bearer ${channel.accessToken}`) {
        return NextResponse.json({ error: "Token do gateway invalido." }, { status: 401 });
      }

      const result = await persistGenericWhatsAppInbound({
        channel,
        from:
          cleanString(body.from, 80) ||
          cleanString(body.phone, 80) ||
          cleanString(body.contactPhone, 80) ||
          cleanString(body.to, 80),
        text:
          cleanString(body.text, 4000) ||
          cleanString((body.message as { text?: unknown } | undefined)?.text, 4000) ||
          cleanString((body.message as { body?: unknown } | undefined)?.body, 4000),
        contactName:
          cleanString(body.contactName, 180) ||
          cleanString(body.name, 180) ||
          cleanString((body.contact as { name?: unknown } | undefined)?.name, 180),
        messageId:
          cleanString(body.messageId, 260) ||
          cleanString(body.id, 260) ||
          cleanString((body.message as { id?: unknown } | undefined)?.id, 260),
        messageType: cleanString(body.type, 40) || cleanString((body.message as { type?: unknown } | undefined)?.type, 40),
      });

      return NextResponse.json(result);
    }

    const phoneNumberId = extractWebhookPhoneNumberId(body);
    if (!phoneNumberId) {
      return NextResponse.json({ status: "ignored_no_phone_number_id" });
    }

    const channel = await getWhatsAppChannelByPhoneNumberId(phoneNumberId);
    if (!channel) {
      return NextResponse.json({ status: "ignored_unknown_channel" });
    }

    if (!channel.appSecret) {
      console.error("Webhook WhatsApp bloqueado: canal sem appSecret configurado.", {
        tenantId: channel.tenantId,
        phoneNumberId: channel.phoneNumberId,
      });
      return NextResponse.json({ error: "Canal sem segredo de assinatura configurado." }, { status: 503 });
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
    const statusEvents = extractWhatsappStatusEvents(valueObj);

    if ((!message || typeof message !== "object") && statusEvents.length === 0) {
      return NextResponse.json({ status: "ignored_no_message" });
    }

    const tenantId = channel.tenantId;

    if (statusEvents.length > 0) {
      const result = await persistWhatsappStatusEvents({
        tenantId,
        phoneNumberId: channel.phoneNumberId,
        events: statusEvents,
      });

      if (!message || typeof message !== "object") {
        return NextResponse.json({
          status: "ok_status_update",
          tenantId,
          phoneNumberId: channel.phoneNumberId,
          processedEvents: result.processedEvents,
          matchedMessages: result.matchedMessages,
          updatedChats: result.updatedChats,
        });
      }
    }

    if (!message || typeof message !== "object") {
      return NextResponse.json({ status: "ignored_no_message" });
    }
    const inboundMessage = message as Record<string, unknown>;

    const tenantSettings = await getTenantSettings(tenantId);
    const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
    const inboundMetaMessageId = cleanString(inboundMessage.id, 260);

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

    const from = normalizePhone(cleanString(inboundMessage.from, 40));
    const mediaMeta = extractWhatsappMediaMeta(inboundMessage);
    const text = mediaMeta.text;
    const contactName =
      String(
        (valueObj as { contacts?: Array<{ profile?: { name?: unknown } }> } | undefined)?.contacts?.[0]
          ?.profile?.name || ""
      ) ||
      from ||
      "Contato";
    const contactPhotoUrl = extractWhatsappProfilePhoto(valueObj);

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
      photoUrl: contactPhotoUrl,
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
          mediaSize: mediaMeta.mediaSize,
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
        mediaSize: mediaMeta.mediaSize,
        mediaThumbnail: mediaMeta.mediaThumbnail,
        mediaId: mediaMeta.mediaId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (isWhatsAppOptOutMessage(text)) {
      const optOutPatch = {
        whatsappOptOut: true,
        marketingOptOut: true,
        doNotContact: true,
        optOutReason: "whatsapp_keyword",
        optOutKeywordText: text.slice(0, 180),
        optOutAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await Promise.all([
        resolvedLeadId
          ? adminDb.collection("leads").doc(resolvedLeadId).set(
              {
                ...optOutPatch,
                tags: FieldValue.arrayUnion("whatsapp_opt_out"),
              },
              { merge: true }
            )
          : Promise.resolve(),
        adminDb.collection("chats").doc(chatId).set(
          {
            ...optOutPatch,
            aiPaused: true,
            aiPausedReason: "Contato pediu para parar mensagens no WhatsApp.",
            status: "open",
          },
          { merge: true }
        ),
        resolvedLeadId
          ? adminDb.collection("lead_events").add({
              tenantId,
              leadId: resolvedLeadId,
              chatId,
              type: "whatsapp_opt_out",
              title: "Opt-out registrado pelo WhatsApp",
              detail: "Contato pediu para parar mensagens. IA e campanhas devem respeitar bloqueio.",
              createdAt: FieldValue.serverTimestamp(),
              actorId: "whatsapp_webhook",
              actorName: "WhatsApp Webhook",
            })
          : Promise.resolve(),
      ]);

      if (eventRef) {
        await eventRef.set(
          {
            status: "processed_opt_out",
            chatId,
            tenantId,
            messageDocId: incomingMessageRef.id,
            processedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return NextResponse.json({
        status: "ok_opt_out",
        chatId,
        tenantId,
        phoneNumberId: channel.phoneNumberId,
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

    await processAiJobNow(queue.jobId);
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
      await processAiJobNow(queue.jobId);
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


