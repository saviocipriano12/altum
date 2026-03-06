import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { getWhatsAppChannelForTenant, sendMetaTextMessage } from "@/app/lib/server/whatsapp-channel";
import { getTenantSettings } from "@/lib/server/tenant";

const MAX_CONTEXT_MESSAGES = 24;
const MAX_KB_DOCS = 50;

const DEFAULT_GUARDRAILS = [
  "Nao compartilhe dados sensiveis ou segredos internos.",
  "Nao confirme pagamentos, descontos ou prazos que nao estejam documentados.",
  "Mantenha o foco em qualificar o lead e avancar para proximo passo.",
];

type ChatStateDoc = {
  tenantId?: string;
  chatId?: string;
  aiEnabled?: boolean;
  pausedUntil?: unknown;
  humanOwnerUserId?: string | null;
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  score: number;
};

type ConversationMessage = {
  id: string;
  text: string;
  sender: "agent" | "client" | "system";
  createdAt?: unknown;
};

type TenantAiConfig = {
  enabled: boolean;
  toneOfVoice: string;
  businessSummary: string;
  responsiblePhone: string;
  guardrails: string[];
};

type Decision = "respond" | "ask_more" | "handoff" | "skip";

type AgentDecision = {
  decision: Exclude<Decision, "skip">;
  responseText?: string;
  reason: string;
};

export type HandleIncomingMessageInput = {
  tenantId: string;
  chatId: string;
  messageId: string;
};

export type HandleIncomingMessageResult = {
  decision: Decision;
  reason: string;
};

export type ChatState = {
  tenantId: string;
  chatId: string;
  aiEnabled: boolean;
  pausedUntil: Date | null;
  humanOwnerUserId: string | null;
};

export function getChatStateDocId(tenantId: string, chatId: string) {
  return `${tenantId.trim()}_${chatId.trim()}`;
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
  if (typeof value === "number") {
    return new Date(value);
  }
  return null;
}

function sanitizeText(value: unknown, max = 900) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function safeLogDocId(tenantId: string, chatId: string, messageId: string) {
  const raw = `${tenantId}_${chatId}_${messageId}`;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.slice(0, 220) || `ai_${Date.now()}`;
}

function parseGuardrails(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeText(item, 240))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|\.|;|\|/)
      .map((item) => sanitizeText(item, 240))
      .filter(Boolean);
  }

  return [];
}

function parseAiConfig(settings: Awaited<ReturnType<typeof getTenantSettings>>): TenantAiConfig {
  const ai =
    settings && typeof settings.ai === "object" && settings.ai
      ? (settings.ai as Record<string, unknown>)
      : {};

  return {
    enabled: ai.enabled !== false,
    toneOfVoice: sanitizeText(ai.toneOfVoice, 120) || "consultivo e objetivo",
    businessSummary:
      sanitizeText(ai.businessSummary, 360) ||
      sanitizeText(settings?.name, 120) ||
      "empresa de servicos com atendimento consultivo",
    responsiblePhone: normalizePhone(String(ai.responsiblePhone || "")),
    guardrails: [...DEFAULT_GUARDRAILS, ...parseGuardrails(ai.guardrails)],
  };
}

function textHasAny(text: string, terms: string[]) {
  const normalized = normalizeWords(text).join(" ");
  return terms.some((term) => normalized.includes(term));
}

function shouldHandoff(text: string) {
  const handoffTerms = [
    "humano",
    "atendente",
    "pessoa",
    "gerente",
    "supervisor",
    "reclamacao",
    "procon",
    "cancelar",
    "processo",
    "advogado",
  ];
  return textHasAny(text, handoffTerms);
}

function shouldAskMore(text: string) {
  const normalized = sanitizeText(text, 400);
  if (!normalized) return true;

  const words = normalizeWords(normalized);
  if (words.length <= 2) return true;

  const genericOpeners = ["oi", "ola", "bom dia", "boa tarde", "boa noite", "preco", "valor"];
  if (textHasAny(normalized, genericOpeners) && words.length < 5) {
    return true;
  }

  return false;
}

function scoreKbDoc(messageWords: string[], doc: KbDoc) {
  if (messageWords.length === 0) return 0;
  const docWords = new Set<string>([
    ...normalizeWords(doc.content),
    ...doc.tags.flatMap((tag) => normalizeWords(tag)),
    ...normalizeWords(doc.type),
  ]);

  let score = 0;
  for (const word of messageWords) {
    if (docWords.has(word)) score += 1;
  }

  return score;
}

