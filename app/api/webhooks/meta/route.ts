import { after, NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  findMetaChannelForWebhook,
  fetchMetaConversationProfile,
  getMetaAdsChannelForLeadgen,
  getMetaChannelByVerifyToken,
  getMetaChannelForTenant,
  isMetaConversationChannelType,
  type MetaChannelConfig,
  type MetaConversationChannelType,
  type MetaWebhookChannelType,
} from "@/app/lib/server/meta-channel";
import { verifyMetaSignature } from "@/app/lib/server/whatsapp-channel";
import { getMetaEnv } from "@/app/lib/server/integration-oauth";
import { enqueueIncomingMessageJob, kickAiQueueNow, processAiJobNow, triggerAiQueueWorker } from "@/lib/server/ai/queue";
import { cacheInboundMessageMedia } from "@/lib/server/ai/multimodal";
import { upsertAiOperationalAlert } from "@/lib/server/ai/observability";
import { runLeadAutomations } from "@/lib/server/automations";
import { buildIncomingChatOperationalPatch, resolveFirstResponseSlaMinutes } from "@/lib/server/chat-operations";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { parseMetaSocialEvents } from "@/lib/server/social/meta";
import {
  getSocialAutomationContactState,
  getTenantSocialAutomationConfig,
  handleMetaSocialEvent,
  logSocialAutomationStatus,
  setSocialAutomationContactOptOut,
  shouldAutoReplyToDm,
} from "@/lib/server/social/service";
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

type ParsedMetaEvent = {
  eventId: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: number | null;
  messageType: string;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaDuration?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaSize?: number | null;
  mediaThumbnail?: string | null;
  contactPhotoUrl?: string | null;
};

type ParsedLeadgenEvent = {
  eventId: string;
  entryId: string;
  leadgenId: string;
  formId: string;
  pageId: string;
  campaignId: string;
  adId: string;
  adsetId: string;
  createdTime: string;
};

function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `meta_${Date.now()}`;
}

function cleanString(value: unknown, max = 320) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function buildAttachmentText(value: unknown) {
  const attachments = Array.isArray(value) ? value : [];
  const labels = attachments
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const type = cleanString((item as { type?: unknown }).type, 40).toLowerCase();
      if (!type) return "";
      if (type === "image") return "[Imagem recebida]";
      if (type === "audio") return "[Audio recebido]";
      if (type === "video") return "[Video recebido]";
      if (type === "file") return "[Arquivo recebido]";
      return `[${type} recebido]`;
    })
    .filter(Boolean);

  return labels.join(" ");
}

function normalizeMetaMessageType(message: Record<string, unknown>) {
  if (cleanString(message.text, 1500)) return "text";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = attachments[0];
  const raw = first && typeof first === "object" ? cleanString((first as { type?: unknown }).type, 40).toLowerCase() : "";
  if (raw === "image") return "image";
  if (raw === "audio") return "audio";
  if (raw === "video") return "video";
  if (raw === "file") return "document";
  return "text";
}

function extractMetaAttachmentMeta(message: Record<string, unknown>) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = attachments[0];
  const attachment = first && typeof first === "object" ? (first as Record<string, unknown>) : {};
  const payload =
    attachment.payload && typeof attachment.payload === "object"
      ? (attachment.payload as Record<string, unknown>)
      : {};

  const type = normalizeMetaMessageType(message);
  return {
    type,
    mediaUrl: cleanString(payload.url, 1200) || null,
    mediaName: cleanString(attachment.title, 160) || cleanString(payload.title, 160) || null,
    mediaMimeType: cleanString(payload.mime_type, 120) || null,
    mediaDuration:
      cleanNumber(payload.duration_ms) ??
      cleanNumber(payload.duration) ??
      cleanNumber(attachment.duration_ms) ??
      cleanNumber(attachment.duration),
    mediaWidth: cleanNumber(payload.width) ?? cleanNumber(attachment.width),
    mediaHeight: cleanNumber(payload.height) ?? cleanNumber(attachment.height),
    mediaSize: cleanNumber(payload.file_size) ?? cleanNumber(attachment.file_size),
    mediaThumbnail: cleanString(payload.preview_url, 1200) || null,
  };
}

function extractMetaProfilePhoto(
  event: Record<string, unknown>,
  sender: Record<string, unknown>,
  recipient: Record<string, unknown>
) {
  return (
    cleanString(sender.profile_pic_url, 1200) ||
    cleanString(sender.profile_pic, 1200) ||
    cleanString(sender.avatar_url, 1200) ||
    cleanString(recipient.profile_pic_url, 1200) ||
    cleanString(
      event.contact && typeof event.contact === "object"
        ? (event.contact as Record<string, unknown>).profile_pic_url
        : "",
      1200
    ) ||
    null
  );
}

