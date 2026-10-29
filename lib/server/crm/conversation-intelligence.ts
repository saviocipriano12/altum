import { FieldValue } from "firebase-admin/firestore";
import { qualificationEvidenceAllowsUpdate } from "@/lib/crm-qualification-policy";
import { randomUUID } from "node:crypto";
import { observationSourceBinding, sameObservationOccurrence, type ObservationSourceBinding } from "./observation-source-binding";
import { crmObservationIdentity } from "@/lib/crm-observation-identity";
import { commercialObservationReceiptIdentity, observationSnapshotVersion } from "@/lib/server/crm/observation-receipt-identity";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { extractObservedCommercialFacts } from "@/lib/server/crm/conversation-facts";
import { syncLeadCommercialState } from "@/lib/server/crm/operations";
import { getUnambiguousConversationLead, matchesConversationCommercialFence, messageInCommercialTarget, type ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import { observedMessageContent, hasCurrentInboundEnrichment } from "@/lib/server/ai/inbound-enrichment-source";
import { commercialReadStatus } from "@/lib/crm-read-state";
import { projectCommercialReadIssues } from "@/lib/server/crm/read-issues";
import { recordCommercialReadFailure } from "@/lib/server/crm/read-state";
import { observeSemanticCommercialFacts, semanticObservationStillCurrent } from "@/lib/server/crm/semantic-observation";
import type { SemanticMessage } from "@/lib/server/crm/semantic-extraction";

type ChatMessage = {
  id: string;
  sender: "client" | "agent" | "system";
  text: string;
  createdAt: unknown;
  kind: string;
  enrichmentToken: string;
};

function clean(value: unknown, max = 800) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function sender(value: unknown): ChatMessage["sender"] {
  const normalized = clean(value, 30).toLowerCase();
  return normalized === "client" || normalized === "system" ? normalized : "agent";
}

function timestamp(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "object" && "_seconds" in value && typeof value._seconds === "number") return value._seconds * 1000;
  return 0;
}

function normalizeMessages(rows: FirebaseFirestore.DocumentSnapshot[]) {
  return rows
    .map((doc): ChatMessage => {
      const data = doc.data() as Record<string, unknown>;
      const content = observedMessageContent(data, doc.createTime);
      return {
        id: doc.id,
        sender: sender(data.sender),
        text: clean(content.text, 4000),
        kind: content.kind,
        enrichmentToken: content.enrichmentToken,
        createdAt: data.createdAt || data.receivedAt || null,
      };
    })
    .filter((message) => message.text && message.sender !== "system")
    .sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt))
    .slice(-80);
}

