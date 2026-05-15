import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { MetaChannelConfig, MetaConversationChannelType } from "@/app/lib/server/meta-channel";
import { sendMetaConversationText } from "@/app/lib/server/meta-channel";
import { getMetaChannelForTenant } from "@/app/lib/server/meta-channel";
import { runLeadAutomations } from "@/lib/server/automations";
import { buildIncomingChatOperationalPatch, resolveFirstResponseSlaMinutes } from "@/lib/server/chat-operations";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";
import {
  isWithinSocialActiveHours,
  normalizeTenantSocialAutomationConfig,
  textTriggersSocialOptOut,
  type TenantSocialAutomationConfig,
} from "@/lib/server/social/config";
import type { ParsedMetaSocialEvent } from "@/lib/server/social/meta";

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export type SocialLogStatus =
  | "claimed"
  | "retrying"
  | "processed"
  | "ignored_duplicate"
  | "ignored_loop"
  | "ignored_disabled"
  | "ignored_inactive_hours"
  | "ignored_opt_out"
  | "ignored_unsupported"
  | "sent"
  | "failed";

type SocialContactState = {
  optedOut: boolean;
};

type SocialIntentSignal = {
  tags: string[];
  highIntent: boolean;
  reasonLabel: string;
};

function cleanText(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toEpochMs(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "object" && value) {
    if ("toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().getTime();
    }
    if ("_seconds" in value && typeof (value as { _seconds?: unknown })._seconds === "number") {
      return (value as { _seconds: number })._seconds * 1000;
    }
    if ("seconds" in value && typeof (value as { seconds?: unknown }).seconds === "number") {
      return (value as { seconds: number }).seconds * 1000;
    }
  }
  return 0;
}

function isFirestoreMissingIndexError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "").toLowerCase();
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    code === "9" ||
    code === "failed-precondition" ||
    code.includes("failed-precondition") ||
    message.includes("requires an index")
  );
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `social_${Date.now()}`;
}

function buildSocialLogId(tenantId: string, channelType: string, eventId: string) {
  return sanitizeId(`${tenantId}_${channelType}_${eventId}`, 240);
}

function buildSocialContactId(tenantId: string, channelType: string, actorId: string) {
  return sanitizeId(`${tenantId}_${channelType}_${actorId}`, 240);
}

function buildLoopGuardIds(channel: MetaChannelConfig) {
  return new Set(
    [channel.externalAccountId, channel.pageId]
      .map((item) => cleanText(item, 180))
      .filter(Boolean)
  );
}

function personalizeTemplate(template: string, actorName: string) {
  const firstName = cleanText(actorName, 80).split(/\s+/)[0] || "por aqui";
  return template.replace(/\{\{\s*nome\s*\}\}/gi, firstName);
}

function detectSocialCommentIntent(config: TenantSocialAutomationConfig, text: string): SocialIntentSignal {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { tags: [], highIntent: false, reasonLabel: "sem_texto" };
  }

  const pricingKeywords = config.commentIntentPricingKeywords || [];
  const purchaseKeywords = config.commentIntentPurchaseKeywords || [];
  const schedulingKeywords = config.commentIntentSchedulingKeywords || [];
  const hasPricingIntent = pricingKeywords.some((token) => normalized.includes(normalizeText(token)));
  const hasPurchaseIntent = purchaseKeywords.some((token) => normalized.includes(normalizeText(token)));
  const hasSchedulingIntent = schedulingKeywords.some((token) => normalized.includes(normalizeText(token)));

  const tags = new Set<string>();
  if (hasPricingIntent) tags.add("intencao_preco");
  if (hasPurchaseIntent) tags.add("intencao_interesse");
  if (hasSchedulingIntent) tags.add("intencao_agendamento");
  if (hasPricingIntent || hasPurchaseIntent || hasSchedulingIntent) tags.add("instagram_keyword");

  const highIntent = hasPricingIntent || hasPurchaseIntent || hasSchedulingIntent;
  const reasonLabel = hasPricingIntent
    ? "preco_orcamento"
    : hasPurchaseIntent
      ? "interesse_de_compra"
      : hasSchedulingIntent
        ? "agendamento"
        : "conversa";

  return {
    tags: Array.from(tags),
    highIntent,
    reasonLabel,
  };
}