function extractTextFromMessage(message: Record<string, unknown>) {
  return cleanString(message.text, 1500) || buildAttachmentText(message.attachments);
}

function parseMetaEvents(body: Record<string, unknown>) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const parsed: Array<ParsedMetaEvent & { entryId: string }> = [];

  for (const entryRaw of entries) {
    const entry = entryRaw && typeof entryRaw === "object" ? (entryRaw as Record<string, unknown>) : {};
    const entryId = cleanString(entry.id, 180);
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const eventRaw of messaging) {
      const event = eventRaw && typeof eventRaw === "object" ? (eventRaw as Record<string, unknown>) : {};
      const message =
        event.message && typeof event.message === "object"
          ? (event.message as Record<string, unknown>)
          : null;

      if (!message || message.is_echo === true) continue;

      const sender =
        event.sender && typeof event.sender === "object"
          ? (event.sender as Record<string, unknown>)
          : {};
      const recipient =
        event.recipient && typeof event.recipient === "object"
          ? (event.recipient as Record<string, unknown>)
          : {};

      const senderId = cleanString(sender.id, 180);
      const recipientId = cleanString(recipient.id, 180);
      const text = extractTextFromMessage(message);
      const messageId = cleanString(message.mid || message.id, 220);
      const mediaMeta = extractMetaAttachmentMeta(message);
      const contactPhotoUrl = extractMetaProfilePhoto(event, sender, recipient);
      const timestamp =
        typeof event.timestamp === "number"
          ? event.timestamp
          : typeof message.timestamp === "number"
            ? message.timestamp
            : null;

      if (!senderId || !recipientId || !text) continue;

      parsed.push({
        entryId,
        eventId: messageId || `${senderId}_${recipientId}_${timestamp || Date.now()}`,
        senderId,
        recipientId,
        text,
        timestamp,
        messageType: mediaMeta.type,
        mediaUrl: mediaMeta.mediaUrl,
        mediaName: mediaMeta.mediaName,
        mediaMimeType: mediaMeta.mediaMimeType,
        mediaDuration: mediaMeta.mediaDuration,
        mediaWidth: mediaMeta.mediaWidth,
        mediaHeight: mediaMeta.mediaHeight,
        mediaSize: mediaMeta.mediaSize,
        mediaThumbnail: mediaMeta.mediaThumbnail,
        contactPhotoUrl,
      });
    }
  }

  return parsed;
}

function parseLeadgenEvents(body: Record<string, unknown>) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const parsed: ParsedLeadgenEvent[] = [];

  for (const entryRaw of entries) {
    const entry = entryRaw && typeof entryRaw === "object" ? (entryRaw as Record<string, unknown>) : {};
    const entryId = cleanString(entry.id, 180);
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const changeRaw of changes) {
      const change =
        changeRaw && typeof changeRaw === "object" ? (changeRaw as Record<string, unknown>) : {};
      if (cleanString(change.field, 80).toLowerCase() !== "leadgen") continue;

      const value =
        change.value && typeof change.value === "object"
          ? (change.value as Record<string, unknown>)
          : {};
      const leadgenId = cleanString(value.leadgen_id, 180);
      const formId = cleanString(value.form_id, 180);
      const pageId = cleanString(value.page_id, 180) || entryId;
      const createdTime = cleanString(value.created_time, 120);

      if (!leadgenId || !pageId) continue;

      parsed.push({
        eventId: leadgenId,
        entryId,
        leadgenId,
        formId,
        pageId,
        campaignId: cleanString(value.campaign_id, 180),
        adId: cleanString(value.ad_id, 180),
        adsetId: cleanString(value.adgroup_id || value.adset_id, 180),
        createdTime,
      });
    }
  }

  return parsed;
}

function summarizeUnsupportedSocialChanges(body: Record<string, unknown>) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const items: string[] = [];

  for (const entryRaw of entries) {
    const entry = entryRaw && typeof entryRaw === "object" ? (entryRaw as Record<string, unknown>) : {};
    const entryId = cleanString(entry.id, 80);
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeRaw of changes) {
      const change = changeRaw && typeof changeRaw === "object" ? (changeRaw as Record<string, unknown>) : {};
      const field = cleanString(change.field, 80).toLowerCase();
      if (!field) continue;
      const value = change.value && typeof change.value === "object" ? (change.value as Record<string, unknown>) : {};
      const item = cleanString(value.item, 80).toLowerCase();
      const verb = cleanString(value.verb, 80).toLowerCase();
      items.push(`${entryId || "entry"}:${field}:${item || "item"}:${verb || "verb"}`);
      if (items.length >= 10) return items;
    }
  }

  return items;
}

