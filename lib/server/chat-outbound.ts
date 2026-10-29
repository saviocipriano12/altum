import { FieldValue } from "firebase-admin/firestore";
import type { File as StorageFile } from "@google-cloud/storage";
import { createHash, randomUUID } from "node:crypto";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import { assertInboundAutomationDeliveryAllowed, InboundAutomationPreparingError } from "@/lib/server/automation-inbound-execution";
import { assertProposalAutomationDeliveryAllowed, proposalAutomationFingerprint } from "@/lib/server/automation-proposal-delivery";
import { assertStageAutomationDeliveryAllowed, stageAutomationFingerprint, StageAutomationAuthorizationError } from "@/lib/server/automation-stage-delivery";
import { firebaseStorageBucketCandidates, saveChatMediaBuffer, saveImmutableFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";
import { sendTenantChatMediaLink, sendTenantChatText, sendTenantChatTemplate, sendTenantHandoffAlert, type ChatDispatchActor, type ChatMediaType } from "@/lib/server/chat-dispatch";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { createMobileAudioRenditions } from "@/lib/server/audio-transcode";
import {
  ChatOutboundIdempotencyError,
  createChatOutboundFingerprint,
  createChatOutboundIdentity,
  normalizeChatOutboundRequestId,
} from "@/lib/server/chat-outbound-idempotency";
import { commitChatOutboundEnqueue } from "@/lib/server/chat-outbound-enqueue";
import { assertOutboundMediaPath, readVerifiedOutboundMedia } from "@/lib/server/chat-media-integrity";
import { normalizeOutboundText, normalizeOutboundReplyId } from "@/lib/server/chat-outbound-payload";
import { readConversationTurn, readConversationTurnWithVersions } from "@/lib/server/ai/conversation-turn-store";
import { withoutAiExecutionAuthority } from "@/lib/server/ai/execution-authority";
import { assertChatStateScope } from "@/lib/chat-state-scope";
import { normalizeOutboundTemplate, outboundTemplatePreview } from "@/lib/server/chat-outbound-template";
import { normalizeAiVoiceRequest, prepareAiVoiceArtifacts, type AiVoiceArtifacts } from "@/lib/server/ai/voice-outbox";
import { AiVoicePreparationError } from "@/lib/server/ai/voice-delivery-errors";
import { normalizeKnowledgeMedia, prepareKnowledgeMedia, assertKnowledgeMediaSource, AiKnowledgeMediaPreparationError, type KnowledgeMediaRequest, type KnowledgeMediaArtifact } from "@/lib/server/ai/knowledge-media-outbox";
import { normalizeHandoffAckAuthorization, handoffPauseMatches, handoffAcknowledgementRequestId, HandoffPauseConflictError, type HandoffAckAuthorization } from "@/lib/server/ai/handoff-delivery";
import { normalizePhone } from "@/app/lib/server/phone";
import { normalizeMcpMessageApproval, appendMcpMessageAcceptance, assertMcpMessageDeliveryAllowed, type McpMessageApproval } from "@/lib/server/mcp/message-approval";
import { normalizeCampaignRequest, campaignRequestFingerprint, campaignDeliveryId, campaignRecipientRequestId, appendCampaignRecipientAcceptance,
  assertCampaignRecipientAllowed, persistCampaignRecipientResult, CampaignDeliveryDeferredError, type CampaignRecipientRequest } from "@/lib/server/campaign-recipient-contract";
import { prepareCampaignAsset, type CampaignAsset } from "@/lib/server/campaign-media-artifact";
import { assertSocialReplyAllowed, sendSocialReply, persistSocialReplyResult } from "./social/reply-contract";
import { assertEcommerceActionDeliveryAllowed, EcommerceActionAuthorizationError, type EcommerceDeliveryAuthority } from "./commerce/shopify-action-authority";
import { commerceSnapshotDigest } from "./commerce/event-identity";

type QueuedMedia = {
  tenantId: string;
  chatId: string;
  mediaType: ChatMediaType;
  storagePath: string;
  mediaSize: number;
  filename: string;
  contentType: string;
  caption?: string;
  replyToId?: string | null;
  actor: ChatDispatchActor;
  clientRequestId?: string | null;
};

type QueuedText = {
  tenantId: string;
  chatId: string;
  text: string;
  origin?: "ai";
  aiSourceMessageId?: string;
  aiDeliveryExpiresAt?: Date;
  handoffAckAuthorization?: HandoffAckAuthorization;
  atomicHandoffPause?: boolean;
  replyToId?: string | null;
  actor: ChatDispatchActor;
  clientRequestId?: string | null;
  /** Internal stable origin for a lead start, before a canonical chat is known. */
  idempotencyScope?: string;
  mcpApproval?: McpMessageApproval;
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function previewForMedia(type: ChatMediaType, caption: string, filename: string) {
  if (caption) return caption;
  if (type === "image") return "[Imagem enviada]";
  if (type === "video") return "[Video enviado]";
  if (type === "audio") return "[Audio enviado]";
  return filename ? `[Documento enviado: ${filename}]` : "[Documento enviado]";
}

async function uploadedFile(path: string) {
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(path);
    const [exists] = await file.exists();
    if (exists) return file;
  }
  return null;
}

export async function queueTenantChatText(input: QueuedText) {
  const tenantId = clean(input.tenantId, 180);
  const chatId = clean(input.chatId, 180);
  const text = normalizeOutboundText(input.text);
  const replyToId = normalizeOutboundReplyId(input.replyToId);
  const aiSourceMessageId = input.origin === "ai" ? clean(input.aiSourceMessageId, 240) : "";
  const handoffAckAuthorization = normalizeHandoffAckAuthorization(input.handoffAckAuthorization);
  const mcpApproval = normalizeMcpMessageApproval(input.mcpApproval);
  if (mcpApproval && (input.origin === "ai" || input.idempotencyScope)) throw new Error("Falha de integridade: aprovacao MCP incompativel com origem.");
  if (handoffAckAuthorization && (input.origin !== "ai" || handoffAckAuthorization.sourceMessageId !== aiSourceMessageId || input.clientRequestId !== handoffAcknowledgementRequestId(aiSourceMessageId))) throw new Error("Falha de integridade: autorizacao restrita a confirmacao do encaminhamento.");
  if (!tenantId || !chatId || !text) throw new Error("tenantId, chatId e text sao obrigatorios.");
  const identity = createChatOutboundIdentity({
    tenantId, chatId: clean(input.idempotencyScope, 180) || chatId,
    clientRequestId: normalizeChatOutboundRequestId(input.clientRequestId),
  });
  return commitChatOutboundEnqueue({
    tenantId, chatId, identity, actor: input.actor, replyToId, preview: text,
    stateId: getChatStateDocId(tenantId, chatId), pauseAi: input.origin !== "ai",
    beforeCommit: input.atomicHandoffPause && handoffAckAuthorization ? async (batch, chat) => {
      if (handoffAckAuthorization.pausedUntilMs <= Date.now()) throw new HandoffPauseConflictError();
      const stateRef = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));
      const [state, coordinator] = await Promise.all([stateRef.get(), readConversationTurnWithVersions(tenantId, chatId)]), data = state.data() || {};
      const turn = coordinator.snapshot;
      if ((state.exists && (data.tenantId !== tenantId || data.chatId !== chatId)) || (turn.exists && (turn.data()?.tenantId !== tenantId || turn.data()?.chatId !== chatId))) throw new Error("Falha de integridade: encaminhamento fora do tenant.");
      if ((turn.data()?.latestMessageId && turn.data()?.latestMessageId !== aiSourceMessageId) ||
        (String(chat.assignedTo || chat.ownerId || "") || null) !== handoffAckAuthorization.ownerId) throw new HandoffPauseConflictError();
      if (!handoffPauseMatches(data, handoffAckAuthorization) && (data.aiEnabled === false || data.humanOwnerUserId || timestampMs(data.pausedUntil) > Date.now() ||
        data.handoffSourceMessageId === aiSourceMessageId)) throw new HandoffPauseConflictError();
      const patch = { tenantId, chatId, aiEnabled: false, pausedUntil: new Date(handoffAckAuthorization.pausedUntilMs), humanOwnerUserId: handoffAckAuthorization.ownerId,
        pauseReason: "handoff_requested", updatedBy: "altum_ai_handoff", updatedByName: "Assistente Altum", handoffPauseToken: handoffAckAuthorization.token,
        handoffSourceMessageId: aiSourceMessageId, handoffAckAuthorization, updatedAt: FieldValue.serverTimestamp() };
      if (state.exists && state.updateTime) batch.update(stateRef, patch, { lastUpdateTime: state.updateTime }); else batch.create(stateRef, patch);
      for (const version of coordinator.versions) if (version.exists && version.updateTime) batch.update(version.ref, { tenantId }, { lastUpdateTime: version.updateTime });
    } : mcpApproval ? (batch, chat) => appendMcpMessageAcceptance(batch, { approval: mcpApproval, tenantId, chatId, ...identity, actor: input.actor, chat, payload: { kind: "text", text, replyToId } }) : undefined,
    fingerprint: createChatOutboundFingerprint([input.origin === "ai" ? "ai-text-v1" : "text-v1", tenantId, chatId, text, replyToId,
      ...(input.origin === "ai" ? [aiSourceMessageId] : []), ...(handoffAckAuthorization ? [handoffAckAuthorization] : []), ...(mcpApproval ? [mcpApproval] : [])]),
    build: (chat) => ({
      message: { text, type: "text", channel: clean(chat.channel, 40) || "whatsapp", ...(input.origin === "ai" ? { aiGenerated: true } : {}) },
      job: { kind: "text", text, ...(mcpApproval ? { mcpApproval } : {}), ...(input.origin === "ai" ? { origin: "ai", aiSourceMessageId,
        ...(handoffAckAuthorization ? { handoffAckAuthorization } : {}),
        ...(input.aiDeliveryExpiresAt ? { aiDeliveryExpiresAt: input.aiDeliveryExpiresAt } : {}) } : {}) },
    }),
  });
}