async function fetchOpenAiResponse(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`social_ai_http_${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return cleanText(payload.choices?.[0]?.message?.content, 1200);
}

export async function getTenantSocialAutomationConfig(tenantId: string) {
  const [settingsDoc, tenantSettings] = await Promise.all([
    adminDb.collection("social_automations").doc(tenantId).get(),
    getTenantSettings(tenantId),
  ]);

  const configData = settingsDoc.exists ? (settingsDoc.data() as Record<string, unknown>) : null;
  return normalizeTenantSocialAutomationConfig(tenantId, configData, tenantSettings);
}

export async function saveTenantSocialAutomationConfig(input: {
  tenantId: string;
  actorId: string;
  actorName: string;
  body: Record<string, unknown>;
}) {
  const tenantSettings = await getTenantSettings(input.tenantId);
  const config = normalizeTenantSocialAutomationConfig(input.tenantId, input.body, tenantSettings);

  await adminDb.collection("social_automations").doc(input.tenantId).set(
    {
      ...config,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actorId,
      updatedByName: input.actorName,
    },
    { merge: true }
  );

  return config;
}

export async function listRecentSocialAutomationLogs(tenantId: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(50, limit));
  let snap;

  try {
    snap = await adminDb
      .collection("social_automation_logs")
      .where("tenantId", "==", tenantId)
      .orderBy("updatedAt", "desc")
      .limit(safeLimit)
      .get();
  } catch (error) {
    const fallbackLimit = Math.max(20, Math.min(150, safeLimit * 4));
    if (isFirestoreMissingIndexError(error)) {
      console.warn("[social] fallback sem orderBy em listRecentSocialAutomationLogs (indice ausente)", {
        tenantId,
      });
    } else {
      console.warn("[social] fallback sem orderBy em listRecentSocialAutomationLogs", {
        tenantId,
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }

    snap = await adminDb
      .collection("social_automation_logs")
      .where("tenantId", "==", tenantId)
      .limit(fallbackLimit)
      .get();
  }

  return snap.docs
    .map<{
      id: string;
      updatedAt?: unknown;
      status?: unknown;
      [key: string]: unknown;
    }>((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt))
    .slice(0, safeLimit);
}

export async function getTenantSocialAutomationSummary(tenantId: string) {
  const [config, channelsSnap, logs] = await Promise.all([
    getTenantSocialAutomationConfig(tenantId),
    adminDb
      .collection("tenant_channels")
      .where("tenantId", "==", tenantId)
      .limit(40)
      .get(),
    listRecentSocialAutomationLogs(tenantId, 30),
  ]);

  const socialChannels = channelsSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        type: cleanText(data.type, 40).toLowerCase(),
        status: cleanText(data.status, 40).toLowerCase(),
        displayName: cleanText(data.displayName || data.name, 120),
        externalAccountId: cleanText(data.externalAccountId, 200),
        pageId: cleanText(data.pageId, 200),
        updatedAt: data.updatedAt || null,
      };
    })
    .filter((item) => item.type === "instagram" || item.type === "messenger");

  const activeChannels = socialChannels.filter((item) => item.status === "active").length;

  const sent = logs.filter((item) => cleanText(item.status, 40) === "sent").length;
  const failed = logs.filter((item) => cleanText(item.status, 40) === "failed").length;
  const ignored = logs.filter((item) => cleanText(item.status, 40).startsWith("ignored_")).length;

  return {
    config,
    summary: {
      activeChannels,
      sent,
      failed,
      ignored,
      dmAutoReply: config.dmAutoReply,
      commentAutoReply: config.commentAutoReply,
      newFollowerMessageEnabled: config.newFollowerMessageEnabled,
      enabled: config.enabled,
    },
    channels: socialChannels,
    logs,
  };
}

async function claimSocialEvent(input: {
  tenantId: string;
  channelType: string;
  eventId: string;
  eventType: string;
  actorId: string;
  actorName: string;
  text: string;
  entryId?: string | null;
  actorUsername?: string | null;
  commentId?: string | null;
  postId?: string | null;
  parentId?: string | null;
  timestamp?: number | null;
  field?: string | null;
}) {
  const logRef = adminDb.collection("social_automation_logs").doc(
    buildSocialLogId(input.tenantId, input.channelType, input.eventId)
  );

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      const status = cleanText(data.status, 80);
      if (status === "processed" || status === "sent" || status.startsWith("ignored_")) {
        return { shouldProcess: false };
      }
    }

    tx.set(
      logRef,
      {
        tenantId: input.tenantId,
        channelType: input.channelType,
        eventId: input.eventId,
        eventType: input.eventType,
        entryId: cleanText(input.entryId, 180) || null,
        actorId: input.actorId,
        actorName: input.actorName,
        actorUsername: cleanText(input.actorUsername, 180) || null,
        text: input.text,
        commentId: cleanText(input.commentId, 180) || null,
        postId: cleanText(input.postId, 180) || null,
        parentId: cleanText(input.parentId, 180) || null,
        timestamp: typeof input.timestamp === "number" && Number.isFinite(input.timestamp) ? input.timestamp : null,
        field: cleanText(input.field, 80) || null,
        status: "claimed",
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { shouldProcess: true };
  });

  return { logRef, shouldProcess: result.shouldProcess };
}

async function updateSocialLog(
  logRef: DocumentReference,
  patch: Record<string, unknown>
) {
  await logRef.set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getSocialAutomationContactState(tenantId: string, channelType: string, actorId: string) {
  const snap = await adminDb
    .collection("social_automation_contacts")
    .doc(buildSocialContactId(tenantId, channelType, actorId))
    .get();

  if (!snap.exists) {
    return { optedOut: false } satisfies SocialContactState;
  }

  const data = snap.data() as Record<string, unknown>;
  return {
    optedOut: data.optedOut === true,
  } satisfies SocialContactState;
}

export async function setSocialAutomationContactOptOut(input: {
  tenantId: string;
  channelType: string;
  actorId: string;
  actorName: string;
  optedOut: boolean;
  reason: string;
}) {
  await adminDb
    .collection("social_automation_contacts")
    .doc(buildSocialContactId(input.tenantId, input.channelType, input.actorId))
    .set(
      {
        tenantId: input.tenantId,
        channelType: input.channelType,
        actorId: input.actorId,
        actorName: input.actorName,
        optedOut: input.optedOut,
        optOutReason: input.reason,
        optedOutAt: input.optedOut ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function ensureSocialChatContext(input: {
  tenantId: string;
  channel: MetaChannelConfig;
  event: ParsedMetaSocialEvent;
  leadId: string;
}) {
  const summary =
    input.event.eventType === "comment"
      ? `[Social] Comentario em ${input.event.channelType}: ${input.event.text || "sem texto"}`
      : `[Social] Novo seguidor em ${input.event.channelType}: ${input.event.actorName}`;

  const leadRef = adminDb.collection("leads").doc(input.leadId);
  const leadSnap = await leadRef.get();
  const leadData = leadSnap.exists ? (leadSnap.data() as Record<string, unknown>) : {};

  let ownerId = cleanText(leadData.ownerId, 180) || null;
  let ownerName = cleanText(leadData.owner, 180) || null;
  if (!ownerId) {
    const inboundAssignee = await resolveInboundAssignment(input.tenantId, {
      channel: input.event.channelType,
      priority: input.event.eventType === "comment" ? "high" : "medium",
    });
    if (inboundAssignee) {
      ownerId = inboundAssignee.userId;
      ownerName = inboundAssignee.name;
      await leadRef.set(
        {
          ownerId,
          owner: ownerName,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  const tenantSettings = await getTenantSettings(input.tenantId);
  const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);

  const chatSnap = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("channel", "==", input.event.channelType)
    .where("contactExternalId", "==", input.event.actorId)
    .limit(1)
    .get();

  if (!chatSnap.empty) {
    const chatDoc = chatSnap.docs[0];
    await chatDoc.ref.set(
      {
        contactName: input.event.actorName,
        leadId: input.leadId,
        ownerId,
        ownerName,
        lastMessage: summary,
        lastMessageTime: FieldValue.serverTimestamp(),
        ...buildIncomingChatOperationalPatch({
          status: "open",
          assignedTo: ownerId,
          slaMinutes,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return {
      chatId: chatDoc.id,
      ownerId,
    };
  }

  const chatRef = await adminDb.collection("chats").add({
    tenantId: input.tenantId,
    channel: input.event.channelType,
    channelId: input.channel.id,
    channelExternalAccountId: input.channel.externalAccountId || input.channel.pageId || "",
    contactExternalId: input.event.actorId,
    contactName: input.event.actorName,
    leadId: input.leadId,
    ownerId,
    ownerName,
    assignedTo: ownerId,
    lastMessage: summary,
    lastMessageTime: FieldValue.serverTimestamp(),
    ...buildIncomingChatOperationalPatch({
      status: "open",
      assignedTo: ownerId,
      slaMinutes,
    }),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    chatId: chatRef.id,
    ownerId,
  };
}

async function ensureSocialLeadAndChat(input: {
  tenantId: string;
  channel: MetaChannelConfig;
  event: ParsedMetaSocialEvent;
  intent: SocialIntentSignal;
}) {
  const sourceType = `${input.event.channelType}_${input.event.eventType}`.toLowerCase();
  const sourceId = `${input.event.channelType}:${input.event.eventType}:${input.event.eventId}`;
  const sourceLabel = input.event.channelType === "instagram" ? "instagram_organico" : "facebook_organico";
  const messageText =
    input.event.eventType === "comment" ? cleanText(input.event.text, 1400) : "Novo seguidor capturado";

  const lead = await recordInboundLead({
    tenantId: input.tenantId,
    sourceType,
    sourceId,
    sourceLabel,
    channel: input.event.channelType,
    nome: input.event.actorName,
    mensagem: messageText,
    externalProfileId: input.event.actorId,
    tags: [
      "social",
      input.event.channelType,
      `social_${input.event.eventType}`,
      ...input.intent.tags,
    ],
    customFields: {
      social_event_type: input.event.eventType,
      social_actor_username: input.event.actorUsername || "",
      social_post_id: input.event.postId || "",
      social_comment_id: input.event.commentId || "",
      social_intent_label: input.intent.reasonLabel,
    },
    attribution: {
      source: input.event.channelType === "instagram" ? "instagram" : "facebook",
      medium: "social_organic",
      content: messageText,
      sourceLabel,
      channel: input.event.channelType,
      sourceType,
    },
    automationActorId: "meta_social_webhook",
    automationActorName: "Meta Social Webhook",
  });

  await upsertContactProfile({
    tenantId: input.tenantId,
    externalProfileId: input.event.actorId,
    leadId: lead.leadId,
    channel: input.event.channelType,
    name: input.event.actorName,
  });

  const chatContext = await ensureSocialChatContext({
    tenantId: input.tenantId,
    channel: input.channel,
    event: input.event,
    leadId: lead.leadId,
  });

  return {
    leadId: lead.leadId,
    chatId: chatContext.chatId,
    ownerId: chatContext.ownerId,
  };
}

async function ensureHighIntentTask(input: {
  tenantId: string;
  leadId: string;
  event: ParsedMetaSocialEvent;
  ownerId?: string | null;
}) {
  const taskId = sanitizeId(`${input.tenantId}_${input.event.eventId}_social_intent_task`, 240);
  const taskRef = adminDb.collection("lead_tasks").doc(taskId);
  const created = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(taskRef);
    if (snap.exists) return false;
    tx.set(taskRef, {
      tenantId: input.tenantId,
      leadId: input.leadId,
      title: "Responder comentario de alta intencao",
      type: "follow_up",
      priority: "high",
      dueAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "pending",
      source: "social_automation",
      reasonCode: "instagram_keyword_intent",
      ownerUserId: input.ownerId || null,
      taskKey: `instagram_keyword_intent:${sanitizeId(input.event.eventId, 120)}`,
      createdBy: "social_automation",
      createdByName: "Social Automation",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!created) return;

  await adminDb.collection("leads").doc(input.leadId).set(
    {
      priority: "high",
      updatedAt: FieldValue.serverTimestamp(),
      tags: FieldValue.arrayUnion("instagram_keyword", "intencao_alta"),
    },
    { merge: true }
  );
}

async function persistSocialMatch(input: {
  tenantId: string;
  channelType: MetaConversationChannelType;
  actorId: string;
  actorName: string;
  eventType: string;
  text: string;
  leadId: string | null;
  chatId: string | null;
}) {
  const summary =
    input.eventType === "comment"
      ? `[Social] Comentario em ${input.channelType}: ${input.text || "sem texto"}`
      : `[Social] Novo seguidor em ${input.channelType}: ${input.actorName}`;

  const writes: Promise<unknown>[] = [];

  if (input.leadId) {
    writes.push(
      adminDb.collection("leads").doc(input.leadId).collection("events").add({
        type: `social_${input.eventType}`,
        title: input.eventType === "comment" ? "Comentario social recebido" : "Novo seguidor recebido",
        detail: summary,
        actorId: input.actorId,
        actorName: input.actorName,
        channel: input.channelType,
        createdAt: FieldValue.serverTimestamp(),
      })
    );
  }

  if (input.chatId) {
    const chatRef = adminDb.collection("chats").doc(input.chatId);
    writes.push(
      chatRef.set(
        {
          lastMessage: summary,
          lastMessageTime: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    );
    writes.push(
      adminDb.collection("messages").add({
        tenantId: input.tenantId,
        chatId: input.chatId,
        text: summary,
        sender: "system",
        type: "text",
        source: "social_automation",
        channel: input.channelType,
        socialEventType: input.eventType,
        createdAt: FieldValue.serverTimestamp(),
      })
    );
  }

  await Promise.all(writes);
}

async function generateSocialReply(input: {
  tenantId: string;
  actorName: string;
  channelType: MetaConversationChannelType;
  eventType: "comment" | "new_follower";
  text: string;
  config: TenantSocialAutomationConfig;
  intentHint?: string;
}) {
  if (input.eventType === "new_follower") {
    return personalizeTemplate(input.config.newFollowerMessageTemplate, input.actorName);
  }

  const tenantSettings = await getTenantSettings(input.tenantId);
  const businessName = cleanText(tenantSettings?.name, 180) || "a marca";
  const niche = cleanText(tenantSettings?.niche, 180) || "negocio";
  const tone = cleanText(tenantSettings?.ai?.toneOfVoice, 180) || "consultivo";
  const systemPrompt = [
    `Voce cuida das automacoes sociais de ${businessName}, empresa do nicho ${niche}.`,
    `Tom esperado: ${tone}.`,
    input.config.commentPrompt,
    "Escreva em portugues do Brasil, sem markdown, em no maximo 280 caracteres.",
    "Nunca diga que voce e uma IA.",
  ].join(" ");
  const userPrompt = [
    `Canal: ${input.channelType}.`,
    `Evento: ${input.eventType}.`,
    `Autor: ${input.actorName}.`,
    `Comentario recebido: ${input.text || "sem texto"}.`,
    `Sinal de intencao detectado: ${input.intentHint || "conversa geral"}.`,
    "Gere uma resposta publica curta, cordial e orientada a continuar a conversa no direct se fizer sentido.",
  ].join("\n");

  const response = await fetchOpenAiResponse({ systemPrompt, userPrompt });
  if (response) return response;

  return personalizeTemplate(
    "Obrigado pelo comentario, {{nome}}! Vou te responder por aqui e, se preferir, seguimos no direct com mais detalhes.",
    input.actorName
  );
}

async function sendMetaCommentReply(input: {
  channel: MetaChannelConfig;
  commentId: string;
  text: string;
}) {
  const response = await fetch(`https://graph.facebook.com/${VERSION}/${input.commentId}/replies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.channel.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: input.text }),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || "Erro na API da Meta ao responder comentario.");
  }

  return payload;
}