function makeLeadFacingReply(input: {
  tenantAi: TenantAiConfig;
  decision: Exclude<Decision, "skip" | "handoff">;
  inboundText: string;
  kbDocs: KbDoc[];
}) {
  if (input.decision === "ask_more") {
    return [
      `Perfeito. Para te ajudar com mais precisao, preciso de 2 pontos:`,
      `1) Qual servico/produto voce quer agora?`,
      `2) Qual prazo voce tem para comecar?`,
      `Atendo no estilo ${input.tenantAi.toneOfVoice}.`,
    ].join("\n");
  }

  const topDocs = input.kbDocs.slice(0, 2);
  const points = topDocs
    .map((doc, index) => {
      const snippet = sanitizeText(doc.content, 180);
      return `${index + 1}) ${snippet}`;
    })
    .filter(Boolean);

  const leadSignal = textHasAny(input.inboundText, ["preco", "valor", "plano", "orcamento"])
    ? "Se fizer sentido, te passo uma proposta alinhada ao seu cenario."
    : "Se fizer sentido, ja te proponho o proximo passo para avancarmos.";

  const guardrailHint = input.tenantAi.guardrails[0]
    ? `Regra de atendimento: ${sanitizeText(input.tenantAi.guardrails[0], 120)}.`
    : "";

  return [
    `Entendi. Atuamos com ${input.tenantAi.businessSummary}.`,
    ...points,
    leadSignal,
    guardrailHint,
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeForResponsible(messages: ConversationMessage[]) {
  const recentClient = messages
    .filter((item) => item.sender === "client")
    .map((item) => sanitizeText(item.text, 180))
    .filter(Boolean)
    .slice(-5);

  if (recentClient.length === 0) {
    return ["Cliente pediu suporte humano.", "Sem mensagens recentes para resumir.", "Acompanhar conversa no inbox."];
  }

  const bullets = recentClient.slice(-5).map((line) => `- ${line}`);
  return bullets.slice(0, 5);
}

async function fetchKbDocs(tenantId: string, inboundText: string) {
  const snap = await adminDb
    .collection("kb_docs")
    .where("tenantId", "==", tenantId)
    .limit(MAX_KB_DOCS)
    .get();

  const baseDocs: KbDoc[] = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const typeRaw = String(data.type || "faq").toLowerCase();
      const type: KbDoc["type"] =
        typeRaw === "catalog" ? "catalog" : typeRaw === "policy" ? "policy" : "faq";

      const tags = Array.isArray(data.tags)
        ? data.tags
            .map((tag) => sanitizeText(tag, 80))
            .filter(Boolean)
        : [];

      return {
        id: doc.id,
        type,
        content: sanitizeText(data.content, 600),
        tags,
        score: 0,
      };
    })
    .filter((item) => item.content);

  const messageWords = normalizeWords(inboundText);
  const scored = baseDocs
    .map((doc) => ({ ...doc, score: scoreKbDoc(messageWords, doc) }))
    .sort((a, b) => b.score - a.score);

  return scored.filter((doc) => doc.score > 0);
}

async function fetchConversation(chatId: string, tenantId: string) {
  const snap = await adminDb
    .collection("messages")
    .where("chatId", "==", chatId)
    .where("tenantId", "==", tenantId)
    .limit(300)
    .get();

  const messages: ConversationMessage[] = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const senderRaw = String(data.sender || "client").toLowerCase();
      const sender: ConversationMessage["sender"] =
        senderRaw === "agent" || senderRaw === "system" ? senderRaw : "client";

      return {
        id: doc.id,
        text: sanitizeText(data.text, 1200),
        sender,
        createdAt: data.createdAt,
      };
    })
    .sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return aTime - bTime;
    })
    .slice(-MAX_CONTEXT_MESSAGES);

  return messages;
}

export async function getChatState(tenantId: string, chatId: string): Promise<ChatState> {
  const docId = getChatStateDocId(tenantId, chatId);
  const snap = await adminDb.collection("chat_state").doc(docId).get();

  if (!snap.exists) {
    return {
      tenantId,
      chatId,
      aiEnabled: true,
      pausedUntil: null,
      humanOwnerUserId: null,
    };
  }

  const data = snap.data() as ChatStateDoc;
  return {
    tenantId,
    chatId,
    aiEnabled: data.aiEnabled !== false,
    pausedUntil: toDate(data.pausedUntil),
    humanOwnerUserId:
      typeof data.humanOwnerUserId === "string" && data.humanOwnerUserId.trim()
        ? data.humanOwnerUserId.trim()
        : null,
  };
}