export async function queueTenantHandoffAcknowledgement(input: { tenantId: string; chatId: string; sourceMessageId: string; agentName: string; text: string }) {
  const clientRequestId = handoffAcknowledgementRequestId(input.sourceMessageId);
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: input.chatId, clientRequestId });
  const [job, chat, state] = await adminDb.getAll(adminDb.collection("chat_outbound_jobs").doc(identity.jobId), adminDb.collection("chats").doc(input.chatId),
    adminDb.collection("chat_state").doc(getChatStateDocId(input.tenantId, input.chatId)));
  if (!chat.exists || chat.data()?.tenantId !== input.tenantId) throw new Error("Conversa fora do tenant.");
  const prior = job.exists ? normalizeHandoffAckAuthorization(job.data()?.handoffAckAuthorization)
    : state.data()?.handoffSourceMessageId === input.sourceMessageId ? normalizeHandoffAckAuthorization(state.data()?.handoffAckAuthorization) : null;
  const authorization: HandoffAckAuthorization = prior || { token: randomUUID(), sourceMessageId: input.sourceMessageId, pausedUntilMs: Date.now() + 1800000,
    ownerId: String(chat.data()?.assignedTo || chat.data()?.ownerId || "") || null };
  const enqueue = (proof: HandoffAckAuthorization) => queueTenantChatText({ tenantId: input.tenantId, chatId: input.chatId, text: input.text, origin: "ai", aiSourceMessageId: input.sourceMessageId,
    actor: { id: "altum_ai", name: input.agentName }, clientRequestId, handoffAckAuthorization: proof, atomicHandoffPause: true });
  try { return await enqueue(authorization); }
  catch (error) {
    if (!(error instanceof ChatOutboundIdempotencyError)) throw error;
    const winner = await adminDb.collection("chat_outbound_jobs").doc(identity.jobId).get();
    const winnerProof = normalizeHandoffAckAuthorization(winner.data()?.handoffAckAuthorization);
    if (!winner.exists || !winnerProof || winner.data()?.tenantId !== input.tenantId || winner.data()?.chatId !== input.chatId) throw error;
    // Concurrent first callers may have minted different tokens/deadlines.
    // Reuse the WINNING immutable authorization; changed text still conflicts.
    return enqueue(winnerProof);
  }
}

export async function queueTenantHandoffAlert(input: {
  tenantId: string; chatId: string; sourceMessageId: string; channelId: string; phoneNumberId?: string;
  recipientPhone: string; text: string; clientRequestId: string;
}) {
  const tenantId = clean(input.tenantId, 180), chatId = clean(input.chatId, 180), text = normalizeOutboundText(input.text);
  const recipientPhone = normalizePhone(input.recipientPhone), channelId = clean(input.channelId, 180), phoneNumberId = clean(input.phoneNumberId, 180), sourceMessageId = clean(input.sourceMessageId, 240);
  if (!tenantId || !chatId || !channelId || !sourceMessageId || !/^\d{10,15}$/.test(recipientPhone)) throw new Error("Dados do alerta de encaminhamento invalidos.");
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: normalizeChatOutboundRequestId(input.clientRequestId) });
  return commitChatOutboundEnqueue({ tenantId, chatId, identity, internalOnly: true, actor: { id: "altum_ai_handoff", name: "Assistente Altum" },
    replyToId: null, preview: "", stateId: getChatStateDocId(tenantId, chatId), pauseAi: false,
    fingerprint: createChatOutboundFingerprint(["handoff-alert-v1", tenantId, chatId, sourceMessageId, channelId, phoneNumberId, recipientPhone, text]),
    build: () => ({ message: {}, job: { kind: "handoff_alert", origin: "handoff_alert", sourceMessageId, channelId, phoneNumberId, recipientPhone, text } }) });
}

export async function queueTenantChatKnowledgeMedia(input: KnowledgeMediaRequest & {
  tenantId: string; chatId: string; aiSourceMessageId: string; actor: ChatDispatchActor; clientRequestId: string;
}) {
  const request = normalizeKnowledgeMedia(input), tenantId = clean(input.tenantId, 180), chatId = clean(input.chatId, 180), aiSourceMessageId = clean(input.aiSourceMessageId, 240);
  if (!tenantId || !chatId || !aiSourceMessageId) throw new Error("Material sem tenant, conversa ou mensagem de origem.");
  await assertKnowledgeMediaSource(tenantId, request);
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: normalizeChatOutboundRequestId(input.clientRequestId) });
  return commitChatOutboundEnqueue({ tenantId, chatId, identity, actor: input.actor, replyToId: null, preview: request.caption,
    stateId: getChatStateDocId(tenantId, chatId), pauseAi: false,
    fingerprint: createChatOutboundFingerprint(["ai-knowledge-v1", tenantId, chatId, aiSourceMessageId, request]),
    build: chat => ({ message: { text: request.caption, type: request.mediaType, channel: clean(chat.channel, 40) || "whatsapp", aiGenerated: true,
      sourceMediaUrl: request.mediaUrl, knowledgeDocId: request.kbDocId, mediaName: request.filename },
    job: { kind: "ai_knowledge_media", origin: "ai", aiSourceMessageId, ...request } }) });
}

export async function queueTenantChatVoice(input: {
  tenantId: string; chatId: string; text: string; voice?: string; maxChars?: number; aiSourceMessageId: string;
  aiDeliveryExpiresAt?: Date; actor: ChatDispatchActor; clientRequestId: string;
}) {
  const tenantId = clean(input.tenantId, 180), chatId = clean(input.chatId, 180), aiSourceMessageId = clean(input.aiSourceMessageId, 240);
  if (!tenantId || !chatId || !aiSourceMessageId) throw new Error("Voz sem tenant, conversa ou mensagem de origem.");
  const request = normalizeAiVoiceRequest(input);
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: normalizeChatOutboundRequestId(input.clientRequestId) });
  return commitChatOutboundEnqueue({ tenantId, chatId, identity, actor: input.actor, replyToId: null,
    preview: request.transcript, stateId: getChatStateDocId(tenantId, chatId), pauseAi: false,
    fingerprint: createChatOutboundFingerprint(["ai-voice-v1", tenantId, chatId, aiSourceMessageId, request]),
    build: (chat) => {
      if (chat.channel && chat.channel !== "whatsapp") throw new Error("Resposta em voz automatica disponivel apenas para WhatsApp.");
      return { message: { text: request.transcript, type: "audio", channel: "whatsapp", aiGenerated: true, voiceReply: true,
        voiceReplyVoice: request.voice, voiceReplyTranscript: request.transcript },
      job: { kind: "ai_voice", origin: "ai", aiSourceMessageId, ...request,
        ...(input.aiDeliveryExpiresAt ? { aiDeliveryExpiresAt: input.aiDeliveryExpiresAt } : {}) } };
    } });
}