export function shouldAutoReplyToDm(input: {
  config: TenantSocialAutomationConfig;
  text: string;
  senderId: string;
  channel: MetaChannelConfig;
  contactState?: SocialContactState;
  now?: Date;
}) {
  if (!input.config.enabled || !input.config.dmAutoReply) {
    return { allowed: false, reason: "ignored_disabled" as const };
  }
  if (buildLoopGuardIds(input.channel).has(cleanText(input.senderId, 180))) {
    return { allowed: false, reason: "ignored_loop" as const };
  }
  if (input.contactState?.optedOut) {
    return { allowed: false, reason: "ignored_opt_out" as const };
  }
  if (textTriggersSocialOptOut(input.text, input.config.optOutKeywords)) {
    return { allowed: false, reason: "ignored_opt_out" as const, shouldPersistOptOut: true };
  }
  if (!isWithinSocialActiveHours(input.config.activeHours, input.now || new Date())) {
    return { allowed: false, reason: "ignored_inactive_hours" as const };
  }
  return { allowed: true, reason: "processed" as const };
}

export async function logSocialAutomationStatus(input: {
  tenantId: string;
  channelType: string;
  eventId: string;
  eventType: string;
  actorId: string;
  actorName: string;
  text: string;
  status: SocialLogStatus;
  reason?: string;
  leadId?: string | null;
  chatId?: string | null;
  responseText?: string | null;
}) {
  const logRef = adminDb.collection("social_automation_logs").doc(
    buildSocialLogId(input.tenantId, input.channelType, input.eventId)
  );

  await updateSocialLog(logRef, {
    tenantId: input.tenantId,
    channelType: input.channelType,
    eventId: input.eventId,
    eventType: input.eventType,
    actorId: input.actorId,
    actorName: input.actorName,
    text: input.text,
    status: input.status,
    reason: input.reason || "",
    leadId: input.leadId || null,
    chatId: input.chatId || null,
    responseText: input.responseText || null,
  });
}