async function saveAiLog(input: {
  logDocId: string;
  tenantId: string;
  chatId: string;
  messageId: string;
  decision: Decision;
  reason: string;
  inboundText: string;
  outboundText: string;
  toolCalls: string[];
}) {
  await adminDb.collection("ai_logs").doc(input.logDocId).set(
    {
      tenantId: input.tenantId,
      chatId: input.chatId,
      messageId: input.messageId,
      input: input.inboundText,
      output: input.outboundText,
      toolCalls: input.toolCalls,
      decision: input.decision,
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function upsertChatState(input: {
  tenantId: string;
  chatId: string;
  aiEnabled?: boolean;
  pausedUntil?: Date | null;
  humanOwnerUserId?: string | null;
}) {
  const docId = getChatStateDocId(input.tenantId, input.chatId);
  await adminDb.collection("chat_state").doc(docId).set(
    {
      tenantId: input.tenantId,
      chatId: input.chatId,
      aiEnabled: input.aiEnabled,
      pausedUntil: input.pausedUntil || null,
      humanOwnerUserId: input.humanOwnerUserId || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function addMessage(input: {
  chatId: string;
  tenantId: string;
  text: string;
  sender: "agent" | "system";
  type?: "text";
  channelPhoneNumberId?: string;
  senderId?: string;
  senderName?: string;
}) {
  const cleanText = sanitizeText(input.text, 1800);
  if (!cleanText) return;

  await Promise.all([
    adminDb.collection("messages").add({
      chatId: input.chatId,
      tenantId: input.tenantId,
      text: cleanText,
      sender: input.sender,
      senderId: input.senderId || null,
      senderName: input.senderName || (input.sender === "agent" ? "AI Sales Agent" : null),
      type: input.type || "text",
      status: "sent",
      channelPhoneNumberId: input.channelPhoneNumberId || null,
      createdAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection("chats").doc(input.chatId).set(
      {
        tenantId: input.tenantId,
        lastMessage: cleanText,
        lastMessageTime: FieldValue.serverTimestamp(),
        status: "open",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
  ]);
}

function decide(input: {
  inboundText: string;
  kbDocs: KbDoc[];
}): AgentDecision {
  if (shouldHandoff(input.inboundText)) {
    return {
      decision: "handoff",
      reason: "lead_requested_human",
    };
  }

  if (shouldAskMore(input.inboundText)) {
    return {
      decision: "ask_more",
      reason: "need_more_context",
    };
  }

  if (input.kbDocs.length === 0) {
    return {
      decision: "ask_more",
      reason: "kb_not_found",
    };
  }

  return {
    decision: "respond",
    reason: "matched_kb",
  };
}

function buildConversationLink(tenantId: string, chatId: string) {
  const explicitBase =
    String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!explicitBase) {
    return `tenant=${tenantId} chat=${chatId}`;
  }

  return `${explicitBase.replace(/\/$/, "")}/cliente/painel/inbox?chatId=${encodeURIComponent(chatId)}`;
}

export async function handleIncomingMessage(
  input: HandleIncomingMessageInput
): Promise<HandleIncomingMessageResult> {
  const tenantId = input.tenantId.trim();
  const chatId = input.chatId.trim();
  const messageId = input.messageId.trim();

  if (!tenantId || !chatId || !messageId) {
    return { decision: "skip", reason: "invalid_payload" };
  }

  const logDocId = safeLogDocId(tenantId, chatId, messageId);
  const existingLog = await adminDb.collection("ai_logs").doc(logDocId).get();
  if (existingLog.exists) {
    return { decision: "skip", reason: "already_processed" };
  }

  const [chatSnap, messageSnap, tenantSettings, chatState] = await Promise.all([
    adminDb.collection("chats").doc(chatId).get(),
    adminDb.collection("messages").doc(messageId).get(),
    getTenantSettings(tenantId),
    getChatState(tenantId, chatId),
  ]);

  if (!chatSnap.exists || !messageSnap.exists) {
    return { decision: "skip", reason: "chat_or_message_not_found" };
  }

  const chatData = chatSnap.data() as Record<string, unknown>;
  if (String(chatData.tenantId || "") !== tenantId) {
    return { decision: "skip", reason: "chat_tenant_mismatch" };
  }

  const incomingMessage = messageSnap.data() as Record<string, unknown>;
  const incomingSender = String(incomingMessage.sender || "").toLowerCase();
  const inboundText = sanitizeText(incomingMessage.text, 1400);

  if (incomingSender !== "client") {
    return { decision: "skip", reason: "not_client_message" };
  }

  const aiConfig = parseAiConfig(tenantSettings);

  if (!aiConfig.enabled) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "skip",
      reason: "tenant_ai_disabled",
      inboundText,
      outboundText: "",
      toolCalls: ["tenant_settings.ai.enabled"],
    });
    return { decision: "skip", reason: "tenant_ai_disabled" };
  }

  if (chatState.aiEnabled === false) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "skip",
      reason: "chat_ai_paused",
      inboundText,
      outboundText: "",
      toolCalls: ["chat_state.aiEnabled"],
    });
    return { decision: "skip", reason: "chat_ai_paused" };
  }

  if (chatState.pausedUntil && chatState.pausedUntil.getTime() > Date.now()) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "skip",
      reason: "chat_ai_paused_until",
      inboundText,
      outboundText: "",
      toolCalls: ["chat_state.pausedUntil"],
    });
    return { decision: "skip", reason: "chat_ai_paused_until" };
  }

  if (chatState.humanOwnerUserId) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "skip",
      reason: "human_takeover_active",
      inboundText,
      outboundText: "",
      toolCalls: ["chat_state.humanOwnerUserId"],
    });
    return { decision: "skip", reason: "human_takeover_active" };
  }

  const [conversation, kbDocs] = await Promise.all([
    fetchConversation(chatId, tenantId),
    fetchKbDocs(tenantId, inboundText),
  ]);

  const choice = decide({ inboundText, kbDocs });

  const channel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: tenantId === "ALTUM_AGENCY",
  });

  if (!channel) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "skip",
      reason: "channel_not_found",
      inboundText,
      outboundText: "",
      toolCalls: ["tenant_channels.whatsapp"],
    });
    return { decision: "skip", reason: "channel_not_found" };
  }

  const leadPhone = normalizePhone(String(chatData.contactPhone || ""));
  if (!leadPhone) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "skip",
      reason: "lead_phone_missing",
      inboundText,
      outboundText: "",
      toolCalls: ["chats.contactPhone"],
    });
    return { decision: "skip", reason: "lead_phone_missing" };
  }

  if (choice.decision === "handoff") {
    const conversationLink = buildConversationLink(tenantId, chatId);
    const summaryBullets = summarizeForResponsible(conversation);

    const leadAck =
      "Perfeito, vou acionar um especialista humano agora e priorizar seu atendimento.";

    await sendMetaTextMessage({
      channel,
      to: leadPhone,
      text: leadAck,
    });

    await addMessage({
      chatId,
      tenantId,
      text: leadAck,
      sender: "agent",
      channelPhoneNumberId: channel.phoneNumberId,
      senderName: "AI Sales Agent",
    });

    const systemEventText =
      "IA solicitou handoff para humano. Conversa sinalizada para atendimento prioritario.";

    await addMessage({
      chatId,
      tenantId,
      text: systemEventText,
      sender: "system",
      channelPhoneNumberId: channel.phoneNumberId,
    });

    if (aiConfig.responsiblePhone) {
      const notification = [
        `Handoff solicitado para tenant ${tenantId}.`,
        `Conversa: ${chatId}`,
        `Lead: ${String(chatData.contactName || "Contato")} (${leadPhone})`,
        `Inbox: ${conversationLink}`,
        "Resumo:",
        ...summaryBullets,
      ].join("\n");

      await sendMetaTextMessage({
        channel,
        to: aiConfig.responsiblePhone,
        text: notification,
      });
    }

    await upsertChatState({
      tenantId,
      chatId,
      aiEnabled: false,
      pausedUntil: new Date(Date.now() + 30 * 60 * 1000),
      humanOwnerUserId: String(chatData.ownerId || "") || null,
    });

    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      decision: "handoff",
      reason: choice.reason,
      inboundText,
      outboundText: leadAck,
      toolCalls: ["kb_docs", "chat_state", "tenant_settings.ai", "whatsapp_send", "handoff_notify"],
    });

    return { decision: "handoff", reason: choice.reason };
  }

  const responseText = makeLeadFacingReply({
    tenantAi: aiConfig,
    decision: choice.decision,
    inboundText,
    kbDocs,
  });

  await sendMetaTextMessage({
    channel,
    to: leadPhone,
    text: responseText,
  });

  await addMessage({
    chatId,
    tenantId,
    text: responseText,
    sender: "agent",
    channelPhoneNumberId: channel.phoneNumberId,
    senderName: "AI Sales Agent",
  });

  await saveAiLog({
    logDocId,
    tenantId,
    chatId,
    messageId,
    decision: choice.decision,
    reason: choice.reason,
    inboundText,
    outboundText: responseText,
    toolCalls: ["kb_docs", "chat_state", "tenant_settings.ai", "whatsapp_send"],
  });

  return {
    decision: choice.decision,
    reason: choice.reason,
  };
}