export async function queueTenantChatTemplate(input: {
  tenantId: string; chatId: string; templateName: string; languageCode?: string;
  bodyParams?: string[]; headerMedia?: Parameters<typeof sendTenantChatTemplate>[0]["headerMedia"];
  origin?: "ai"; aiSourceMessageId?: string;
  mcpApproval?: McpMessageApproval; displayText?: string;
  ecommerceAuthority?: EcommerceDeliveryAuthority;
  actor: ChatDispatchActor; clientRequestId?: string | null;
}) {
  const template = normalizeOutboundTemplate(input);
  const tenantId = clean(input.tenantId, 180), chatId = clean(input.chatId, 180);
  const aiSourceMessageId = input.origin === "ai" ? clean(input.aiSourceMessageId, 240) : "";
  const mcpApproval = normalizeMcpMessageApproval(input.mcpApproval);
  if (mcpApproval && input.origin === "ai") throw new Error("Falha de integridade: aprovacao MCP incompativel com origem.");
  const displayText = input.displayText ? normalizeOutboundText(input.displayText) : "";
  if (!tenantId || !chatId || (input.origin === "ai" && !aiSourceMessageId)) throw new Error("Template sem tenant, conversa ou mensagem de origem.");
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: normalizeChatOutboundRequestId(input.clientRequestId) });
  const preview = displayText || outboundTemplatePreview(template);
  return commitChatOutboundEnqueue({ tenantId, chatId, identity, actor: input.actor, replyToId: null,
    preview, stateId: getChatStateDocId(tenantId, chatId), pauseAi: input.origin !== "ai" && !input.ecommerceAuthority?.automatic,
    beforeCommit: mcpApproval ? (batch, chat) => appendMcpMessageAcceptance(batch, { approval: mcpApproval, tenantId, chatId, ...identity, actor: input.actor, chat, payload: { kind: "template", ...template, displayText } }) : undefined,
    fingerprint: createChatOutboundFingerprint([input.origin === "ai" ? "ai-template-v1" : "template-v1", tenantId, chatId, template,
      ...(input.origin === "ai" ? [aiSourceMessageId] : []), ...(mcpApproval ? [mcpApproval] : []), ...(input.ecommerceAuthority ? [commerceSnapshotDigest(input.ecommerceAuthority)] : []), ...(displayText ? [displayText] : [])]),
    build: () => ({ message: { text: preview, type: "template", channel: "whatsapp", templateName: template.templateName,
      templateLanguage: template.languageCode, templateParams: template.bodyParams, ...(input.origin === "ai" || input.ecommerceAuthority?.automatic ? { aiGenerated: true } : {}),
      ...(template.headerMedia ? { templateHeaderMedia: template.headerMedia } : {}) },
      job: { kind: "template", ...template, ...(mcpApproval ? { mcpApproval } : {}), ...(input.ecommerceAuthority ? { ecommerceAuthority: input.ecommerceAuthority } : {}), ...(displayText ? { displayText } : {}), ...(input.origin === "ai" ? { origin: "ai", aiSourceMessageId } : {}) } }),
  });
}

export async function queueTenantCampaignRecipient(input: { tenantId: string; chatId: string; request: CampaignRecipientRequest; actor: ChatDispatchActor }) {
  const request = normalizeCampaignRequest(input.request), { tenantId, chatId } = input;
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: campaignRecipientRequestId(tenantId, request.runId, request.leadId) });
  return commitChatOutboundEnqueue({ tenantId, chatId, identity, actor: input.actor, preview: request.payload.text, replyToId: null,
    stateId: getChatStateDocId(tenantId, chatId), pauseAi: false, fingerprint: campaignRequestFingerprint(tenantId, chatId, request),
    beforeCommit: batch => appendCampaignRecipientAcceptance(batch, { tenantId, chatId, ...identity, request }),
    build: () => ({ message: { text: request.payload.text, type: request.payload.kind === "template" ? "template" : request.payload.kind === "media" ? request.payload.source.type : "text",
      channel: "whatsapp", campaignId: request.campaignId, campaignRunId: request.runId,
      ...(request.payload.kind === "template" ? { templateName: request.payload.template.templateName, templateLanguage: request.payload.template.languageCode,
        templateParams: request.payload.template.bodyParams, templateHeaderMedia: request.payload.template.headerMedia } : {}),
      ...(request.payload.kind === "media" ? { sourceMediaUrl: request.payload.source.url, mediaName: request.payload.source.filename } : {}) },
      job: { kind: "campaign_delivery", campaignRequest: request, campaignDeliveryId: campaignDeliveryId(tenantId, request.runId, request.leadId) } }) });
}

export async function queueTenantChatMedia(input: QueuedMedia) {
  const tenantId = clean(input.tenantId, 180);
  const chatId = clean(input.chatId, 180);
  const storagePath = clean(input.storagePath, 900);
  const filename = clean(input.filename, 180) || "arquivo";
  const contentType = clean(input.contentType, 180) || "application/octet-stream";
  const caption = clean(input.caption, 1024);
  const replyToId = clean(input.replyToId, 180) || null;
  const mediaSize = Math.max(0, Number(input.mediaSize || 0));
  if (!tenantId || !chatId || !storagePath || !mediaSize) throw new Error("Dados da midia pendente estao incompletos.");
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: normalizeChatOutboundRequestId(input.clientRequestId) });
  const preview = previewForMedia(input.mediaType, caption, filename);
  return commitChatOutboundEnqueue({
    tenantId, chatId, identity, actor: input.actor, replyToId, preview,
    stateId: getChatStateDocId(tenantId, chatId),
    fingerprint: createChatOutboundFingerprint(["media-v1", tenantId, chatId, input.mediaType, storagePath, mediaSize, filename, contentType, caption, replyToId]),
    build: () => ({
      message: { text: preview, type: input.mediaType, channel: "whatsapp", mediaUrl: storagePath,
        mediaName: filename, mediaMimeType: contentType, mediaSize, ...(caption ? { caption } : {}) },
      job: { kind: "media", mediaType: input.mediaType, storagePath, mediaSize, filename, contentType, caption },
    }),
  });
}