export async function handleMetaSocialEvent(input: {
  tenantId: string;
  channel: MetaChannelConfig;
  event: ParsedMetaSocialEvent;
}) {
  const { tenantId, channel, event } = input;
  const config = await getTenantSocialAutomationConfig(tenantId);
  const claim = await claimSocialEvent({
    tenantId,
    channelType: event.channelType,
    eventId: event.eventId,
    eventType: event.eventType,
    entryId: event.entryId,
    actorId: event.actorId,
    actorName: event.actorName,
    actorUsername: event.actorUsername,
    text: event.text,
    commentId: event.commentId || null,
    postId: event.postId || null,
    parentId: event.parentId || null,
    timestamp: event.timestamp,
    field: event.field,
  });

  if (!claim.shouldProcess) {
    return { status: "ignored_duplicate" as const };
  }

  const loopGuardIds = buildLoopGuardIds(channel);
  if (loopGuardIds.has(cleanText(event.actorId, 180))) {
    await updateSocialLog(claim.logRef, { status: "ignored_loop", reason: "Evento originado pela propria conta." });
    return { status: "ignored_loop" as const };
  }

  const contactState = await getSocialAutomationContactState(tenantId, event.channelType, event.actorId);
  if (contactState.optedOut) {
    await updateSocialLog(claim.logRef, { status: "ignored_opt_out", reason: "Contato com opt-out ativo." });
    return { status: "ignored_opt_out" as const };
  }

  if (event.text && textTriggersSocialOptOut(event.text, config.optOutKeywords)) {
    await setSocialAutomationContactOptOut({
      tenantId,
      channelType: event.channelType,
      actorId: event.actorId,
      actorName: event.actorName,
      optedOut: true,
      reason: event.text,
    });
    await updateSocialLog(claim.logRef, { status: "ignored_opt_out", reason: "Texto acionou opt-out." });
    return { status: "ignored_opt_out" as const };
  }

  if (!config.enabled) {
    await updateSocialLog(claim.logRef, { status: "ignored_disabled", reason: "Automacoes sociais desativadas." });
    return { status: "ignored_disabled" as const };
  }

  if (!isWithinSocialActiveHours(config.activeHours)) {
    await updateSocialLog(claim.logRef, { status: "ignored_inactive_hours", reason: "Fora da janela ativa configurada." });
    return { status: "ignored_inactive_hours" as const };
  }

  const shouldReply =
    (event.eventType === "comment" && config.commentAutoReply) ||
    (event.eventType === "new_follower" && config.newFollowerMessageEnabled);

  const intent =
    event.eventType === "comment"
      ? detectSocialCommentIntent(config, event.text)
      : { tags: [] as string[], highIntent: false, reasonLabel: "follower" };
  const match = await ensureSocialLeadAndChat({
    tenantId,
    channel,
    event,
    intent,
  });
  await persistSocialMatch({
    tenantId,
    channelType: event.channelType,
    actorId: event.actorId,
    actorName: event.actorName,
    eventType: event.eventType,
    text: event.text,
    leadId: match.leadId,
    chatId: match.chatId,
  });

  if (match.leadId) {
    await runLeadAutomations({
      tenantId,
      trigger: "message_received",
      leadId: match.leadId,
      chatId: match.chatId,
      channel: event.channelType,
      messageText: event.eventType === "comment" ? event.text : "novo seguidor",
      actorId: "meta_social_webhook",
      actorName: "Meta Social Webhook",
    });
  }

  if (event.eventType === "comment" && intent.highIntent && match.leadId) {
    await ensureHighIntentTask({
      tenantId,
      leadId: match.leadId,
      event,
      ownerId: match.ownerId,
    });
  }

  if (!shouldReply) {
    await updateSocialLog(claim.logRef, {
      status: "processed",
      reason: "Evento persistido sem resposta automatica pela configuracao.",
      leadId: match.leadId,
      chatId: match.chatId,
      commercialIntent: intent.reasonLabel,
    });
    return { status: "processed" as const, leadId: match.leadId, chatId: match.chatId };
  }

  try {
    const replyText = await generateSocialReply({
      tenantId,
      actorName: event.actorName,
      channelType: event.channelType,
      eventType: event.eventType,
      text: event.text,
      config,
      intentHint: intent.reasonLabel,
    });

    if (event.eventType === "comment") {
      if (!event.commentId) {
        throw new Error("Comentario sem identificador para reply.");
      }
      await sendMetaCommentReply({
        channel,
        commentId: event.commentId,
        text: replyText,
      });
    } else {
      await sendMetaConversationText({
        channel,
        recipientId: event.actorId,
        text: replyText,
      });
    }

    await updateSocialLog(claim.logRef, {
      status: "sent",
      responseText: replyText,
      leadId: match.leadId,
      chatId: match.chatId,
      respondedAt: FieldValue.serverTimestamp(),
      commercialIntent: intent.reasonLabel,
    });

    return {
      status: "sent" as const,
      responseText: replyText,
      leadId: match.leadId,
      chatId: match.chatId,
    };
  } catch (error) {
    await updateSocialLog(claim.logRef, {
      status: "failed",
      leadId: match.leadId,
      chatId: match.chatId,
      error: error instanceof Error ? error.message.slice(0, 280) : "Erro desconhecido.",
    });
    throw error;
  }
}