function inferObservation(input: { source: "client" | "agent"; text: string; fields: Record<string, string> }) {
  const text = clean(input.text, 4000);
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasProposal = /\b(proposta|orcamento)\b/.test(normalized);
  const hasMeeting = /\b(reuniao|agenda|agendar|call|demonstracao|demonstracao)\b/.test(normalized);
  const hasExplicitSchedule = /\b(agendad[ao]|confirmad[ao]|marcad[ao])\b/.test(normalized) && hasMeeting;
  const hasProposalSent = /\b(enviei|enviamos|segue|mandei)\b/.test(normalized) && hasProposal;
  const hasHumanRequest = /\b(falar com (uma )?pessoa|atendente|consultor|humano)\b/.test(normalized);
  const requestsProposal = /\b(?:quero|preciso|gostaria|pode|podem)\b.{0,60}\b(?:proposta|orcamento)\b/.test(normalized);
  const requestsMeeting = /\b(?:quero|preciso|gostaria|vamos|pode|podemos)\b.{0,60}\b(?:reuniao|agendar|call|demonstracao)\b/.test(normalized);
  const factualFieldCount = Object.values(input.fields).filter(Boolean).length;
  if (/\b(nao|talvez|se|poderia)\b/.test(normalized) || text.includes("?")) {
    return { nextAction: "", confidence: 0.4, reason: "sem_compromisso_comercial_confirmado", canAdvanceStage: false };
  }

  if (input.source === "agent" && hasProposalSent) {
    return {
      nextAction: "acompanhar_retorno_da_proposta",
      confidence: 0.9,
      reason: "responsavel_registrou_envio_de_proposta",
      canAdvanceStage: true,
    };
  }
  if (input.source === "agent" && hasExplicitSchedule) {
    return {
      nextAction: "agendar_proximo_passo",
      confidence: 0.9,
      reason: "responsavel_registrou_reuniao_agendada",
      canAdvanceStage: true,
    };
  }
  if (input.source === "client" && hasHumanRequest) {
    return {
      nextAction: "assumir_handoff_humano",
      confidence: 0.9,
      reason: "cliente_pediu_atendimento_humano",
      canAdvanceStage: false,
    };
  }
  if (input.source === "client" && requestsMeeting) {
    return {
      nextAction: "agendar_proximo_passo",
      confidence: 0.82,
      reason: "cliente_sinalizou_interesse_em_reuniao",
      canAdvanceStage: true,
    };
  }
  if (input.source === "client" && requestsProposal) {
    return {
      nextAction: "preparar_proposta_comercial",
      confidence: 0.8,
      reason: "cliente_sinalizou_interesse_em_proposta",
      canAdvanceStage: true,
    };
  }
  return {
    nextAction: factualFieldCount ? "aprofundar_oportunidade" : "",
    confidence: factualFieldCount ? 0.64 : 0.45,
    reason: factualFieldCount ? "fatos_comerciais_identificados" : "conversa_sem_fato_comercial_novo",
    canAdvanceStage: false,
  };
}