export async function queueTenantChatMediaBuffer(input: Omit<QueuedMedia, "storagePath" | "mediaSize"> & { buffer: Buffer }) {
  const clientRequestId = normalizeChatOutboundRequestId(input.clientRequestId);
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: input.chatId, clientRequestId });
  const tenantId = clean(input.tenantId, 180);
  const chatId = clean(input.chatId, 180);
  if (!input.buffer.length) throw new Error("Arquivo vazio.");
  const prefix = `chat-media/${tenantId}/${chatId}/`;
  const [existing, chat] = await adminDb.getAll(adminDb.collection("chat_outbound_jobs").doc(identity.jobId), adminDb.collection("chats").doc(chatId));
  if (!chat.exists || chat.data()?.tenantId !== tenantId) throw new Error("Conversa nao encontrada para esta empresa.");
  if (existing.exists && (existing.data()?.tenantId !== tenantId || existing.data()?.chatId !== chatId || existing.data()?.kind !== "media")) throw new ChatOutboundIdempotencyError();
  // Stable object path independent of filename/MIME: racing edits cannot create
  // a second variant for this attempt. Content-Type and download name stay intact.
  const path = existing.exists ? clean(existing.data()?.storagePath, 900) : `${prefix}${identity.messageId}.bin`;
  if (!path.startsWith(prefix) || path.includes("..") || !path.slice(prefix.length).startsWith(`${identity.messageId}.`)) throw new ChatOutboundIdempotencyError();
  const queuedInput = { ...input, tenantId, chatId, clientRequestId, storagePath: path, mediaSize: input.buffer.length };
  const replay = existing.exists ? await queueTenantChatMedia(queuedInput) : null;
  const storageInput = {
    path, data: input.buffer, requireExisting: existing.exists,
    options: { metadata: { contentType: input.contentType || "application/octet-stream", cacheControl: "private,max-age=3600" }, resumable: false },
  };
  // Validate a legacy object BEFORE binding its digest; a conflicting retry
  // must not poison the immutable upload admission with unverified bytes.
  if (existing.exists) await saveImmutableFirebaseStorageFileWithFallback(storageInput);
  const contentSha256 = createHash("sha256").update(input.buffer).digest("hex");
  const requestFingerprint = createChatOutboundFingerprint([
    "immutable-media-v1", tenantId, chatId, path, contentSha256, input.mediaType,
    clean(input.filename, 180) || "arquivo", clean(input.contentType, 180) || "application/octet-stream",
    clean(input.caption, 1024), clean(input.replyToId, 180) || null,
  ]);
  const admission = adminDb.collection("chat_media_uploads").doc(identity.jobId);
  try {
    await admission.create({ tenantId, chatId, storagePath: path, contentSha256, requestFingerprint,
      mediaSize: input.buffer.length, clientRequestId, createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    const accepted = await admission.get();
    if (!accepted.exists) throw error;
    if (accepted.data()?.tenantId !== tenantId || accepted.data()?.chatId !== chatId || accepted.data()?.requestFingerprint !== requestFingerprint) throw new ChatOutboundIdempotencyError();
  }
  if (!existing.exists) {
    // Firestore binds an attempt to one digest before any object mutation,
    // independently of whether a storage emulator honors GCS preconditions.
    const stored = await saveImmutableFirebaseStorageFileWithFallback(storageInput);
    await admission.set({ uploaded: true, bucketName: stored.bucketName, uploadedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return replay || queueTenantChatMedia(queuedInput);
}

/** Bind a browser-uploaded object without copying or rewriting its bytes. */
export async function queueTenantChatStoredMedia(input: QueuedMedia & { file: StorageFile; expectedContentSha256?: string }) {
  const tenantId = clean(input.tenantId, 180), chatId = clean(input.chatId, 180);
  const storagePath = clean(input.storagePath, 900);
  assertOutboundMediaPath(tenantId, chatId, storagePath);
  if (input.file.name !== storagePath) throw new ChatOutboundIdempotencyError();
  const clientRequestId = normalizeChatOutboundRequestId(input.clientRequestId);
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId });
  const [existing, chat] = await adminDb.getAll(adminDb.collection("chat_outbound_jobs").doc(identity.jobId), adminDb.collection("chats").doc(chatId));
  if (!chat.exists || chat.data()?.tenantId !== tenantId) throw new Error("Conversa nao encontrada para esta empresa.");
  if (existing.exists && (existing.data()?.tenantId !== tenantId || existing.data()?.chatId !== chatId || existing.data()?.kind !== "media")) throw new ChatOutboundIdempotencyError();
  const queuedInput = { ...input, tenantId, chatId, storagePath, clientRequestId };
  // Validate legacy request metadata before creating an immutable admission:
  // a changed-caption replay must not bind an already accepted job to new data.
  const replay = existing.exists ? await queueTenantChatMedia(queuedInput) : null;
  let verified: Awaited<ReturnType<typeof readVerifiedOutboundMedia>>;
  try { verified = await readVerifiedOutboundMedia({ tenantId, chatId, jobId: identity.jobId, storagePath, file: input.file }); }
  catch (error) {
    if (error instanceof Error && /Falha de integridade:/.test(error.message)) throw new ChatOutboundIdempotencyError();
    throw error;
  }
  if (verified.source.length !== input.mediaSize || (input.expectedContentSha256 !== undefined && verified.sha256 !== input.expectedContentSha256)) throw new ChatOutboundIdempotencyError();
  const requestFingerprint = createChatOutboundFingerprint([
    "immutable-media-v1", tenantId, chatId, storagePath, verified.sha256, input.mediaType,
    clean(input.filename, 180) || "arquivo", clean(input.contentType, 180) || "application/octet-stream",
    clean(input.caption, 1024), clean(input.replyToId, 180) || null,
  ]);
  const admission = adminDb.collection("chat_media_uploads").doc(identity.jobId);
  try {
    await admission.create({ tenantId, chatId, storagePath, contentSha256: verified.sha256, requestFingerprint,
      mediaSize: verified.source.length, clientRequestId, uploaded: true, bucketName: input.file.bucket.name,
      sourceGeneration: verified.generation, createdAt: FieldValue.serverTimestamp(), uploadedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    const accepted = await admission.get();
    if (!accepted.exists) throw error;
    if (accepted.data()?.tenantId !== tenantId || accepted.data()?.chatId !== chatId || accepted.data()?.requestFingerprint !== requestFingerprint ||
      (accepted.data()?.bucketName && accepted.data()?.bucketName !== input.file.bucket.name)) throw new ChatOutboundIdempotencyError();
  }
  return replay || queueTenantChatMedia(queuedInput);
}

const CHAT_OUTBOUND_LEASE_MS = 5 * 60_000;
const CHAT_OUTBOUND_MAX_ATTEMPTS = 5;
const TERMINAL_OUTBOUND_STATUSES = new Set(["completed", "dead_letter", "cancelled"]);

function timestampMs(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return 0;
}

function outboundLockId(tenantId: string, chatId: string) {
  return createChatOutboundFingerprint(["chat-outbound-lock-v1", tenantId, chatId]).slice(0, 48);
}

async function assertAiOutboundDeliveryAllowed(job: Record<string, unknown>) {
  await assertEcommerceActionDeliveryAllowed(job);
  await assertSocialReplyAllowed(job);
  await assertMcpMessageDeliveryAllowed(job);
  await assertCampaignRecipientAllowed(job);
  if (job.origin !== "ai") return;
  if (job.aiDeliveryExpiresAt && timestampMs(job.aiDeliveryExpiresAt) <= Date.now()) {
    throw new Error("Resposta automatica desatualizada. Consulte novamente antes de confirmar preco ou estoque.");
  }
  const tenantId = clean(job.tenantId, 180), chatId = clean(job.chatId, 180), sourceId = clean(job.aiSourceMessageId, 240);
  if (sourceId) {
    const turn = await readConversationTurn(tenantId, chatId);
    const data = turn.data();
    if (turn.exists && (data?.tenantId !== job.tenantId || data?.chatId !== job.chatId)) throw new Error("Falha de integridade: coordenacao da conversa fora do tenant.");
    if (data?.latestMessageId && data.latestMessageId !== sourceId) throw new Error("Resposta automatica desatualizada por uma nova mensagem do cliente.");
  }
  const state = await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).get();
  assertChatStateScope(state.data(), tenantId, chatId);
  if (job.handoffAckAuthorization) {
    const proof = normalizeHandoffAckAuthorization(job.handoffAckAuthorization)!;
    if (state.data()?.tenantId !== tenantId || state.data()?.chatId !== chatId || job.kind !== "text" || job.clientRequestId !== handoffAcknowledgementRequestId(sourceId) || proof.sourceMessageId !== sourceId ||
      proof.pausedUntilMs <= Date.now() || !handoffPauseMatches(state.data() || {}, proof)) throw new Error("Resposta automatica pausada: autorizacao de encaminhamento revogada ou expirada.");
    return;
  }
  if (state.data()?.aiEnabled === false || timestampMs(state.data()?.pausedUntil) > Date.now()) {
    throw new Error("Resposta automatica pausada antes da entrega. Revise com o atendente responsavel.");
  }
}

function retryDelayMs(attempt: number) {
  return Math.min(15 * 60_000, 10_000 * 2 ** Math.max(0, attempt - 1));
}

function isPermanentPreflightError(message: string) {
  return /nao encontrad|fora do tenant|sem telefone|identificador do contato|canal .* nao configurado|janela de 24h|tipo de midia invalido|nao pertence|falha de integridade|resposta automatica pausada|resposta automatica desatualizada/i.test(message);
}

export function classifyChatOutboundFailure(input: { deliveryAttempted: boolean; attempt: number; message: string }) {
  const permanent = !input.deliveryAttempted && isPermanentPreflightError(input.message);
  const exhausted = !input.deliveryAttempted && input.attempt >= CHAT_OUTBOUND_MAX_ATTEMPTS;
  const status = input.deliveryAttempted
    ? "reconciliation_required" as const
    : permanent || exhausted
      ? "dead_letter" as const
      : "retrying" as const;
  const errorCode = input.deliveryAttempted
    ? "PROVIDER_OUTCOME_UNKNOWN"
    : permanent
      ? "PREFLIGHT_PERMANENT"
      : exhausted
        ? "RETRY_EXHAUSTED"
        : "SAFE_RETRY";
  return { status, errorCode, retryAt: status === "retrying" ? new Date(Date.now() + retryDelayMs(input.attempt)) : null };
}

export async function processChatOutboundJobs(input?: { limit?: number; jobId?: string }) {
  return withoutAiExecutionAuthority(() => processChatOutboundJobsInWorker(input));
}

async function processChatOutboundJobsInWorker(input?: { limit?: number; jobId?: string }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 5)));
  const docs = input?.jobId
    ? [await adminDb.collection("chat_outbound_jobs").doc(input.jobId).get()].filter((doc) => doc.exists)
    : (await Promise.all(["ready", "retrying", "processing"].map((status) =>
        adminDb.collection("chat_outbound_jobs").where("status", "==", status).limit(limit * 10).get()
      )))
        .flatMap((snapshot) => snapshot.docs)
        .sort((left, right) => {
          const due = timestampMs(left.data().dueAt) - timestampMs(right.data().dueAt);
          return due || Number(left.data().sequence || 0) - Number(right.data().sequence || 0) || left.id.localeCompare(right.id);
        });
  const results: Array<{ jobId: string; status: "sent" | "retrying" | "dead_letter" | "reconciliation_required" | "skipped"; error?: string }> = [];

  for (const doc of docs) {
    if (results.length >= limit) break;
    const leaseToken = normalizeChatOutboundRequestId(`lease-${randomUUID()}`);
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(doc.ref);
      if (!fresh.exists) return null;
      const data = fresh.data() || {};
      const status = clean(data.status, 30);
      if (!new Set(["ready", "retrying", "processing"]).has(status)) return null;
      if (status === "processing" && timestampMs(data.leaseUntil) > Date.now()) return null;
      const due = timestampMs(data.dueAt);
      if (due && due > Date.now()) return null;
      const predecessorJobId = clean(data.predecessorJobId, 240);
      const predecessor = predecessorJobId
        ? await transaction.get(adminDb.collection("chat_outbound_jobs").doc(predecessorJobId))
        : null;
      if (predecessor?.exists && !TERMINAL_OUTBOUND_STATUSES.has(clean(predecessor.data()?.status, 30))) return null;
      const tenantId = clean(data.tenantId, 180);
      const chatId = clean(data.chatId, 180);
      const lockScope = data.kind === "handoff_alert" ? `alert:${clean(data.channelId, 180)}:${clean(data.recipientPhone, 20)}` : chatId;
      const lockRef = adminDb.collection("chat_outbound_locks").doc(outboundLockId(tenantId, lockScope));
      const lock = await transaction.get(lockRef);
      if (lock.exists && timestampMs(lock.data()?.leaseUntil) > Date.now() && clean(lock.data()?.jobId, 240) !== doc.id) return null;
      transaction.set(doc.ref, {
        status: "processing",
        attempts: FieldValue.increment(1),
        leaseToken,
        leaseUntil: new Date(Date.now() + CHAT_OUTBOUND_LEASE_MS),
        recoveredLease: status === "processing",
        ...(status !== "processing" ? { deliveryProtocolVersion: 1 } : {}),
        leaseDeliveryProtocolVersion: 1,
        leaseDeliveryProtocolToken: leaseToken,
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(lockRef, { tenantId, chatId, jobId: doc.id, leaseToken, leaseUntil: new Date(Date.now() + CHAT_OUTBOUND_LEASE_MS), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { ...(data as Record<string, unknown>), lockId: lockRef.id } as Record<string, unknown>;
    });
    if (!claimed) {
      if (input?.jobId) results.push({ jobId: doc.id, status: "skipped" });
      continue;
    }

    const messageId = clean(claimed.messageId, 240);
    const lockRef = adminDb.collection("chat_outbound_locks").doc(clean(claimed.lockId, 240));
    let deliveryAttempted = false;
    const completeLease = async (patch: Record<string, unknown>, messagePatch?: Record<string, unknown>) => {
      return adminDb.runTransaction(async (transaction) => {
        const [job, lock] = await Promise.all([transaction.get(doc.ref), transaction.get(lockRef)]);
        if (!job.exists || job.data()?.status !== "processing" || clean(job.data()?.leaseToken, 180) !== leaseToken ||
          !lock.exists || lock.data()?.leaseToken !== leaseToken || lock.data()?.jobId !== doc.id) return false;
        const messageRef = messageId && messagePatch ? adminDb.collection("messages").doc(messageId) : null;
        const message = messageRef ? await transaction.get(messageRef) : null;
        if (messageRef && (!message?.exists || message.data()?.tenantId !== claimed.tenantId || message.data()?.chatId !== claimed.chatId)) throw new Error("Falha de integridade: mensagem de envio fora da conversa.");
        const campaignRef = claimed.kind === "campaign_delivery" ? adminDb.collection("outbound_campaign_deliveries").doc(String(claimed.campaignDeliveryId)) : null;
        const campaignDelivery = campaignRef ? await transaction.get(campaignRef) : null;
        const campaignDeliveryOwned = campaignDelivery?.data()?.tenantId === claimed.tenantId && campaignDelivery?.data()?.outboundJobId === doc.id;
        const socialRef = claimed.kind === "social_reply" ? adminDb.collection("social_automation_logs").doc(String((claimed.socialReply as { logId: string }).logId)) : null;
        const social = socialRef ? await transaction.get(socialRef) : null;
        const socialLedgerRef = socialRef ? adminDb.collection("social_reply_deliveries").doc(doc.id) : null;
        const socialLedger = socialLedgerRef ? await transaction.get(socialLedgerRef) : null;
        transaction.set(doc.ref, { ...patch, leaseUntil: null, leaseToken: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (messageRef && messagePatch) {
          const receiptStatus = message?.data()?.deliveryStatus;
          transaction.set(messageRef, { ...messagePatch,
            ...(["delivered", "read"].includes(receiptStatus) ? { status: receiptStatus, deliveryStatus: receiptStatus } : {}),
          }, { merge: true });
        }
        if (campaignRef && campaignDeliveryOwned && !campaignDelivery?.data()?.metaMessageId && patch.status !== "completed") transaction.set(campaignRef, {
          status: patch.status === "reconciliation_required" ? "pending_confirmation" : patch.status === "dead_letter" ? "failed" : "queued",
          deliveryError: patch.error || "", deliveryErrorCode: patch.errorCode || "", updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (socialRef && social?.data()?.tenantId === claimed.tenantId && social?.data()?.deliveryJobId === doc.id && !social?.data()?.externalMessageId) transaction.update(socialRef, {
          status: patch.status === "reconciliation_required" ? "pending_confirmation" : patch.status === "dead_letter" ? "failed" : "queued",
          error: patch.error || "", errorCode: patch.errorCode || "", updatedAt: FieldValue.serverTimestamp(),
        });
        if (socialLedgerRef && socialLedger?.data()?.tenantId === claimed.tenantId && socialLedger?.data()?.logId === socialRef?.id && !socialLedger?.data()?.externalMessageId) transaction.update(socialLedgerRef, {
          status: patch.status === "reconciliation_required" ? "pending_confirmation" : patch.status === "dead_letter" ? "failed" : "queued",
          error: patch.error || "", updatedAt: FieldValue.serverTimestamp(),
        });
        if (lock.exists && clean(lock.data()?.leaseToken, 180) === leaseToken) {
          transaction.set(lockRef, { leaseUntil: new Date(0), releasedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        return true;
      });
    };
    // Commit the point of no blind retry BEFORE invoking any provider. A process
    // crash after this write must be reconciled, not treated as an unsent lease.
    const beginDeliveryAttempt = async () => {
      // Preparation (especially TTS) may take long enough for the human, source
      // turn or verified catalog deadline to change while this worker is busy.
      await assertAiOutboundDeliveryAllowed(claimed);
      await adminDb.runTransaction(async (transaction) => {
        const [job, lock] = await Promise.all([transaction.get(doc.ref), transaction.get(lockRef)]);
        if (!job.exists || job.data()?.status !== "processing" || job.data()?.leaseToken !== leaseToken ||
          timestampMs(job.data()?.leaseUntil) <= Date.now() || !lock.exists || lock.data()?.leaseToken !== leaseToken ||
          lock.data()?.jobId !== doc.id || timestampMs(lock.data()?.leaseUntil) <= Date.now()) throw new Error("Posse do envio expirou antes da entrega.");
        if (job.data()?.tenantId !== claimed.tenantId || job.data()?.chatId !== claimed.chatId || clean(job.data()?.messageId, 240) !== messageId ||
          job.data()?.requestFingerprint !== claimed.requestFingerprint || lock.data()?.tenantId !== claimed.tenantId || lock.data()?.chatId !== claimed.chatId) {
          throw new Error("Falha de integridade: reserva de entrega fora da operacao aceita.");
        }
        if (job.data()?.providerAttemptStartedAt) throw new Error("Envio anterior exige reconciliacao antes de nova tentativa.");
        await assertMcpMessageDeliveryAllowed(job.data() || {}, transaction);
        await assertCampaignRecipientAllowed(job.data() || {}, transaction);
        await assertSocialReplyAllowed(job.data() || {}, transaction);
        await assertInboundAutomationDeliveryAllowed(job.data() || {}, transaction);
        await assertProposalAutomationDeliveryAllowed(job.data() || {}, transaction);
        await assertStageAutomationDeliveryAllowed(job.data() || {}, transaction);
        await assertEcommerceActionDeliveryAllowed(job.data() || {}, transaction);
        transaction.set(doc.ref, { providerAttemptStartedAt: FieldValue.serverTimestamp(), providerAttemptId: leaseToken,
          providerAttemptCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      deliveryAttempted = true;
    };
    try {
      // Tie recovery proof to the lease token, not enqueue version: an older
      // rolling-deploy worker can claim a newly enqueued job without writing a fence.
      const priorLeaseHadDurableFenceProtocol = claimed.leaseDeliveryProtocolVersion === 1 &&
        claimed.leaseDeliveryProtocolToken === claimed.leaseToken;
      if (claimed.providerAttemptStartedAt || (claimed.status === "processing" && !priorLeaseHadDurableFenceProtocol)) {
        deliveryAttempted = true;
        throw new Error("Confirmacao do envio anterior desconhecida apos interrupcao. Reconciliacao necessaria antes de reenviar.");
      }
      await assertAiOutboundDeliveryAllowed(claimed);
      if (claimed.kind === "social_reply") {
        const externalId = await sendSocialReply(claimed, beginDeliveryAttempt);
        await persistSocialReplyResult({ jobId: doc.id, lockId: lockRef.id, leaseToken, externalId });
        results.push({ jobId: doc.id, status: "sent" }); continue;
      }
      if (claimed.kind === "campaign_delivery") {
        const request = normalizeCampaignRequest(claimed.campaignRequest as CampaignRecipientRequest), tenantId = String(claimed.tenantId), chatId = String(claimed.chatId);
        if (request.provider === "evolution" && request.payload.kind === "template") throw new Error("Falha de integridade: este canal nao suporta template de campanha.");
        const source = request.payload.kind === "media" ? request.payload.source : request.payload.kind === "template" && request.payload.template.headerMedia?.link
          ? { url: request.payload.template.headerMedia.link, type: request.payload.template.headerMedia.type } : null;
        const ready = source ? await prepareCampaignAsset({ tenantId, chatId, messageId, fingerprint: String(claimed.requestFingerprint), source,
          existing: claimed.campaignAsset as CampaignAsset | undefined, commit: artifact => adminDb.runTransaction(async tx => {
            const messageRef = adminDb.collection("messages").doc(messageId);
            const [job, lock, message] = await Promise.all([tx.get(doc.ref), tx.get(lockRef), tx.get(messageRef)]);
            if (job.data()?.status !== "processing" || job.data()?.leaseToken !== leaseToken || timestampMs(job.data()?.leaseUntil) <= Date.now() ||
              lock.data()?.leaseToken !== leaseToken || lock.data()?.jobId !== doc.id || timestampMs(lock.data()?.leaseUntil) <= Date.now()) throw new Error("Posse do preparo de campanha expirou.");
            if (job.data()?.tenantId !== tenantId || job.data()?.chatId !== chatId || job.data()?.requestFingerprint !== claimed.requestFingerprint ||
              message.data()?.tenantId !== tenantId || message.data()?.chatId !== chatId) throw new Error("Falha de integridade: preparo de campanha fora da conversa.");
            if (job.data()?.campaignAsset) return job.data()!.campaignAsset as CampaignAsset;
            tx.update(doc.ref, { campaignAsset: artifact, mediaPreparedAt: FieldValue.serverTimestamp() });
            tx.update(messageRef, { mediaUrl: artifact.storagePath, mediaMimeType: artifact.contentType, mediaSize: artifact.size });
            return artifact;
          }) }) : null;
        const actor = { id: String(claimed.actorId), name: String(claimed.actorName) };
        let externalId: string | null;
        if (request.payload.kind === "template") {
          const header = ready && request.payload.template.headerMedia ? { ...request.payload.template.headerMedia, id: undefined,
            link: (await ready.file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 3600000, queryParams: { generation: ready.artifact.generation } }))[0] } : request.payload.template.headerMedia;
          const sent = await sendTenantChatTemplate({ tenantId, chatId, ...request.payload.template, headerMedia: header, displayText: request.payload.text,
            actor, pauseAi: false, messageId, onDeliveryAttempt: beginDeliveryAttempt }); externalId = sent.metaMessageId;
        } else if (request.payload.kind === "media" && ready) {
          const sent = await sendTenantChatMediaLink({ tenantId, chatId, mediaType: request.payload.source.type, mediaUrl: "", deliveryBuffer: ready.buffer,
            legacyMediaUrl: () => ready.file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 3600000, queryParams: { generation: ready.artifact.generation } }).then(([url]) => url),
            deliveryFilename: request.payload.source.filename, filename: request.payload.source.filename, storedMediaPath: ready.artifact.storagePath, mediaSize: ready.artifact.size,
            contentType: ready.artifact.contentType, deliveryContentType: ready.artifact.contentType, caption: request.payload.text,
            actor, pauseAi: false, messageId, onDeliveryAttempt: beginDeliveryAttempt }); externalId = sent.metaMessageId;
        } else {
          const sent = await sendTenantChatText({ tenantId, chatId, text: request.payload.text, actor, pauseAi: false, allowTemplateFallback: false,
            messageId, onDeliveryAttempt: beginDeliveryAttempt }); externalId = sent.metaMessageId;
        }
        if (!externalId) throw new Error("Confirmacao de campanha sem identificador da mensagem. Reconciliacao necessaria.");
        await persistCampaignRecipientResult({ jobId: doc.id, leaseToken, lockId: lockRef.id });
        const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), externalMessageId: externalId, error: "", errorCode: "" });
        results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" }); continue;
      }
      if (claimed.kind === "handoff_alert") {
        const tenantId = clean(claimed.tenantId, 180), chatId = clean(claimed.chatId, 180), text = normalizeOutboundText(claimed.text);
        const sourceMessageId = clean(claimed.sourceMessageId, 240), channelId = clean(claimed.channelId, 180), phoneNumberId = clean(claimed.phoneNumberId, 180), recipientPhone = normalizePhone(String(claimed.recipientPhone || ""));
        if (messageId || !sourceMessageId || !channelId || !/^\d{10,15}$/.test(recipientPhone) || claimed.requestFingerprint !== createChatOutboundFingerprint(["handoff-alert-v1", tenantId, chatId, sourceMessageId, channelId, phoneNumberId, recipientPhone, text])) throw new Error("Falha de integridade: alerta alterado apos aceite.");
        const sent = await sendTenantHandoffAlert({ tenantId, chatId, text, channelId, phoneNumberId, recipientPhone, onDeliveryAttempt: beginDeliveryAttempt });
        const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), externalMessageId: sent.externalMessageId, error: "", errorCode: "" });
        results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" }); continue;
      }
      if (claimed.kind === "ai_knowledge_media") {
        const request = normalizeKnowledgeMedia(claimed);
        const fingerprint = createChatOutboundFingerprint(["ai-knowledge-v1", claimed.tenantId, claimed.chatId, claimed.aiSourceMessageId, request]);
        if (claimed.origin !== "ai" || !claimed.aiSourceMessageId || claimed.requestFingerprint !== fingerprint) throw new Error("Falha de integridade: material alterado apos aceite.");
        const tenantId = clean(claimed.tenantId, 180), chatId = clean(claimed.chatId, 180);
        const ready = await prepareKnowledgeMedia({ tenantId, chatId, messageId, request, requestFingerprint: fingerprint, existing: claimed.mediaArtifact,
          commit: artifact => adminDb.runTransaction(async transaction => {
            const messageRef = adminDb.collection("messages").doc(messageId);
            const [job, lock, message] = await Promise.all([transaction.get(doc.ref), transaction.get(lockRef), transaction.get(messageRef)]);
            if (!job.exists || job.data()?.status !== "processing" || job.data()?.leaseToken !== leaseToken || timestampMs(job.data()?.leaseUntil) <= Date.now() ||
              !lock.exists || lock.data()?.leaseToken !== leaseToken || lock.data()?.jobId !== doc.id || timestampMs(lock.data()?.leaseUntil) <= Date.now()) throw new Error("Posse do preparo do material expirou.");
            if (job.data()?.tenantId !== tenantId || job.data()?.chatId !== chatId || job.data()?.requestFingerprint !== fingerprint ||
              !message.exists || message.data()?.tenantId !== tenantId || message.data()?.chatId !== chatId) throw new Error("Falha de integridade: material fora da conversa.");
            if (job.data()?.mediaArtifact) return job.data()!.mediaArtifact as KnowledgeMediaArtifact;
            transaction.set(doc.ref, { mediaArtifact: artifact, mediaPreparedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            transaction.set(messageRef, { mediaUrl: artifact.storagePath, mediaMimeType: artifact.contentType, mediaSize: artifact.size, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            return artifact;
          }) });
        const chat = await adminDb.collection("chats").doc(chatId).get();
        if (!chat.exists || chat.data()?.tenantId !== tenantId) throw new Error("Falha de integridade: conversa do material fora do tenant.");
        const isWhatsApp = !chat.data()?.channel || chat.data()?.channel === "whatsapp";
        const isLocal = chat.data()?.channel === "site_chat";
        const mediaUrl = isWhatsApp || isLocal ? "" : (await ready.file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 3600000, queryParams: { generation: ready.artifact.generation } }))[0];
        const sent = await sendTenantChatMediaLink({ tenantId, chatId, mediaType: request.mediaType, mediaUrl,
          legacyMediaUrl: () => ready.file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 3600000,
            queryParams: { generation: ready.artifact.generation } }).then(([url]) => url),
          ...(isWhatsApp || isLocal ? { deliveryBuffer: ready.buffer, deliveryFilename: request.filename } : {}),
          storedMediaPath: ready.artifact.storagePath, mediaSize: ready.artifact.size, filename: request.filename,
          contentType: ready.artifact.contentType, deliveryContentType: ready.artifact.contentType, caption: request.caption,
          displayText: request.caption, aiGenerated: true, pauseAi: false, messageId,
          actor: { id: clean(claimed.actorId, 180), name: clean(claimed.actorName, 180) },
          onDeliveryAttempt: async () => { await assertKnowledgeMediaSource(tenantId, request); await beginDeliveryAttempt(); } });
        if (!sent.metaMessageId && chat.data()?.channel !== "site_chat") throw new Error("Confirmacao do material sem identificador. Reconciliacao necessaria.");
        const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), error: "", errorCode: "", mediaPreparationFailed: false });
        results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" }); continue;
      }
      if (claimed.kind === "ai_voice") {
        const request = normalizeAiVoiceRequest({ text: claimed.text, voice: claimed.voice, maxChars: claimed.maxChars });
        const fingerprint = createChatOutboundFingerprint(["ai-voice-v1", claimed.tenantId, claimed.chatId, claimed.aiSourceMessageId, request]);
        if (claimed.origin !== "ai" || !claimed.aiSourceMessageId || claimed.requestFingerprint !== fingerprint || claimed.transcript !== request.transcript) throw new Error("Falha de integridade: resposta em voz alterada apos aceite.");
        const ready = await prepareAiVoiceArtifacts({ tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180),
          messageId, requestFingerprint: fingerprint, request, existing: claimed.voiceArtifacts,
          commit: async (artifacts) => adminDb.runTransaction(async (transaction) => {
            const messageRef = adminDb.collection("messages").doc(messageId);
            const [job, lock, message] = await Promise.all([transaction.get(doc.ref), transaction.get(lockRef), transaction.get(messageRef)]);
            if (!job.exists || job.data()?.status !== "processing" || job.data()?.leaseToken !== leaseToken || timestampMs(job.data()?.leaseUntil) <= Date.now() ||
              !lock.exists || lock.data()?.leaseToken !== leaseToken || lock.data()?.jobId !== doc.id || timestampMs(lock.data()?.leaseUntil) <= Date.now()) throw new Error("Posse do preparo de voz expirou.");
            if (job.data()?.tenantId !== claimed.tenantId || job.data()?.chatId !== claimed.chatId || job.data()?.requestFingerprint !== fingerprint ||
              !message.exists || message.data()?.tenantId !== claimed.tenantId || message.data()?.chatId !== claimed.chatId) throw new Error("Falha de integridade: preparo da voz fora da conversa.");
            if (job.data()?.voiceArtifacts) return job.data()!.voiceArtifacts as AiVoiceArtifacts;
            transaction.set(doc.ref, { voiceArtifacts: artifacts, voicePreparedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            transaction.set(messageRef, { mediaUrl: artifacts.playback.storagePath, mediaName: "Resposta em audio ALTUM.mp3", mediaMimeType: artifacts.playback.contentType,
              mediaSize: artifacts.playback.size, voiceReplyDurationMs: artifacts.durationMs, voiceReplyDurationSource: artifacts.durationSource,
              updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            return artifacts;
          }) });
        // Capability rejection is safe only while this AI turn is still allowed;
        // a human pause during synthesis must not become a text fallback.
        await assertAiOutboundDeliveryAllowed(claimed);
        const sent = await sendTenantChatMediaLink({ tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180),
          mediaType: "audio", mediaUrl: "", deliveryBuffer: ready.deliveryBuffer, deliveryFilename: "voice.ogg",
          storedMediaPath: ready.artifacts.playback.storagePath, mediaSize: ready.artifacts.playback.size,
          filename: "Resposta em audio ALTUM.mp3", contentType: ready.artifacts.playback.contentType, deliveryContentType: ready.artifacts.delivery.contentType,
          aiGenerated: true, displayText: request.transcript, pauseAi: false,
          actor: { id: clean(claimed.actorId, 180), name: clean(claimed.actorName, 180) }, messageId, onDeliveryAttempt: beginDeliveryAttempt });
        if (!sent.metaMessageId) throw new Error("Confirmacao da resposta em voz sem identificador da mensagem. Reconciliacao necessaria.");
        const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), error: "", errorCode: "", voicePreparationFailed: false });
        results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" }); continue;
      }
      if (clean(claimed.kind, 30) === "text") {
        let text: string, replyToId: string | null;
        try {
          text = normalizeOutboundText(claimed.text);
          replyToId = normalizeOutboundReplyId(claimed.replyToId);
        } catch {
          throw new Error("Falha de integridade: texto ou referencia pendente invalidos.");
        }
        const inboundAutomation = claimed.origin === "automation" && Boolean(claimed.automationInboundExecutionId || claimed.automationSourceMessageId);
        const scheduledInbound = inboundAutomation && claimed.automationScheduledGuardVersion === 1;
        const expectedFingerprint = stageAutomationFingerprint(claimed) || proposalAutomationFingerprint(claimed) || createChatOutboundFingerprint([claimed.origin === "ai" ? "ai-text-v1" : scheduledInbound ? "automation-scheduled-inbound-text-v1" : inboundAutomation ? "automation-inbound-text-v1" : claimed.origin === "automation" ? "automation-text-v1" : "text-v1", clean(claimed.tenantId, 180), clean(claimed.chatId, 180), text, replyToId,
          ...(inboundAutomation ? [clean(claimed.automationId, 500), clean(claimed.automationSourceMessageId, 500), clean(claimed.automationSourceLeadId, 500), clean(claimed.automationInboundExecutionId, 500), Number(claimed.automationActionIndex), clean(claimed.automationOccurrenceId, 500)] : []),
          ...(scheduledInbound ? [clean(claimed.scheduledAutomationJobId, 500)] : []),
          ...(claimed.origin === "ai" ? [clean(claimed.aiSourceMessageId, 240)] : []),
          ...(claimed.handoffAckAuthorization ? [normalizeHandoffAckAuthorization(claimed.handoffAckAuthorization)] : []),
          ...(claimed.mcpApproval ? [normalizeMcpMessageApproval(claimed.mcpApproval)] : [])]);
        if (claimed.requestFingerprint && claimed.requestFingerprint !== expectedFingerprint) {
          throw new Error("Falha de integridade: texto pendente alterado apos o aceite.");
        }
        const dispatched = await sendTenantChatText({
          tenantId: clean(claimed.tenantId, 180),
          chatId: clean(claimed.chatId, 180),
          text,
          replyToId,
          actor: { id: clean(claimed.actorId, 180) || "chat_outbound_worker", name: clean(claimed.actorName, 180) || "Altum" },
          pauseAi: claimed.origin !== "ai" && claimed.origin !== "automation",
          aiGenerated: claimed.origin === "ai",
          automationGenerated: claimed.origin === "automation",
          pauseMinutes: 30,
          messageId,
          onDeliveryAttempt: beginDeliveryAttempt,
        });
        if (dispatched.channel !== "site_chat" && !dispatched.metaMessageId) throw new Error("Confirmacao do texto sem identificador. Reconciliacao necessaria.");
        const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), error: "", errorCode: "" });
        results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" });
        continue;
      }
      if (claimed.kind === "template") {
        const ecommerceAutomatic = (claimed.ecommerceAuthority as EcommerceDeliveryAuthority | undefined)?.automatic === true;
        let template: ReturnType<typeof normalizeOutboundTemplate>;
        try { template = normalizeOutboundTemplate(claimed); }
        catch { throw new Error("Falha de integridade: template pendente invalido."); }
        if (claimed.requestFingerprint !== createChatOutboundFingerprint([claimed.origin === "ai" ? "ai-template-v1" : "template-v1", claimed.tenantId, claimed.chatId, template,
          ...(claimed.origin === "ai" ? [clean(claimed.aiSourceMessageId, 240)] : []),
          ...(claimed.mcpApproval ? [normalizeMcpMessageApproval(claimed.mcpApproval)] : []),
          ...(claimed.ecommerceAuthority ? [commerceSnapshotDigest(claimed.ecommerceAuthority)] : []),
          ...(claimed.displayText ? [normalizeOutboundText(claimed.displayText)] : [])])) throw new Error("Falha de integridade: template alterado apos aceite.");
        const dispatched = await sendTenantChatTemplate({ tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180), ...template,
          actor: { id: clean(claimed.actorId, 180), name: clean(claimed.actorName, 180) }, pauseAi: claimed.origin !== "ai" && !ecommerceAutomatic, aiGenerated: claimed.origin === "ai" || ecommerceAutomatic,
          ...(claimed.displayText ? { displayText: normalizeOutboundText(claimed.displayText) } : {}),
          messageId, onDeliveryAttempt: beginDeliveryAttempt });
        if (!dispatched.metaMessageId) throw new Error("Confirmacao do template sem identificador. Reconciliacao necessaria.");
        const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), error: "", errorCode: "" });
        results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" }); continue;
      }
      const storagePath = clean(claimed.storagePath, 900);
      assertOutboundMediaPath(clean(claimed.tenantId, 180), clean(claimed.chatId, 180), storagePath);
      const file = await uploadedFile(storagePath);
      if (!file) throw new Error("Arquivo pendente ainda indisponivel no armazenamento.");
      const verified = await readVerifiedOutboundMedia({ tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180), jobId: doc.id, storagePath, file });
      const mediaType = clean(claimed.mediaType, 30) as ChatMediaType;
      let deliveryFile = verified.file;
      let deliveryGeneration = verified.generation;
      let persistedStoragePath = storagePath;
      let persistedContentType = clean(claimed.contentType, 180) || "application/octet-stream";
      let deliveryContentType = persistedContentType;
      let filename = clean(claimed.filename, 180);
      let deliveryFilename = filename;
      const destination = await adminDb.collection("chats").doc(String(claimed.chatId)).get();
      if (destination.data()?.tenantId !== claimed.tenantId) throw new Error("Conversa de envio fora da empresa.");
      const byteDelivery = String(destination.data()?.channel || "whatsapp") === "whatsapp";
      let deliveryBuffer = byteDelivery || mediaType === "audio" ? verified.source : undefined;
      let persistedMediaSize = Number(claimed.mediaSize || 0);

      if (mediaType === "audio" && messageId) {
        try {
          const source = verified.source;
          const sourceExtension = filename.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "bin";
          const renditions = await createMobileAudioRenditions({ source, extension: sourceExtension });
          const [voicePath, playbackPath] = await Promise.all([
            saveChatMediaBuffer({
              tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180), messageId,
              data: renditions.whatsappVoice, contentType: "audio/ogg; codecs=opus", filename: "voice.ogg", variant: "whatsapp",
            }),
            saveChatMediaBuffer({
              tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180), messageId,
              data: renditions.playback, contentType: "audio/mpeg", filename: "audio.mp3", variant: "playback",
            }),
          ]);
          const normalizedVoice = await uploadedFile(voicePath);
          if (!normalizedVoice) throw new Error("Audio normalizado nao foi encontrado no armazenamento.");
          const [voiceMetadata] = await normalizedVoice.getMetadata();
          const voiceGeneration = String(voiceMetadata.generation || "");
          if (!/^\d+$/.test(voiceGeneration)) throw new Error("Audio normalizado sem versao verificavel.");
          deliveryFile = normalizedVoice.bucket.file(normalizedVoice.name, { generation: voiceGeneration });
          deliveryGeneration = voiceGeneration;
          persistedStoragePath = playbackPath;
          persistedContentType = "audio/mpeg";
          deliveryContentType = "audio/ogg; codecs=opus";
          deliveryBuffer = renditions.whatsappVoice;
          deliveryFilename = "voice.ogg";
          persistedMediaSize = renditions.playback.length;
          filename = filename.replace(/\.[a-z0-9]{1,8}$/i, "") + ".mp3";
        } catch (audioError) {
          console.error("Falha ao normalizar audio para celular; mantendo arquivo original:", audioError);
        }
      }

      // Meta audio requires upload -> media ID, not an audio URL. Keep the
      // verified/converted bytes in memory; never ask the connector to fetch a
      // mutable URL or sign an otherwise unused audio URL.
      const temporaryReadUrl = deliveryBuffer ? "" : (await deliveryFile.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60 * 60 * 1000, queryParams: { generation: deliveryGeneration } }))[0];
      await sendTenantChatMediaLink({
        tenantId: clean(claimed.tenantId, 180),
        chatId: clean(claimed.chatId, 180),
        mediaType,
        mediaUrl: temporaryReadUrl,
        deliveryBuffer,
        legacyMediaUrl: async () => (await deliveryFile.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60 * 60 * 1000, queryParams: { generation: deliveryGeneration } }))[0],
        deliveryFilename,
        storedMediaPath: persistedStoragePath,
        mediaSize: persistedMediaSize,
        filename,
        contentType: persistedContentType,
        deliveryContentType,
        caption: clean(claimed.caption, 1024),
        replyToId: clean(claimed.replyToId, 180) || null,
        actor: { id: clean(claimed.actorId, 180) || "chat_outbound_worker", name: clean(claimed.actorName, 180) || "Altum" },
        pauseAi: true,
        pauseMinutes: 30,
        messageId,
        onDeliveryAttempt: beginDeliveryAttempt,
      });
      const completed = await completeLease({ status: "completed", completedAt: FieldValue.serverTimestamp(), error: "", errorCode: "",
        sourceSha256: verified.sha256, sourceGeneration: verified.generation, deliveryGeneration, mediaIntegrityOrigin: verified.origin });
      results.push({ jobId: doc.id, status: completed ? "sent" : "skipped" });
    } catch (error) {
      const message = error instanceof Error ? clean(error.message, 500) : "Falha ao enviar mensagem.";
      const attempt = Number(claimed.attempts || 0) + 1;
      const voicePreparationFailed = error instanceof AiVoicePreparationError && !deliveryAttempted;
      const mediaPreparationFailed = error instanceof AiKnowledgeMediaPreparationError && !deliveryAttempted;
      const deferredCampaign = error instanceof CampaignDeliveryDeferredError && !deliveryAttempted;
      const deferredAutomation = error instanceof InboundAutomationPreparingError && !deliveryAttempted;
      const ecommerceBlocked = error instanceof EcommerceActionAuthorizationError && !deliveryAttempted;
      const stageBlocked = error instanceof StageAutomationAuthorizationError && !deliveryAttempted;
      const classification = stageBlocked ? { status: "dead_letter" as const, errorCode: "STAGE_AUTHORITY_BLOCKED", retryAt: null }
        : ecommerceBlocked ? { status: "dead_letter" as const, errorCode: "ECOMMERCE_AUTHORITY_BLOCKED", retryAt: null }
        : deferredAutomation ? { status: "retrying" as const, errorCode: "AUTOMATION_PREPARING", retryAt: error.retryAt }
        : deferredCampaign ? { status: "retrying" as const, errorCode: error.reasonCode === "scheduled" ? "CAMPAIGN_SCHEDULED" : "CAMPAIGN_PAUSED", retryAt: error.retryAt }
        : voicePreparationFailed || mediaPreparationFailed ? { status: "dead_letter" as const, errorCode: voicePreparationFailed ? "AI_VOICE_PREPARATION_FAILED" : "AI_MEDIA_PREPARATION_FAILED", retryAt: null }
        : classifyChatOutboundFailure({ deliveryAttempted, attempt, message });
      const { status, errorCode } = classification;
      const finalized = await completeLease({
        status,
        error: message,
        errorCode,
        failedAt: FieldValue.serverTimestamp(),
        dueAt: classification.retryAt,
        ...(deferredCampaign || deferredAutomation ? { attempts: FieldValue.increment(-1) } : {}),
        reconciliationReason: deliveryAttempted ? "provider_outcome_unknown" : null,
        ...(claimed.kind === "ai_voice" ? { voicePreparationFailed } : {}),
        ...(claimed.kind === "ai_knowledge_media" ? { mediaPreparationFailed } : {}),
      }, messageId ? {
          status: status === "retrying" ? "sending" : status === "dead_letter" ? "failed" : "pending_confirmation",
          deliveryStatus: status === "retrying" ? "queued" : status === "dead_letter" ? "failed" : "confirmation_pending",
          deliveryError: message,
          deliveryErrorCode: errorCode,
          deliveryUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
      } : undefined);
      results.push({ jobId: doc.id, status: finalized ? status : "skipped", error: message });
    }
  }

  return { processed: results.length, results };
}