export async function retrySocialAutomationLog(input: {
  tenantId: string;
  logId: string;
  actorId: string;
  actorName: string;
}) {
  const logRef = adminDb.collection("social_automation_logs").doc(cleanText(input.logId, 240));
  const logSnap = await logRef.get();
  if (!logSnap.exists) {
    throw new Error("social_log_not_found");
  }

  const logData = logSnap.data() as Record<string, unknown>;
  if (cleanText(logData.tenantId, 180) !== input.tenantId) {
    throw new Error("social_log_tenant_mismatch");
  }

  const channelType = cleanText(logData.channelType, 40).toLowerCase() as MetaConversationChannelType;
  if (channelType !== "instagram" && channelType !== "messenger") {
    throw new Error("social_log_invalid_channel");
  }

  const eventTypeRaw = cleanText(logData.eventType, 40).toLowerCase();
  const eventType = eventTypeRaw === "comment" ? "comment" : eventTypeRaw === "new_follower" ? "new_follower" : "";
  if (!eventType) {
    throw new Error("social_log_invalid_event_type");
  }

  const eventId = cleanText(logData.eventId, 220) || cleanText(input.logId, 220);
  const entryId = cleanText(logData.entryId, 180);
  const actorId = cleanText(logData.actorId, 180);
  const actorName = cleanText(logData.actorName, 180) || "Perfil";
  const actorUsername = cleanText(logData.actorUsername, 180);
  const text = cleanText(logData.text, 1500);
  const commentId = cleanText(logData.commentId, 180) || null;
  const postId = cleanText(logData.postId, 180) || null;
  const parentId = cleanText(logData.parentId, 180) || null;
  const timestamp = typeof logData.timestamp === "number" && Number.isFinite(logData.timestamp) ? logData.timestamp : null;
  const field = cleanText(logData.field, 80) || (eventType === "comment" ? "comments" : "followers");

  if (!actorId) {
    throw new Error("social_log_missing_actor_id");
  }
  if (eventType === "comment" && !commentId) {
    throw new Error("social_log_missing_comment_id");
  }

  const channel = await getMetaChannelForTenant(input.tenantId, channelType, {
    channelId: cleanText(logData.channelId, 180) || null,
    externalAccountId: cleanText(logData.externalAccountId, 180) || entryId || null,
    pageId: cleanText(logData.pageId, 180) || entryId || null,
  });
  if (!channel) {
    throw new Error("social_channel_not_found");
  }

  await updateSocialLog(logRef, {
    status: "retrying",
    retriedAt: FieldValue.serverTimestamp(),
    retriedBy: input.actorId,
    retriedByName: input.actorName,
    retryCount: FieldValue.increment(1),
    retryReason: "manual_retry",
  });

  const result = await handleMetaSocialEvent({
    tenantId: input.tenantId,
    channel,
    event: {
      eventId,
      eventType,
      channelType,
      entryId: entryId || channel.pageId || channel.externalAccountId || "",
      actorId,
      actorName,
      actorUsername,
      text,
      commentId,
      postId,
      parentId,
      timestamp,
      field,
    },
  });

  await updateSocialLog(logRef, {
    retriedResult: result.status,
    retriedCompletedAt: FieldValue.serverTimestamp(),
  });

  return result;
}