function summarizeMetaWebhookBody(body: Record<string, unknown>) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  return entries.slice(0, 3).map((entryRaw) => {
    const entry = entryRaw && typeof entryRaw === "object" ? (entryRaw as Record<string, unknown>) : {};
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    return {
      entryId: cleanString(entry.id, 120),
      messagingCount: messaging.length,
      changeFields: changes
        .slice(0, 8)
        .map((changeRaw) => {
          const change = changeRaw && typeof changeRaw === "object" ? (changeRaw as Record<string, unknown>) : {};
          const value = change.value && typeof change.value === "object" ? (change.value as Record<string, unknown>) : {};
          return [
            cleanString(change.field, 60),
            cleanString(value.item, 60),
            cleanString(value.verb, 60),
          ].filter(Boolean).join(":");
        })
        .filter(Boolean),
    };
  });
}

async function signalUnsupportedSocialEvent(input: {
  tenantId: string;
  objectType: string;
  entryId: string;
  summary: string[];
}) {
  const detail = `Evento social nao suportado pela automacao atual. object=${input.objectType}, entry=${input.entryId || "n/a"}, detalhes=${input.summary.join(" | ") || "sem_detalhe"}`;

  await Promise.all([
    upsertAiOperationalAlert({
      tenantId: input.tenantId,
      type: "social_unsupported_event",
      scope: `social_${sanitizeId(input.objectType || "unknown", 60)}`,
      severity: "warning",
      title: "Webhook social recebido com evento nao suportado",
      detail: detail.slice(0, 320),
      reasonCode: "ignored_unsupported_social_event",
      source: "meta_webhook",
    }),
    adminDb.collection("social_automation_logs").add({
      tenantId: input.tenantId,
      channelType: input.objectType || "social",
      eventType: "unsupported_event",
      eventId: sanitizeId(`${input.entryId || "entry"}_${Date.now()}`, 180),
      status: "ignored_unsupported",
      reason: detail.slice(0, 300),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}

async function claimMetaWebhookEvent(input: {
  tenantId: string;
  channelType: MetaWebhookChannelType;
  eventId: string;
}) {
  const eventDocId = sanitizeId(`${input.tenantId}_${input.channelType}_${input.eventId}`, 220);
  const eventRef = adminDb.collection("meta_webhook_events").doc(eventDocId);

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) {
      tx.set(eventRef, {
        tenantId: input.tenantId,
        channelType: input.channelType,
        externalEventId: input.eventId,
        status: "claimed",
        attempts: 1,
        claimedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { shouldProcess: true, reason: "claimed_new" };
    }

    const data = snap.data() as { status?: string; claimedAt?: unknown };
    const status = cleanString(data.status, 40).toLowerCase();
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

    return { shouldProcess: true, reason: "reclaimed_stale" };
  });

  return {
    eventRef,
    shouldProcess: result.shouldProcess,
    reason: result.reason,
  };
}

async function fetchLeadgenDetails(accessToken: string, leadgenId: string) {
  const fields = [
    "created_time",
    "field_data",
    "form_id",
    "campaign_name",
    "campaign_id",
    "ad_id",
    "ad_name",
    "adgroup_id",
    "adgroup_name",
    "is_organic",
    "platform",
  ].join(",");
  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${leadgenId}?fields=${encodeURIComponent(fields)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Falha ao consultar lead da Meta.");
  }

  const fieldData = Array.isArray(payload.field_data) ? payload.field_data : [];
  const mapped = fieldData.reduce<Record<string, string>>((acc, item) => {
    const field =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const name = cleanString(field.name, 120).toLowerCase();
    const values = Array.isArray(field.values) ? field.values : [];
    const firstValue = values.length > 0 ? cleanString(values[0], 500) : "";
    if (name && firstValue) {
      acc[name] = firstValue;
    }
    return acc;
  }, {});

  const firstName = mapped.first_name || "";
  const lastName = mapped.last_name || "";
  const fullName = mapped.full_name || [firstName, lastName].filter(Boolean).join(" ");

  return {
    fullName: fullName || mapped.nome_completo || "",
    email: mapped.email || "",
    phone: mapped.phone_number || mapped.telefone || "",
    company: mapped.company_name || mapped.empresa || "",
    message: mapped.mensagem || mapped.message || "",
    formId: cleanString(payload.form_id, 180),
    campaignName: cleanString(payload.campaign_name, 180),
    campaignId: cleanString(payload.campaign_id, 180),
    adId: cleanString(payload.ad_id, 180),
    adName: cleanString(payload.ad_name, 180),
    adsetId: cleanString(payload.adgroup_id, 180),
    adsetName: cleanString(payload.adgroup_name, 180),
    platform: cleanString(payload.platform, 80).toLowerCase(),
    rawFields: mapped,
  };
}

async function resolveOwnerName(ownerId: string | null) {
  if (!ownerId) return null;
  const snap = await adminDb.collection("users").doc(ownerId).get();
  if (!snap.exists) return null;
  return cleanString((snap.data() as { name?: unknown }).name, 160) || null;
}

async function resolveLeadByExternalId(
  tenantId: string,
  channelType: MetaConversationChannelType,
  externalProfileId: string
) {
  const snap = await adminDb
    .collection("leads")
    .where("tenantId", "==", tenantId)
    .where("externalProfileId", "==", externalProfileId)
    .limit(1)
    .get();

  if (snap.empty) {
    return { leadId: null as string | null, ownerId: null as string | null };
  }

  const leadDoc = snap.docs[0];
  const leadData = leadDoc.data() as { ownerId?: unknown };
  return {
    leadId: leadDoc.id,
    ownerId: cleanString(leadData.ownerId, 180) || null,
    channel: channelType,
  };
}

function makeMetaContactName(channelType: MetaConversationChannelType, externalId: string) {
  const suffix = externalId.slice(-6) || externalId;
  return channelType === "instagram" ? `Instagram ${suffix}` : `Messenger ${suffix}`;
}

async function ensureLead(input: {
  tenantId: string;
  channelType: MetaConversationChannelType;
  externalProfileId: string;
  contactName: string;
}) {
  const existing = await resolveLeadByExternalId(input.tenantId, input.channelType, input.externalProfileId);
  if (existing.leadId) {
    return existing;
  }

  const leadRef = adminDb.collection("leads").doc();
  const inboundAssignee = await resolveInboundAssignment(input.tenantId, { channel: input.channelType, priority: "medium" });
  await leadRef.set({
    tenantId: input.tenantId,
    nome: input.contactName,
    origem: input.channelType === "instagram" ? "instagram_dm" : "facebook_messenger",
    channel: input.channelType,
    sourceType: input.channelType === "instagram" ? "instagram_dm" : "facebook_messenger",
    pipelineStage: "captado",
    stage: "captado",
    status: "novo",
    externalProfileId: input.externalProfileId,
    ownerId: inboundAssignee?.userId || null,
    owner: inboundAssignee?.name || null,
    score: null,
    heat: "frio",
    priority: "medium",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await leadRef.collection("events").add({
    type: "system",
    title: "Lead criado",
    detail: `Lead criado automaticamente a partir de ${input.channelType}.`,
    createdAt: FieldValue.serverTimestamp(),
  });

  await runLeadAutomations({
    tenantId: input.tenantId,
    trigger: "lead_created",
    leadId: leadRef.id,
    actorId: "meta_webhook",
    actorName: "Meta Webhook",
  });

  return { leadId: leadRef.id, ownerId: inboundAssignee?.userId || null };
}

async function upsertChatForMetaEvent(input: {
  tenantId: string;
  channelType: MetaConversationChannelType;
  channelId: string;
  channelExternalAccountId: string;
  contactExternalId: string;
  contactName: string;
  contactPhotoUrl?: string | null;
  ownerId: string | null;
  leadId: string | null;
  lastMessage: string;
  slaMinutes: number;
}) {
  const chatQuery = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("channel", "==", input.channelType)
    .where("contactExternalId", "==", input.contactExternalId)
    .limit(1)
    .get();

  if (chatQuery.empty) {
    const ownerName = await resolveOwnerName(input.ownerId);
    const newChat = await adminDb.collection("chats").add({
      tenantId: input.tenantId,
      channel: input.channelType,
      channelId: input.channelId,
      channelExternalAccountId: input.channelExternalAccountId,
      contactExternalId: input.contactExternalId,
      contactName: input.contactName,
      contactPhotoUrl: input.contactPhotoUrl || null,
      lastMessage: input.lastMessage,
      lastMessageTime: FieldValue.serverTimestamp(),
      ownerId: input.ownerId,
      ownerName,
      leadId: input.leadId,
      ...buildIncomingChatOperationalPatch({
        status: "open",
        assignedTo: input.ownerId,
        slaMinutes: input.slaMinutes,
      }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { chatId: newChat.id, ownerId: input.ownerId };
  }

  const chatDoc = chatQuery.docs[0];
  const chatData = chatDoc.data() as { ownerId?: unknown; assignedTo?: unknown; leadId?: unknown };
  const resolvedOwnerId =
    cleanString(chatData.ownerId, 180) || cleanString(chatData.assignedTo, 180) || input.ownerId || null;

  await chatDoc.ref.set(
    {
      tenantId: input.tenantId,
      channel: input.channelType,
      channelId: input.channelId,
      channelExternalAccountId: input.channelExternalAccountId,
      contactExternalId: input.contactExternalId,
      contactName: input.contactName,
      contactPhotoUrl: input.contactPhotoUrl || null,
      lastMessage: input.lastMessage,
      lastMessageTime: FieldValue.serverTimestamp(),
      ownerId: resolvedOwnerId,
      ownerName: await resolveOwnerName(resolvedOwnerId),
      leadId: cleanString(chatData.leadId, 180) || input.leadId,
      ...buildIncomingChatOperationalPatch({
        status: "open",
        assignedTo: resolvedOwnerId,
        slaMinutes: input.slaMinutes,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { chatId: chatDoc.id, ownerId: resolvedOwnerId };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }

  const globalVerifyToken = getMetaEnv().verifyToken;
  if (globalVerifyToken && token === globalVerifyToken) {
    return new Response(challenge, { status: 200 });
  }

  // Compatibilidade legada: permite tenants antigos com verify token por canal.
  const channel = await getMetaChannelByVerifyToken(token);
  if (!channel) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(req: Request) {
  let currentEventRef: DocumentReference | null = null;

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || req.headers.get("x-hub-signature");
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const objectType = cleanString(body.object, 40).toLowerCase();
    const parsedEvents = parseMetaEvents(body);
    const socialEvents = parseMetaSocialEvents(body);
    const leadgenEvents = parseLeadgenEvents(body);

    if (parsedEvents.length === 0 && socialEvents.length === 0 && leadgenEvents.length === 0) {
      const socialUnsupportedSummary = summarizeUnsupportedSocialChanges(body);
      console.info("Webhook Meta ignorado sem evento suportado.", {
        objectType,
        summary: summarizeMetaWebhookBody(body),
        unsupported: socialUnsupportedSummary,
      });
      const firstEntry =
        Array.isArray(body.entry) && body.entry[0] && typeof body.entry[0] === "object"
          ? (body.entry[0] as Record<string, unknown>)
          : {};
      const firstEntryId = cleanString(firstEntry.id, 180);
      if (socialUnsupportedSummary.length > 0 && (objectType === "instagram" || objectType === "page")) {
        const unsupportedResolved = await findMetaChannelForWebhook({
          objectType,
          entryId: firstEntryId,
          recipientId: "",
        });
        if (unsupportedResolved?.tenantId) {
          await signalUnsupportedSocialEvent({
            tenantId: unsupportedResolved.tenantId,
            objectType,
            entryId: firstEntryId,
            summary: socialUnsupportedSummary,
          });
        }
      }
      return NextResponse.json({ status: "ignored_no_message" });
    }

    const firstEvent = parsedEvents[0];
    const firstSocialEvent = socialEvents[0];
    const firstLeadgen = leadgenEvents[0];
    const resolved = firstEvent
      ? await findMetaChannelForWebhook({
          objectType,
          entryId: firstEvent.entryId,
          recipientId: firstEvent.recipientId,
        })
      : firstSocialEvent
        ? await findMetaChannelForWebhook({
            objectType,
            entryId: firstSocialEvent.entryId,
            recipientId: firstSocialEvent.actorId,
          })
      : await getMetaAdsChannelForLeadgen({
          entryId: firstLeadgen?.pageId,
          formId: firstLeadgen?.formId,
        });

    if (!resolved) {
      console.info("Webhook Meta ignorado por canal desconhecido.", {
        objectType,
        firstEvent: firstEvent
          ? {
              entryId: firstEvent.entryId,
              recipientId: firstEvent.recipientId,
              senderId: firstEvent.senderId,
              eventId: firstEvent.eventId,
            }
          : null,
        firstSocialEvent: firstSocialEvent
          ? {
              entryId: firstSocialEvent.entryId,
              actorId: firstSocialEvent.actorId,
              eventId: firstSocialEvent.eventId,
              eventType: firstSocialEvent.eventType,
            }
          : null,
        firstLeadgen: firstLeadgen
          ? {
              pageId: firstLeadgen.pageId,
              formId: firstLeadgen.formId,
              leadgenId: firstLeadgen.leadgenId,
            }
          : null,
      });
      return NextResponse.json({ status: "ignored_unknown_channel" });
    }

    const globalAppSecret = getMetaEnv().appSecret;
    const signatureSecret = globalAppSecret || resolved.appSecret || "";

    if (!signatureSecret) {
      console.error("Webhook Meta bloqueado: canal sem appSecret configurado.", {
        tenantId: resolved.tenantId,
        channelId: resolved.id,
        channelType: resolved.type,
      });
      return NextResponse.json({ error: "Canal sem segredo de assinatura configurado." }, { status: 503 });
    }

    if (!verifyMetaSignature(rawBody, signature, signatureSecret)) {
      console.warn("Webhook Meta com assinatura divergente; processando em modo tolerante.", {
        tenantId: resolved.tenantId,
        channelId: resolved.id,
        channelType: resolved.type,
        objectType,
        hasSignature: Boolean(signature),
        signaturePrefix: signature ? cleanString(signature.split("=", 1)[0], 20) : "",
      });
      await upsertAiOperationalAlert({
        tenantId: resolved.tenantId,
        type: "meta_webhook_signature_warning",
        scope: `meta_${sanitizeId(resolved.type, 40)}`,
        severity: "warning",
        title: "Webhook Meta recebido com assinatura divergente",
        detail: "A entrega foi aceita em modo tolerante para nao bloquear DMs, mas o App Secret/callback deve ser revisado.",
        reasonCode: "meta_signature_mismatch_tolerated",
        source: "meta_webhook",
      });
    }

    const processed: Array<Record<string, unknown>> = [];
    const socialConfigCache = new Map<string, Awaited<ReturnType<typeof getTenantSocialAutomationConfig>>>();

    async function getCachedSocialConfig(tenantId: string) {
      const cached = socialConfigCache.get(tenantId);
      if (cached) return cached;
      const config = await getTenantSocialAutomationConfig(tenantId);
      socialConfigCache.set(tenantId, config);
      return config;
    }

    for (const event of parsedEvents) {
      const resolvedConversationChannel = isMetaConversationChannelType(resolved.type)
        ? (resolved as MetaChannelConfig)
        : null;
      if (!resolvedConversationChannel) {
        continue;
      }

      const channel: MetaChannelConfig =
        (await getMetaChannelForTenant(resolvedConversationChannel.tenantId, resolvedConversationChannel.type, {
          channelId: resolvedConversationChannel.id,
          externalAccountId: event.recipientId,
          pageId: event.entryId,
        })) || resolvedConversationChannel;

      if (!channel || !isMetaConversationChannelType(channel.type)) {
        continue;
      }

      const claim = await claimMetaWebhookEvent({
        tenantId: channel.tenantId,
        channelType: channel.type,
        eventId: event.eventId,
      });

      if (!claim.shouldProcess) {
        continue;
      }

      currentEventRef = claim.eventRef;

      const profile = await fetchMetaConversationProfile({ channel, userId: event.senderId }).catch(() => null);
      const contactName =
        profile?.name ||
        profile?.username ||
        makeMetaContactName(channel.type, event.senderId);
      const contactPhotoUrl = event.contactPhotoUrl || profile?.photoUrl || null;
      const tenantSettings = await getTenantSettings(channel.tenantId);
      const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
      const lead = await ensureLead({
        tenantId: channel.tenantId,
        channelType: channel.type,
        externalProfileId: event.senderId,
        contactName,
      });
      if (lead.leadId && !lead.ownerId) {
        const inboundAssignee = await resolveInboundAssignment(channel.tenantId, { channel: channel.type, priority: "medium" });
        if (inboundAssignee) {
          lead.ownerId = inboundAssignee.userId;
          await adminDb.collection("leads").doc(lead.leadId).set(
            {
              ownerId: inboundAssignee.userId,
              owner: inboundAssignee.name,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      const chat = await upsertChatForMetaEvent({
        tenantId: channel.tenantId,
        channelType: channel.type,
        channelId: channel.id,
        channelExternalAccountId: channel.externalAccountId || channel.pageId || event.recipientId,
        contactExternalId: event.senderId,
        contactName,
        contactPhotoUrl,
        ownerId: lead.ownerId,
        leadId: lead.leadId,
        lastMessage: event.text,
        slaMinutes,
      });

      let leadEmail = "";
      let leadCompany = "";
      if (lead.leadId) {
        const leadSnap = await adminDb.collection("leads").doc(lead.leadId).get();
        if (leadSnap.exists) {
          const leadData = leadSnap.data() as { email?: unknown; empresa?: unknown; nome?: unknown };
          leadEmail = typeof leadData.email === "string" ? leadData.email.trim() : "";
          leadCompany = typeof leadData.empresa === "string" ? leadData.empresa.trim() : "";
          const currentLeadName = cleanString(leadData.nome, 180);
          if (
            (profile?.name || profile?.username) &&
            (!currentLeadName || /^(Instagram|Messenger)\s+\d+$/i.test(currentLeadName))
          ) {
            await leadSnap.ref.set(
              {
                nome: contactName,
                instagramUsername: channel.type === "instagram" ? profile?.username || "" : "",
                profilePhotoUrl: contactPhotoUrl || null,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      }

      await upsertContactProfile({
        tenantId: channel.tenantId,
        externalProfileId: event.senderId,
        leadId: lead.leadId,
        channel: channel.type,
        name: contactName,
        email: leadEmail,
        company: leadCompany,
        photoUrl: contactPhotoUrl,
      });

      const messageDocId = sanitizeId(
        `meta_in_${channel.tenantId}_${channel.type}_${event.eventId}`,
        240
      );
      const messageRef = adminDb.collection("messages").doc(messageDocId);

      await messageRef.set(
        {
          chatId: chat.chatId,
          tenantId: channel.tenantId,
          channel: channel.type,
          channelId: channel.id,
          text: event.text,
          sender: "client",
          type: event.messageType,
          ownerId: chat.ownerId,
          metaMessageId: event.eventId,
          mediaUrl: event.mediaUrl || null,
          mediaName: event.mediaName || null,
          mediaMimeType: event.mediaMimeType || null,
          mediaDuration: event.mediaDuration ?? null,
          mediaWidth: event.mediaWidth ?? null,
          mediaHeight: event.mediaHeight ?? null,
          mediaSize: event.mediaSize ?? null,
          mediaThumbnail: event.mediaThumbnail || null,
          source: "meta_webhook",
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (lead.leadId) {
        await runLeadAutomations({
          tenantId: channel.tenantId,
          trigger: "message_received",
          leadId: lead.leadId,
          chatId: chat.chatId,
          channel: channel.type,
          messageText: event.text,
          actorId: "meta_webhook",
          actorName: "Meta Webhook",
        });
      }

      const socialConfig = await getCachedSocialConfig(channel.tenantId);
      const contactState = await getSocialAutomationContactState(channel.tenantId, channel.type, event.senderId);
      const dmDecision = shouldAutoReplyToDm({
        config: socialConfig,
        text: event.text,
        senderId: event.senderId,
        channel,
        contactState,
      });

      if (dmDecision.shouldPersistOptOut) {
        await setSocialAutomationContactOptOut({
          tenantId: channel.tenantId,
          channelType: channel.type,
          actorId: event.senderId,
          actorName: contactName,
          optedOut: true,
          reason: event.text,
        });
      }

      await logSocialAutomationStatus({
        tenantId: channel.tenantId,
        channelType: channel.type,
        eventId: event.eventId,
        eventType: "dm",
        actorId: event.senderId,
        actorName: contactName,
        text: event.text,
        status: dmDecision.reason,
        reason:
          dmDecision.reason === "processed"
            ? "DM encaminhada para fila de IA."
            : dmDecision.reason === "ignored_opt_out"
              ? "DM sem resposta automatica por opt-out."
              : dmDecision.reason === "ignored_inactive_hours"
                ? "DM fora da janela ativa configurada."
                : dmDecision.reason === "ignored_loop"
                  ? "DM ignorada por anti-loop."
                  : "DM sem auto reply pela configuracao.",
        leadId: lead.leadId,
        chatId: chat.chatId,
      });

      if (!dmDecision.allowed) {
        await claim.eventRef.set(
          {
            status: "processed",
            tenantId: channel.tenantId,
            channelType: channel.type,
            chatId: chat.chatId,
            leadId: lead.leadId,
            messageDocId: messageRef.id,
            queueStatus: "skipped_social_automation",
            processedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        processed.push({
          tenantId: channel.tenantId,
          channel: channel.type,
          chatId: chat.chatId,
          messageId: messageRef.id,
          socialStatus: dmDecision.reason,
        });
        continue;
      }

      const queue = await enqueueIncomingMessageJob({
        tenantId: channel.tenantId,
        chatId: chat.chatId,
        messageId: messageRef.id,
        source: `webhook_${channel.type}`,
        dedupeKey: `${channel.tenantId}_${messageRef.id}`,
      });

      await processAiJobNow(queue.jobId);
      await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
      triggerAiQueueWorker({ limit: 8, drain: true });
      after(async () => {
        if (["audio", "image", "video", "document"].includes(String(event.messageType || "").toLowerCase())) {
          await cacheInboundMessageMedia({
            tenantId: channel.tenantId,
            chatId: chat.chatId,
            messageId: messageRef.id,
            message: {
              type: event.messageType,
              mediaUrl: event.mediaUrl || null,
              mediaName: event.mediaName || null,
              mediaMimeType: event.mediaMimeType || null,
              mediaDuration: event.mediaDuration ?? null,
              mediaWidth: event.mediaWidth ?? null,
              mediaHeight: event.mediaHeight ?? null,
              mediaSize: event.mediaSize ?? null,
            },
          }).catch((error) => {
            console.error("Falha ao cachear midia inbound da Meta:", error);
          });
        }
        await processAiJobNow(queue.jobId);
        await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
        triggerAiQueueWorker({ limit: 8, drain: true });
      });

      await claim.eventRef.set(
        {
          status: "processed",
          tenantId: channel.tenantId,
          channelType: channel.type,
          chatId: chat.chatId,
          leadId: lead.leadId,
          messageDocId: messageRef.id,
          queueJobId: queue.jobId,
          queueCreated: queue.created,
          queueStatus: queue.status,
          processedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      processed.push({
        tenantId: channel.tenantId,
        channel: channel.type,
        chatId: chat.chatId,
        messageId: messageRef.id,
      });
    }

    for (const event of socialEvents) {
      const channel = await getMetaChannelForTenant(resolved.tenantId, event.channelType, {
        channelId: resolved.id,
        externalAccountId: resolved.externalAccountId || event.entryId,
        pageId: event.entryId,
      });

      if (!channel || channel.type !== event.channelType) {
        continue;
      }

      try {
        const socialResult = await handleMetaSocialEvent({
          tenantId: channel.tenantId,
          channel,
          event,
        });

        processed.push({
          tenantId: channel.tenantId,
          channel: channel.type,
          socialEventType: event.eventType,
          eventId: event.eventId,
          status: socialResult.status,
          leadId: "leadId" in socialResult ? socialResult.leadId : null,
          chatId: "chatId" in socialResult ? socialResult.chatId : null,
        });
      } catch (error) {
        await upsertAiOperationalAlert({
          tenantId: channel.tenantId,
          type: "social_automation_failure",
          scope: `social_${sanitizeId(event.eventType, 60)}`,
          severity: "high",
          title: "Falha ao processar evento social da Meta",
          detail: `event=${event.eventType}, channel=${channel.type}, eventId=${event.eventId}, erro=${error instanceof Error ? cleanString(error.message, 200) : "erro_desconhecido"}`,
          reasonCode: "social_automation_failed",
          source: "meta_webhook",
        });
        console.error("Erro ao processar evento social da Meta:", {
          tenantId: channel.tenantId,
          channelType: channel.type,
          eventType: event.eventType,
          eventId: event.eventId,
          error,
        });
      }
    }

    for (const event of leadgenEvents) {
      const channel = await getMetaAdsChannelForLeadgen({
        entryId: event.pageId,
        formId: event.formId,
      });

      if (!channel || channel.type !== "meta_ads") {
        continue;
      }

      const claim = await claimMetaWebhookEvent({
        tenantId: channel.tenantId,
        channelType: "meta_ads",
        eventId: event.eventId,
      });

      if (!claim.shouldProcess) {
        continue;
      }

      currentEventRef = claim.eventRef;

      const details = await fetchLeadgenDetails(channel.accessToken, event.leadgenId);
      const attributionSource =
        details.platform === "facebook" ? "facebook_ads" : "meta_ads";

      const lead = await recordInboundLead({
        tenantId: channel.tenantId,
        sourceType: "meta_lead_ads",
        sourceId: event.leadgenId,
        sourceLabel: channel.displayName || "Meta Ads",
        channel: "meta_ads",
        nome: details.fullName,
        email: details.email,
        telefone: details.phone,
        empresa: details.company,
        mensagem: details.message,
        tags: ["meta_ads", event.formId ? "leadgen_form" : ""],
        attribution: {
          source: attributionSource,
          medium: "paid_social",
          campaign: details.campaignName,
          campaignId: details.campaignId || event.campaignId,
          adId: details.adId || event.adId,
          adsetId: details.adsetId || event.adsetId,
          formId: details.formId || event.formId,
          formName: `Lead Form ${details.formId || event.formId || ""}`.trim(),
        },
        notes: [
          details.adName ? `Ad: ${details.adName}` : "",
          details.adsetName ? `Adset: ${details.adsetName}` : "",
          event.createdTime ? `Leadgen criado em: ${event.createdTime}` : "",
        ].filter(Boolean),
        submission: {
          formId: details.formId || event.formId || event.leadgenId,
          formName: `Meta Lead Form ${details.formId || event.formId || ""}`.trim(),
          sourceLabel: channel.displayName || "Meta Ads",
          utmSource: attributionSource,
          utmMedium: "paid_social",
          utmCampaign: details.campaignName,
        },
        automationActorId: "meta_leadgen_webhook",
        automationActorName: "Meta Leadgen Webhook",
      });

      const dateRef = new Date().toISOString().slice(0, 10);
      const snapshotRef = adminDb
        .collection("campaign_snapshots")
        .doc(`${channel.tenantId}_${channel.id}_${dateRef}`);

      await Promise.all([
        snapshotRef.set(
          {
            tenantId: channel.tenantId,
            clientId: channel.tenantId,
            adAccountId: channel.id,
            channelId: channel.id,
            platform: "meta_ads",
            dateRef,
            campaignId: details.campaignId || event.campaignId,
            campaignName: details.campaignName,
            leads: FieldValue.increment(1),
            source: "webhook",
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        claim.eventRef.set(
          {
            status: "processed",
            tenantId: channel.tenantId,
            channelType: "meta_ads",
            leadId: lead.leadId,
            sourceId: event.leadgenId,
            processedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      processed.push({
        tenantId: channel.tenantId,
        channel: "meta_ads",
        leadId: lead.leadId,
        sourceId: event.leadgenId,
      });
    }

    return NextResponse.json({
      status: processed.length > 0 ? "ok" : "ignored",
      processed,
    });
  } catch (error) {
    if (currentEventRef) {
      await currentEventRef.set(
        {
          status: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 300) : "Erro desconhecido.",
          failedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    console.error("Erro no webhook Meta omnichannel:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

