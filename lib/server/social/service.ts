import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { MetaChannelConfig, MetaConversationChannelType } from "@/app/lib/server/meta-channel";
import { sendMetaConversationText } from "@/app/lib/server/meta-channel";
import { getTenantSettings } from "@/lib/server/tenant";
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

function cleanText(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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
  const snap = await adminDb
    .collection("social_automation_logs")
    .where("tenantId", "==", tenantId)
    .orderBy("updatedAt", "desc")
    .limit(Math.max(1, Math.min(50, limit)))
    .get();

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
    .sort((a, b) => {
      const aTime =
        a.updatedAt && typeof a.updatedAt === "object" && "toDate" in a.updatedAt
          ? (a.updatedAt as { toDate: () => Date }).toDate().getTime()
          : 0;
      const bTime =
        b.updatedAt && typeof b.updatedAt === "object" && "toDate" in b.updatedAt
          ? (b.updatedAt as { toDate: () => Date }).toDate().getTime()
          : 0;
      return bTime - aTime;
    });
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

  const activeChannels = channelsSnap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const type = cleanText(data.type, 40).toLowerCase();
    const status = cleanText(data.status, 40).toLowerCase();
    return (type === "instagram" || type === "messenger") && status === "active";
  }).length;

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
        actorId: input.actorId,
        actorName: input.actorName,
        text: input.text,
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

async function resolveSocialMatch(tenantId: string, channelType: MetaConversationChannelType, actorId: string) {
  const [leadSnap, chatSnap] = await Promise.all([
    adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .where("externalProfileId", "==", actorId)
      .limit(1)
      .get(),
    adminDb
      .collection("chats")
      .where("tenantId", "==", tenantId)
      .where("channel", "==", channelType)
      .where("contactExternalId", "==", actorId)
      .limit(1)
      .get(),
  ]);

  return {
    leadId: leadSnap.empty ? null : leadSnap.docs[0].id,
    chatId: chatSnap.empty ? null : chatSnap.docs[0].id,
  };
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
    actorId: event.actorId,
    actorName: event.actorName,
    text: event.text,
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

  const match = await resolveSocialMatch(tenantId, event.channelType, event.actorId);
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

  if (!shouldReply) {
    await updateSocialLog(claim.logRef, {
      status: "processed",
      reason: "Evento persistido sem resposta automatica pela configuracao.",
      leadId: match.leadId,
      chatId: match.chatId,
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
