import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { extractBusinessFields, parseAiConfig } from "@/lib/server/ai/agent";
import { syncLeadCommercialState } from "@/lib/server/crm/operations";
import { getTenantSettings } from "@/lib/server/tenant";

type ChatMessage = {
  id: string;
  sender: "client" | "agent" | "system";
  text: string;
  createdAt: unknown;
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

function normalizeMessages(rows: FirebaseFirestore.QueryDocumentSnapshot[]) {
  return rows
    .map((doc): ChatMessage => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        sender: sender(data.sender),
        text: clean(data.text || data.message || data.body || data.caption, 1600),
        createdAt: data.createdAt || data.receivedAt || null,
      };
    })
    .filter((message) => message.text && message.sender !== "system")
    .sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt))
    .slice(-32);
}

function inferObservation(input: { source: "client" | "agent"; text: string; fields: Record<string, string> }) {
  const text = clean(input.text, 1600);
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasProposal = /\b(proposta|orcamento)\b/.test(normalized);
  const hasMeeting = /\b(reuniao|agenda|agendar|call|demonstracao|demonstracao)\b/.test(normalized);
  const hasExplicitSchedule = /\b(agendad[ao]|confirmad[ao]|marcad[ao])\b/.test(normalized) && hasMeeting;
  const hasProposalSent = /\b(enviei|enviamos|segue|mandei)\b/.test(normalized) && hasProposal;
  const hasHumanRequest = /\b(falar com (uma )?pessoa|atendente|consultor|humano)\b/.test(normalized);
  const factualFieldCount = Object.values(input.fields).filter(Boolean).length;

  if (input.source === "agent" && hasProposalSent) {
    return {
      nextAction: "preparar_proposta_comercial",
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
  if (input.source === "client" && hasMeeting) {
    return {
      nextAction: "agendar_proximo_passo",
      confidence: 0.82,
      reason: "cliente_sinalizou_interesse_em_reuniao",
      canAdvanceStage: true,
    };
  }
  if (input.source === "client" && hasProposal) {
    return {
      nextAction: "preparar_proposta_comercial",
      confidence: 0.8,
      reason: "cliente_sinalizou_interesse_em_proposta",
      canAdvanceStage: true,
    };
  }
  return {
    nextAction: factualFieldCount ? "aprofundar_oportunidade" : "qualificar_contexto_minimo",
    confidence: factualFieldCount ? 0.64 : 0.45,
    reason: factualFieldCount ? "fatos_comerciais_identificados" : "conversa_sem_fato_comercial_novo",
    canAdvanceStage: false,
  };
}

function buildFieldPatch(input: {
  fields: Record<string, string>;
  lead: Record<string, unknown>;
  messageId: string;
  source: "client" | "agent";
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
  ];

  let changed = false;
  for (const [crmField, extractedField] of mappings) {
    const value = clean(fields[extractedField], 320);
    if (!value) continue;
    const previous = clean(existingCustom[crmField], 320);
    const priorEvidence = existingEvidence[`custom.${crmField}`] as Record<string, unknown> | undefined;
    const isManual = clean(priorEvidence?.source, 80) === "manual";
    if (isManual || (previous && previous === value)) continue;
    existingCustom[crmField] = value;
    existingEvidence[`custom.${crmField}`] = {
      source: input.source === "client" ? "customer_message" : "human_commitment",
      messageId: input.messageId,
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
}) {
  const tenantId = clean(input.tenantId, 180);
  const chatId = clean(input.chatId, 180);
  const messageId = clean(input.messageId, 240);
  if (!tenantId || !chatId || !messageId) return { observed: false, reason: "invalid_input" };

  const observationRef = adminDb.collection("crm_conversation_observations").doc(`${tenantId}_${messageId}`);
  if ((await observationRef.get()).exists) return { observed: false, reason: "already_observed" };

  const [chatSnap, sourceMessageSnap, settings, messagesSnap] = await Promise.all([
    adminDb.collection("chats").doc(chatId).get(),
    adminDb.collection("messages").doc(messageId).get(),
    getTenantSettings(tenantId),
    adminDb.collection("messages").where("chatId", "==", chatId).limit(80).get(),
  ]);
  if (!chatSnap.exists || !sourceMessageSnap.exists) return { observed: false, reason: "chat_or_message_missing" };

  const chat = chatSnap.data() as Record<string, unknown>;
  const sourceMessage = sourceMessageSnap.data() as Record<string, unknown>;
  const leadId = clean(chat.leadId, 180) || clean(sourceMessage.leadId, 180);
  const source = sender(sourceMessage.sender);
  if (clean(chat.tenantId, 180) !== tenantId || !leadId || source === "system") {
    return { observed: false, reason: "no_commercial_lead" };
  }

  const leadSnap = await adminDb.collection("leads").doc(leadId).get();
  if (!leadSnap.exists || clean(leadSnap.data()?.tenantId, 180) !== tenantId) {
    return { observed: false, reason: "lead_missing" };
  }

  const conversation = normalizeMessages(messagesSnap.docs);
  const clientCorpus = conversation.filter((item) => item.sender === "client").map((item) => item.text).join("\n").slice(-5000);
  const sourceText = clean(sourceMessage.text || sourceMessage.message || sourceMessage.body || sourceMessage.caption, 1600);
  const config = parseAiConfig(settings);
  const extracted = extractBusinessFields(clientCorpus, config) || {};
  const observation = inferObservation({
    source: source === "client" ? "client" : "agent",
    text: sourceText,
    fields: extracted,
  });
  const lead = leadSnap.data() as Record<string, unknown>;
  const fieldPatch = buildFieldPatch({
    fields: extracted,
    lead,
    messageId,
    // Extracted profile data comes exclusively from customer messages. A human
    // message can register a commitment (proposal/reuniao), but never becomes
    // evidence for facts attributed to the customer.
    source: "client",
  });

  const patch: Record<string, unknown> = {
    ...fieldPatch,
    aiLastConversationObservedAt: FieldValue.serverTimestamp(),
    aiLastConversationMessageId: messageId,
    aiLastConversationSource: source,
    aiNextAction: observation.nextAction,
    aiConversationObservation: {
      reason: observation.reason,
      confidence: observation.confidence,
      source,
      evidenceMessageId: messageId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    adminDb.collection("leads").doc(leadId).set(patch, { merge: true }),
    observationRef.set({
      tenantId,
      chatId,
      leadId,
      messageId,
      source,
      reason: observation.reason,
      confidence: observation.confidence,
      nextAction: observation.nextAction,
      extractedFields: extracted,
      actorId: input.actorId || null,
      actorName: input.actorName || null,
      createdAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection("ai_logs").doc(`crm_observer_${tenantId}_${messageId}`).set({
      tenantId,
      chatId,
      leadId,
      messageId,
      decision: "observe",
      reason: observation.reason,
      confidence: observation.confidence,
      nextAction: observation.nextAction,
      provider: "altum_crm_observer",
      model: "commercial_observer_v1",
      source,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    adminDb.collection("leads").doc(leadId).collection("events").add({
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
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  const analysis = await syncLeadCommercialState({
    tenantId,
    leadId,
    actorId: input.actorId || "crm_conversation_observer",
    actorName: input.actorName || "Inteligencia Comercial Altum",
    allowStageAdvance: observation.canAdvanceStage,
    preserveManualScore: true,
  });

  return {
    observed: true,
    leadId,
    nextAction: observation.nextAction,
    advancedStage: observation.canAdvanceStage && Boolean(analysis),
  };
}