function summarizeChatOutboundDocs(snapshot: { size: number; docs: ReadonlyArray<{ data(): Record<string, unknown> }> }, limit: number) {
  const counts: Record<string, number> = { ready: 0, processing: 0, retrying: 0, reconciliation_required: 0, dead_letter: 0, completed: 0 };
  let oldestPendingAtMs: number | null = null;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const status = clean(data.status, 40);
    counts[status] = (counts[status] || 0) + 1;
    if (["ready", "processing", "retrying", "reconciliation_required"].includes(status)) {
      const createdAtMs = timestampMs(data.createdAt);
      if (createdAtMs && (oldestPendingAtMs === null || createdAtMs < oldestPendingAtMs)) oldestPendingAtMs = createdAtMs;
    }
  }
  return {
    totalInspected: snapshot.size,
    coverageComplete: snapshot.size < limit,
    counts,
    oldestPendingAt: oldestPendingAtMs ? new Date(oldestPendingAtMs).toISOString() : null,
    healthy: counts.dead_letter === 0 && counts.reconciliation_required === 0,
  };
}

export async function getTenantChatOutboundHealth(tenantIdValue: string) {
  const tenantId = clean(tenantIdValue, 180);
  if (!tenantId) throw new Error("tenantId obrigatorio.");
  const limit = 500;
  const snapshot = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).limit(limit).get();
  return summarizeChatOutboundDocs(snapshot, limit);
}