function buildFieldPatch(input: {
  fields: Record<string, string>;
  lead: Record<string, unknown>;
  messageId: string;
  chatId: string;
  source: "client" | "agent";
  evidence: Record<string, { messageId: string; excerpt: string; occurredAtMs: number; kind: string; enrichmentToken: string; sourceOrder?: string; sourceRevision?: string }>;
}) {
  const fields = input.fields;
  const existingCustom = input.lead.customFields && typeof input.lead.customFields === "object"
    ? { ...(input.lead.customFields as Record<string, unknown>) }
    : {};
  const existingEvidence = input.lead.aiFieldEvidence && typeof input.lead.aiFieldEvidence === "object"
    ? { ...(input.lead.aiFieldEvidence as Record<string, unknown>) }
    : {};
  const mappings: Array<[string, string]> = [
    ["nicho", "businessType"],
    ["objetivo_principal", "primaryGoal"],
    ["orcamento", "budgetBand"],
    ["urgencia", "urgency"],
    ["cidade", "city"],
    ["canais_atuais", "currentChannels"],
    ["tamanho_time", "teamSize"],
    ["servico_interesse", "serviceInterest"],
    ["decisor", "decisionMaker"],
    ["maturidade_digital", "digitalMaturity"],
    ["necessidade", "need"],
    ["prazo", "deadline"],
    ["objecao_principal", "dominantObjection"],
  ];

  let changed = false;
  for (const [crmField, extractedField] of mappings) {
    const value = clean(fields[extractedField], 320);
    if (!value) continue;
    const previous = clean(existingCustom[crmField], 320);
    const priorEvidence = existingEvidence[`custom.${crmField}`] as Record<string, unknown> | undefined;
    const evidence = input.evidence[extractedField];
    // Keep legacy/manual values without provenance; older jobs cannot overwrite newer facts.
    const sameEvidence = previous === value && priorEvidence?.messageId === evidence?.messageId &&
      priorEvidence?.sourceOrder === evidence?.sourceOrder && priorEvidence?.sourceRevision === evidence?.sourceRevision;
    if (!evidence || !qualificationEvidenceAllowsUpdate(priorEvidence, evidence.sourceOrder) || (previous && !priorEvidence) || Number(priorEvidence?.occurredAtMs || 0) > evidence.occurredAtMs || sameEvidence) continue;
    existingCustom[crmField] = value;
    existingEvidence[`custom.${crmField}`] = {
      ...(priorEvidence?.automaticAfter ? { automaticAfter: priorEvidence.automaticAfter } : {}),
      value,
      chatId: input.chatId,
      source: input.source === "client" ? "customer_message" : "human_commitment",
      messageId: evidence.messageId,
      excerpt: evidence.excerpt,
      occurredAtMs: evidence.occurredAtMs,
      contentKind: evidence.kind,
      enrichmentToken: evidence.enrichmentToken || null,
      sourceOrder: evidence.sourceOrder || null,
      sourceRevision: evidence.sourceRevision || null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    changed = true;
  }

  return changed ? { customFields: existingCustom, aiFieldEvidence: existingEvidence } : {};
}

/**
 * Observes a conversation without replying to the customer. This deliberately
 * stays active while a human has paused automatic replies: pausing a bot must
 * never mean losing the commercial record of the conversation.
 */
export async function observeConversationCommercialState(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  actorId?: string | null;
  actorName?: string | null;
  expectedSourceBinding?: ObservationSourceBinding;
}) {
  const identity = crmObservationIdentity(input);
  if (!identity) return { observed: false, reason: "invalid_input" };
  const { tenantId, chatId, messageId } = identity;

  const [chatSnap, sourceMessageSnap] = await Promise.all([
    adminDb.collection("chats").doc(chatId).get(),
    adminDb.collection("messages").doc(messageId).get(),
  ]);
  if (!chatSnap.exists || !sourceMessageSnap.exists) return { observed: false, reason: "chat_or_message_missing" };
  if (input.expectedSourceBinding && (input.expectedSourceBinding.messageGeneration !== observationSnapshotVersion(sourceMessageSnap.createTime) ||
      input.expectedSourceBinding.messageRevision !== observationSnapshotVersion(sourceMessageSnap.updateTime) ||
      input.expectedSourceBinding.chatGeneration !== observationSnapshotVersion(chatSnap.createTime))) return { observed: false, reason: "conversation_commercial_context_changed" };

  const chat = chatSnap.data() as Record<string, unknown>;
  const sourceMessage = sourceMessageSnap.data() as Record<string, unknown>;
  const leadId = clean(chat.leadId, 180) || clean(sourceMessage.leadId, 180);
  const source = sender(sourceMessage.sender);
  if (clean(chat.tenantId, 180) !== tenantId || clean(sourceMessage.tenantId, 180) !== tenantId || clean(sourceMessage.chatId, 180) !== chatId || chat.isGroup === true || chat.conversationType === "group" || !leadId || source === "system") {
    return { observed: false, reason: "no_commercial_lead" };
  }
  if (source === "agent" && ["queued", "pending", "sending", "failed", "cancelled"].includes(clean(sourceMessage.deliveryStatus || sourceMessage.status, 40))) {
    return { observed: false, reason: "outbound_not_accepted" };
  }

  const commercialTarget = await getUnambiguousConversationLead({ tenantId, chatId });
  if (!commercialTarget.ok) return { observed: false, reason: commercialTarget.reason };
  if (!messageInCommercialTarget(sourceMessageSnap, commercialTarget)) return { observed: false, reason: "conversation_commercial_context_changed" };
  if (input.expectedSourceBinding && !sameObservationOccurrence(input.expectedSourceBinding, observationSourceBinding(sourceMessageSnap, chatSnap, commercialTarget)))
    return { observed: false, reason: "conversation_commercial_context_changed" };
  if (commercialTarget.leadId !== leadId || (clean(sourceMessage.leadId, 180) && sourceMessage.leadId !== leadId)) {
    return { observed: false, reason: "conversation_commercial_context_changed" };
  }
  const conversationFence: ConversationCommercialFence = { tenantId, chatId, leadId, leadGeneration: commercialTarget.generation,
    chatGeneration: commercialTarget.chatGeneration, contactId: commercialTarget.contactId, contactGeneration: commercialTarget.contactGeneration,
    messageId, messageVersion: sourceMessageSnap.updateTime!, ...(commercialTarget.selectionId ? { selectionId: commercialTarget.selectionId } : {}) };
  const sourceRevision = observationSnapshotVersion(sourceMessageSnap.updateTime);
  const observationWriteToken = randomUUID();
  const observationIdentity = commercialObservationReceiptIdentity({ tenantId, chatId, leadId, messageId,
    messageGeneration: observationSnapshotVersion(sourceMessageSnap.createTime), chatGeneration: observationSnapshotVersion(commercialTarget.chatGeneration),
    leadGeneration: observationSnapshotVersion(commercialTarget.generation), contactId: commercialTarget.contactId,
    contactGeneration: observationSnapshotVersion(commercialTarget.contactGeneration), sourceRevision,
    ...(commercialTarget.selectionId ? { selectionId: commercialTarget.selectionId } : {}) });
  const observationRef = adminDb.collection("crm_conversation_observations").doc(observationIdentity.receiptId);
  const eventRef = adminDb.collection("leads").doc(leadId).collection("events").doc(observationIdentity.eventId);

  const leadSnap = await adminDb.collection("leads").doc(leadId).get();
  if (!leadSnap.exists || clean(leadSnap.data()?.tenantId, 180) !== tenantId) {
    return { observed: false, reason: "lead_missing" };
  }

  const sourceTime = timestamp(sourceMessage.createdAt || sourceMessage.receivedAt);
  if (!sourceTime) return { observed: false, reason: "source_timestamp_missing" };
  const messagesSnap = await adminDb.collection("messages").where("tenantId", "==", tenantId)
    .where("chatId", "==", chatId).where("createdAt", "<=", new Date(sourceTime))
    .orderBy("createdAt", "desc").limit(80).get();
  const eligibleSources: FirebaseFirestore.DocumentSnapshot[] = messagesSnap.docs.filter(message => messageInCommercialTarget(message, commercialTarget));
  // A legacy numeric date may not match the timestamp-typed window query.
  // The exact, version-checked source is still part of this observation.
  if (!eligibleSources.some(message => message.id === sourceMessageSnap.id)) eligibleSources.push(sourceMessageSnap);
  const conversation = normalizeMessages(eligibleSources);
  const sourceContent = observedMessageContent(sourceMessage, sourceMessageSnap.createTime);
  const sourceText = clean(sourceContent.text, 4000);
  const extracted: Record<string, string> = {};
  const evidence: Record<string, { messageId: string; excerpt: string; occurredAtMs: number; kind: string; enrichmentToken: string; sourceOrder?: string; sourceRevision?: string }> = {};
  for (const item of conversation.filter((item) => item.sender === "client")) {
    for (const [field, value] of Object.entries(extractObservedCommercialFacts(item.text))) {
      extracted[field] = value;
      evidence[field] = { messageId: item.id, excerpt: item.text, occurredAtMs: timestamp(item.createdAt), kind: item.kind, enrichmentToken: item.enrichmentToken };
    }
  }
  const semanticInput = { fence: conversationFence, snapshots: eligibleSources,
    messages: conversation.filter(item => item.sender !== "system").map(item => ({ id: item.id, sender: item.sender as "client" | "agent", text: item.text, kind: item.kind as SemanticMessage["kind"] })) };
  const readSource = { messageId, chatId, occurredAtMs: sourceTime, sourceCreatedAtMs: sourceMessageSnap.createTime!.toMillis(),
    sourceRevision: `${sourceMessageSnap.updateTime!.seconds}:${sourceMessageSnap.updateTime!.nanoseconds}`,
    sourceOrder: `${String(sourceMessageSnap.createTime!.seconds).padStart(12, "0")}:${String(sourceMessageSnap.createTime!.nanoseconds).padStart(9, "0")}` };
  let semantic: Awaited<ReturnType<typeof observeSemanticCommercialFacts>>;
  try { semantic = await observeSemanticCommercialFacts(semanticInput); }
  catch (error) {
    await recordCommercialReadFailure(conversationFence, { ...readSource, status: "needs_review" });
    throw error;
  }
  const readState = { ...readSource, status: commercialReadStatus({ mediaType: String(sourceMessage.type || "text").toLowerCase(),
    mediaError: !!sourceMessage.aiMediaProcessError,
    mediaInterpreted: hasCurrentInboundEnrichment(sourceMessage, sourceMessageSnap.createTime) &&
      (sourceContent.kind === "audio_transcription" || !!sourceContent.mediaContext && !String(sourceMessage.aiMultimodalSummary || "").startsWith("[")),
    semanticStatus: semantic.status }) };
  if (semantic.status === "context_changed") return { observed: false, reason: "conversation_commercial_context_changed", leadId };
  for (const fact of semantic.facts) {
    const item = conversation.find(item => item.id === fact.messageId);
    if (!item || Number(evidence[fact.field]?.occurredAtMs || 0) > timestamp(item.createdAt)) continue;
    extracted[fact.field] = fact.value;
    evidence[fact.field] = { messageId: fact.messageId, excerpt: fact.excerpt, occurredAtMs: timestamp(item.createdAt), kind: fact.kind, enrichmentToken: item.enrichmentToken };
  }
  const observation = inferObservation({
    source: source === "client" ? "client" : "agent",
    text: sourceText,
    fields: source === "client" ? Object.fromEntries(Object.entries(extracted).filter(([field]) => evidence[field]?.messageId === messageId)) : {},
  });
  let canAdvanceStage = false;
  const writeResult = await adminDb.runTransaction(async (transaction) => {
    if (!await matchesConversationCommercialFence(transaction, conversationFence)) return "context_changed";
    if (!await semanticObservationStillCurrent(transaction, semanticInput, semantic)) return "context_changed";
    const [receipt, freshLead, previousEvent] = await Promise.all([
      transaction.get(observationRef),
      transaction.get(adminDb.collection("leads").doc(leadId)),
      transaction.get(eventRef),
    ]);
    if (receipt.exists && (receipt.data()?.identityVersion !== 2 || receipt.data()?.tenantId !== tenantId ||
        receipt.data()?.chatId !== chatId || receipt.data()?.leadId !== leadId || receipt.data()?.messageId !== messageId ||
        receipt.data()?.messageGeneration !== observationSnapshotVersion(sourceMessageSnap.createTime) ||
        receipt.data()?.chatGeneration !== observationSnapshotVersion(commercialTarget.chatGeneration) ||
        receipt.data()?.leadGeneration !== observationSnapshotVersion(commercialTarget.generation) ||
        receipt.data()?.contactId !== commercialTarget.contactId || receipt.data()?.contactGeneration !== observationSnapshotVersion(commercialTarget.contactGeneration) ||
        (receipt.data()?.selectionId || "") !== (commercialTarget.selectionId || "")))
      throw new Error("CRM_OBSERVATION_RECEIPT_IDENTITY_CONFLICT");
    if (receipt.exists && receipt.data()?.tenantId === tenantId && receipt.data()?.chatId === chatId && receipt.data()?.leadId === leadId &&
        receipt.data()?.messageId === messageId && receipt.data()?.sourceRevision === sourceRevision && clean(receipt.data()?.status, 40) === "completed" &&
        clean(receipt.data()?.enrichmentToken, 180) === sourceContent.enrichmentToken &&
        clean(receipt.data()?.semanticRunId, 100) === (semantic.runId || "")) return "already_observed";
    if (!freshLead.exists || clean(freshLead.data()?.tenantId, 180) !== tenantId) throw new Error("Lead comercial nao encontrado para observacao.");
    const evidenceIds = new Set(Object.values(evidence).map(item => item.messageId));
    const evidenceSources = eligibleSources.filter(doc => evidenceIds.has(doc.id));
    if (evidenceSources.length) {
      const currentSources = await transaction.getAll(...evidenceSources.map(doc => doc.ref));
      if (currentSources.some((doc, index) => !doc.exists || !evidenceSources[index].createTime || !evidenceSources[index].updateTime ||
          !doc.createTime?.isEqual(evidenceSources[index].createTime!) || !doc.updateTime?.isEqual(evidenceSources[index].updateTime!))) return "context_changed";
    }
    for (const item of Object.values(evidence)) {
      const original = evidenceSources.find(doc => doc.id === item.messageId);
      if (original?.createTime) item.sourceOrder = `${String(original.createTime.seconds).padStart(12, "0")}:${String(original.createTime.nanoseconds).padStart(9, "0")}`;
      if (original?.updateTime) item.sourceRevision = `${original.updateTime.seconds}:${original.updateTime.nanoseconds}`;
    }
    canAdvanceStage = observation.canAdvanceStage && sourceMessage.aiGenerated !== true && sourceMessage.automationGenerated !== true &&
      sourceTime >= timestamp(freshLead.data()?.aiLastConversationObservedMessageAt);
    const fieldPatch = buildFieldPatch({
      fields: extracted,
      lead: freshLead.data() as Record<string, unknown>,
      messageId,
      chatId,
      // Extract facts from customer messages only. Agent messages may
      // record commitments, but must never become evidence for customer facts.
      source: "client",
      evidence,
    });
    const readProjection = await projectCommercialReadIssues(transaction, freshLead.ref, freshLead.data()?.aiCommercialReadState, readState,
      `${freshLead.createTime!.seconds}:${freshLead.createTime!.nanoseconds}`);
    transaction.set(adminDb.collection("leads").doc(leadId), {
      ...fieldPatch,
      aiCommercialReadState: readProjection,
      ...(sourceContent.mediaContext && source === "client" && sourceTime >= timestamp(freshLead.data()?.aiLatestMediaInsight?.occurredAtMs) ? {
        aiLatestMediaInsight: { ...sourceContent.mediaContext, messageId, chatId, sourceOrder: readSource.sourceOrder, sourceRevision: readSource.sourceRevision, occurredAtMs: sourceTime, enrichmentToken: sourceContent.enrichmentToken },
      } : {}),
      aiLastConversationObservedAt: FieldValue.serverTimestamp(),
      ...(sourceTime >= timestamp(freshLead.data()?.aiLastConversationObservedMessageAt) ? {
        aiLastConversationMessageId: messageId, aiLastConversationSource: source,
      } : {}),
      ...(observation.nextAction && sourceTime >= timestamp(freshLead.data()?.aiLastConversationObservedMessageAt)
        ? { aiNextAction: observation.nextAction } : {}),
      aiLastConversationObservedMessageAt: new Date(Math.max(sourceTime, timestamp(freshLead.data()?.aiLastConversationObservedMessageAt))),
      ...(sourceTime >= timestamp(freshLead.data()?.aiLastConversationObservedMessageAt) ? { aiConversationObservation: {
        reason: observation.reason,
        confidence: observation.confidence,
        source,
        evidenceMessageId: messageId,
        updatedAt: FieldValue.serverTimestamp(),
      } } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(observationRef, {
      observationWriteToken,
      identityVersion: 2, sourceRevision,
      ...(commercialTarget.selectionId ? { selectionId: commercialTarget.selectionId } : {}),
      messageGeneration: observationSnapshotVersion(sourceMessageSnap.createTime),
      chatGeneration: observationSnapshotVersion(commercialTarget.chatGeneration), leadGeneration: observationSnapshotVersion(commercialTarget.generation),
      contactId: commercialTarget.contactId, contactGeneration: observationSnapshotVersion(commercialTarget.contactGeneration),
      tenantId,
      chatId,
      leadId,
      messageId,
      source,
      reason: observation.reason,
      confidence: observation.confidence,
      nextAction: observation.nextAction,
      extractedFields: extracted,
      enrichmentToken: sourceContent.enrichmentToken,
      contentKind: sourceContent.kind,
      semanticStatus: semantic.status,
      semanticRunId: semantic.runId || null,
      actorId: input.actorId || null,
      actorName: input.actorName || null,
      status: "crm_written",
      attempts: FieldValue.increment(1),
      createdAt: receipt.exists ? receipt.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(adminDb.collection("ai_logs").doc(observationIdentity.logId), {
      tenantId,
      chatId,
      leadId,
      messageId,
      decision: "observe",
      ...(commercialTarget.selectionId ? { selectionId: commercialTarget.selectionId } : {}),
      reason: observation.reason,
      confidence: observation.confidence,
      nextAction: observation.nextAction,
      provider: "altum_crm_observer",
      model: "commercial_observer_v1",
      source,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(eventRef, {
      tenantId, chatId, sourceRevision, messageGeneration: observationSnapshotVersion(sourceMessageSnap.createTime),
      type: "crm_conversation_observed",
      title: "Inteligencia comercial atualizou o CRM",
      detail: observation.nextAction
        ? `Origem: ${source}. Proxima acao: ${observation.nextAction.replaceAll("_", " ")}.`
        : `Origem: ${source}. Nenhuma acao comercial nova foi inferida.`,
      reasonCode: observation.reason,
      evidenceMessageId: messageId,
      confidence: observation.confidence,
      actorId: input.actorId || "crm_conversation_observer",
      actorName: input.actorName || "Inteligencia Comercial Altum",
      createdAt: previousEvent.exists ? previousEvent.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    }, { merge: true });
    return "written";
  });
  if (writeResult !== "written") return { observed: false, reason: writeResult === "context_changed" ? "conversation_commercial_context_changed" : writeResult, leadId };

  const analysis = await syncLeadCommercialState({
    tenantId,
    leadId,
    actorId: input.actorId || "crm_conversation_observer",
    actorName: input.actorName || "Inteligencia Comercial Altum",
    allowStageAdvance: canAdvanceStage,
    preserveManualScore: true,
    conversationFence,
  });
  // The facts receipt stays crm_written. The durable observation worker retries
  // derivation; a concurrent edit is not a completed commercial projection.
  if (!analysis) {
    if (!await adminDb.runTransaction(tx => matchesConversationCommercialFence(tx, conversationFence), { readOnly: true })) return { observed: false, reason: "conversation_commercial_context_changed", leadId };
    throw new Error("CRM_SNAPSHOT_CONFLICT: atualizar analise antes de concluir a observacao.");
  }
  const completed = await adminDb.runTransaction(async tx => {
    if (!await matchesConversationCommercialFence(tx, conversationFence)) return false;
    const currentReceipt = await tx.get(observationRef);
    if (currentReceipt.data()?.observationWriteToken !== observationWriteToken || currentReceipt.data()?.sourceRevision !== sourceRevision ||
        currentReceipt.data()?.tenantId !== tenantId || currentReceipt.data()?.chatId !== chatId || currentReceipt.data()?.leadId !== leadId) return false;
    tx.set(observationRef, { status: "completed", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!completed) return { observed: false, reason: "conversation_commercial_context_changed", leadId };

  return {
    observed: true,
    leadId,
    nextAction: observation.nextAction,
    advancedStage: analysis.stageAdvanced,
  };
}