export async function getChatOutboundGlobalHealth() {
  const limit = 1000;
  const snapshot = await adminDb.collection("chat_outbound_jobs").limit(limit).get();
  return summarizeChatOutboundDocs(snapshot, limit);
}

export async function reprocessTenantChatOutboundJob(input: {
  tenantId: string;
  jobId: string;
  actorId: string;
  actorName?: string | null;
  confirmedNotDelivered?: boolean;
}) {
  const tenantId = clean(input.tenantId, 180);
  const jobId = clean(input.jobId, 240);
  if (!tenantId || !jobId) throw new Error("tenantId e jobId sao obrigatorios.");
  const jobRef = adminDb.collection("chat_outbound_jobs").doc(jobId);
  return adminDb.runTransaction(async (transaction) => {
    const job = await transaction.get(jobRef);
    if (!job.exists || clean(job.data()?.tenantId, 180) !== tenantId) throw new Error("Envio nao encontrado para esta empresa.");
    const status = clean(job.data()?.status, 40);
    if ((status === "reconciliation_required" || job.data()?.providerAttemptStartedAt) && !input.confirmedNotDelivered) {
      throw new Error("Confirme que a mensagem nao foi entregue antes de reenviar.");
    }
    if (!new Set(["dead_letter", "reconciliation_required"]).has(status)) {
      throw new Error("Este envio nao esta disponivel para reprocessamento.");
    }
    const messageId = clean(job.data()?.messageId, 240);
    transaction.set(jobRef, {
      status: "ready",
      dueAt: new Date(),
      attempts: 0,
      leaseToken: null,
      leaseUntil: null,
      error: "",
      errorCode: "",
      reconciliationReason: null,
      lastProviderAttemptStartedAt: job.data()?.providerAttemptStartedAt || job.data()?.lastProviderAttemptStartedAt || null,
      lastProviderAttemptId: job.data()?.providerAttemptId || job.data()?.lastProviderAttemptId || null,
      providerAttemptStartedAt: null,
      providerAttemptId: null,
      manualReprocessCount: FieldValue.increment(1),
      lastReprocessedBy: input.actorId,
      lastReprocessedByName: clean(input.actorName, 180),
      lastReprocessedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (messageId) transaction.set(adminDb.collection("messages").doc(messageId), {
      status: "sending",
      deliveryStatus: "queued",
      deliveryError: "",
      deliveryErrorCode: "",
      deliveryUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(adminDb.collection("audit_logs").doc(), {
      tenantId,
      action: "chat_outbound_reprocessed",
      entityType: "chat_outbound_job",
      entityId: jobId,
      actorId: input.actorId,
      actorName: clean(input.actorName, 180),
      previousStatus: status,
      confirmedNotDelivered: Boolean(input.confirmedNotDelivered),
      createdAt: FieldValue.serverTimestamp(),
    });
    return { jobId, messageId, status: "ready" as const };
  });
}
