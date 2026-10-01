import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  TenantAccessError,
  getTenantSettings,
} from "@/lib/server/tenant";
import {
  buildAiRuntimePolicy,
  normalizeTenantAiOperatingProfile,
  type AltumAiProvider,
} from "@/lib/server/ai/operating-layer";
import { getTenantLearningHints } from "@/lib/server/ai/tenant-learning";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { runConversationAgent } from "@/lib/server/ai/router";
import { compileTenantAiContext, deriveHandoffTopicsFromCommercialCriteria } from "@/lib/server/ai/tenant-context";
import { normalizeAiConversationRollout } from "@/lib/ai-conversation-rollout";
import { normalizeCommercialOffer } from "@/lib/commercial-offer";
import { resolveConversationalChoice } from "@/lib/server/ai/conversation-core";
import { deriveOperationalPlan } from "@/lib/server/ai/operational-plan";
import { scoreAltumConversationQuality } from "@/lib/server/ai/quality-score";
import { getBusinessProfile, normalizeBusinessProfileId } from "@/lib/business-profiles";
import type { AltumLeadMemory } from "@/lib/server/ai/runtime-state";
import { normalizeAltumAssistantRole } from "@/lib/ai-assistant-role";
import { getAiEvaluationScenario, type AiEvaluationPreview } from "@/lib/ai-evaluation";
import {
  extractBusinessFields,
  normalizeExtractedFieldsForCrm,
  DEFAULT_GUARDRAILS,
} from "@/lib/server/ai/agent";

type PreviewMessage = {
  sender?: "agent" | "client" | "system";
  text?: string;
  type?: string;
};

type PreviewKbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  tags: string[];
  content: string;
  score: number;
  useInAi?: boolean;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  currency?: string | null;
  inventoryQuantity?: number | null;
  availability?: "active" | "seasonal" | "paused";
  availabilityConfigured?: boolean;
  description?: string | null;
  benefits?: string | null;
  commonQuestions?: string | null;
  objections?: string | null;
  whenRecommend?: string | null;
  whenNotRecommend?: string | null;
  whenHuman?: string | null;
  productSpecs?: string | null;
  stockDelivery?: string | null;
  warranty?: string | null;
  serviceScope?: string | null;
  duration?: string | null;
  schedulingRules?: string | null;
  deliverables?: string | null;
  proofAndCases?: string | null;
  demonstration?: string | null;
  paymentConditions?: string | null;
  supportAndSla?: string | null;
};

type Body = {
  message?: string;
  messageType?: string;
  history?: PreviewMessage[];
  contactName?: string;
  runtimeStateSummary?: string;
  leadMemory?: Partial<AltumLeadMemory> | null;
  assistantRole?: string;
  businessProfileId?: string;
  evaluationScenarioId?: string;
};

function summarizeLeadMemoryForPreview(leadMemory: Partial<AltumLeadMemory> | null | undefined) {
  if (!leadMemory) return "";
  return [
    clean(leadMemory.attributionSourceLabel || leadMemory.attributionSource || leadMemory.attributionChannel, 160)
      ? `origem: ${clean(leadMemory.attributionSourceLabel || leadMemory.attributionSource || leadMemory.attributionChannel, 160)}`
      : "",
    clean(leadMemory.attributionCampaign, 180)
      ? `campanha: ${clean(leadMemory.attributionCampaign, 180)}`
      : "",
    clean(leadMemory.preferredName, 120) ? `nome preferido: ${clean(leadMemory.preferredName, 120)}` : "",
    clean(leadMemory.leadTone, 120) ? `tom: ${clean(leadMemory.leadTone, 120)}` : "",
    clean(leadMemory.activeTopic, 120) ? `assunto vivo: ${clean(leadMemory.activeTopic, 120)}` : "",
    clean(leadMemory.conversationMaturity, 120) ? `momento: ${clean(leadMemory.conversationMaturity, 120)}` : "",
    clean(leadMemory.openQuestion, 180) ? `pergunta em aberto: ${clean(leadMemory.openQuestion, 180)}` : "",
    clean(leadMemory.businessType, 120) ? `negocio: ${clean(leadMemory.businessType, 120)}` : "",
    clean(leadMemory.primaryGoal, 180) ? `objetivo: ${clean(leadMemory.primaryGoal, 180)}` : "",
    clean(leadMemory.currentChannels, 180) ? `canais atuais: ${clean(leadMemory.currentChannels, 180)}` : "",
    clean(leadMemory.urgency, 120) ? `urgencia: ${clean(leadMemory.urgency, 120)}` : "",
    clean(leadMemory.dominantObjection, 120) ? `objecao: ${clean(leadMemory.dominantObjection, 120)}` : "",
    clean(leadMemory.diagnosis, 240) ? `diagnostico: ${clean(leadMemory.diagnosis, 240)}` : "",
    clean(leadMemory.personalizedPlan, 260) ? `plano sugerido: ${clean(leadMemory.personalizedPlan, 260)}` : "",
    clean(leadMemory.sellerNextMove, 180) ? `proximo passo comercial: ${clean(leadMemory.sellerNextMove, 180)}` : "",
    clean(leadMemory.memorySummary, 220) ? `memoria viva: ${clean(leadMemory.memorySummary, 220)}` : "",
    clean(leadMemory.summary, 220) ? `resumo: ${clean(leadMemory.summary, 220)}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function clean(value: unknown, max = 900) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseGuardrails(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item, 240)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|\.|;|\|/)
      .map((item) => clean(item, 240))
      .filter(Boolean);
  }
  return [];
}

function parseLines(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item, 160)).filter(Boolean).slice(0, maxItems);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|;|\|/)
      .map((item) => clean(item, 160))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  return [];
}

function normalizeCommercialBrain(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    businessModel: clean(source.businessModel, 420),
    idealCustomer: clean(source.idealCustomer, 420),
    revenuePriorities: clean(source.revenuePriorities, 420),
    diagnosisStyle: clean(source.diagnosisStyle, 420),
    customSolutionPolicy: clean(source.customSolutionPolicy, 420),
    handoffCriteria: clean(source.handoffCriteria, 420),
    proposalStyle: clean(source.proposalStyle, 420),
    followUpStrategy: clean(source.followUpStrategy, 420),
    forbiddenSalesMoves: clean(source.forbiddenSalesMoves, 420),
  };
}

function summarizeCommercialBrain(brain: ReturnType<typeof normalizeCommercialBrain>) {
  return [
    brain.businessModel ? `Modelo de negocio: ${brain.businessModel}` : "",
    brain.idealCustomer ? `Cliente ideal: ${brain.idealCustomer}` : "",
    brain.revenuePriorities ? `Prioridades de receita: ${brain.revenuePriorities}` : "",
    brain.diagnosisStyle ? `Como diagnosticar: ${brain.diagnosisStyle}` : "",
    brain.customSolutionPolicy ? `Solucao personalizada: ${brain.customSolutionPolicy}` : "",
    brain.handoffCriteria ? `Quando chamar humano: ${brain.handoffCriteria}` : "",
    brain.proposalStyle ? `Como preparar proposta: ${brain.proposalStyle}` : "",
    brain.followUpStrategy ? `Follow-up: ${brain.followUpStrategy}` : "",
    brain.forbiddenSalesMoves ? `Nao fazer: ${brain.forbiddenSalesMoves}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1800);
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

function normalizeComparable(value: string) {
  return clean(value, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPreviewInternalLeak(value: string) {
  const normalized = normalizeComparable(value);
  return [
    /\bplaybook\b/,
    /\bguardrail\b/,
    /\bdiagnostico interno\b/,
    /\binstrucao interna\b/,
    /\bcontrole interno\b/,
    /\bia nao deve\b/,
    /\bnao deve despejar\b/,
    /\blead sem clareza\b/,
    /\bproximo passo do vendedor\b/,
  ].some((pattern) => pattern.test(normalized));
}

function cleanPreviewResponseForLead(value: string, inboundText: string) {
  const text = clean(value, 1600);
  if (!text || !hasPreviewInternalLeak(text)) return text;
  const inbound = normalizeComparable(inboundText);
  if (/\b(exemplo|modelo|mostra|manda|envia|lp|landing|pagina|site|oferta|campanha)\b/.test(inbound)) {
    return "Entendi. Voce respondeu sobre a oferta que recebeu. Posso te mostrar um exemplo e explicar em uma frase como isso ajudaria no seu caso?";
  }
  return "Entendi. Vou te direcionar de forma simples: me confirma qual resultado voce quer melhorar agora para eu indicar o melhor proximo passo?";
}

const SEMANTIC_KEYWORD_GROUPS = [
  ["preco", "valor", "orcamento", "budget", "investimento"],
  ["reuniao", "call", "agenda", "agendar", "meeting"],
  ["lead", "demanda", "captacao", "captar", "trafego"],
  ["venda", "conversao", "converter", "fechamento", "fechar"],
  ["atendimento", "whatsapp", "suporte", "inbox"],
  ["crm", "pipeline", "processo", "operacao"],
  ["urgencia", "prazo", "rapido", "prioridade"],
];

function expandSemanticWords(words: string[]) {
  const expanded = new Set(words);
  for (const group of SEMANTIC_KEYWORD_GROUPS) {
    const touchesGroup = group.some((token) => expanded.has(token));
    if (!touchesGroup) continue;
    for (const token of group) expanded.add(token);
  }
  return expanded;
}

function scoreKbDoc(input: {
  inboundText: string;
  messageWords: string[];
  retrievalMode: "keyword" | "hybrid" | "semantic";
  doc: { content: string; tags: string[]; type: string };
}) {
  const { inboundText, messageWords, retrievalMode, doc } = input;
  if (!messageWords.length) return 0;

  const docWords = new Set<string>([
    ...normalizeWords(doc.content),
    ...doc.tags.flatMap((tag) => normalizeWords(tag)),
    ...normalizeWords(doc.type),
  ]);
  const normalizedInbound = normalizeComparable(inboundText);
  const normalizedDoc = normalizeComparable(doc.content);

  let lexicalHits = 0;
  for (const word of messageWords) {
    if (docWords.has(word)) lexicalHits += 1;
  }

  let semanticHits = 0;
  const expandedWords = expandSemanticWords(messageWords);
  for (const word of expandedWords) {
    if (docWords.has(word)) semanticHits += 1;
  }

  let phraseHits = 0;
  for (const tag of doc.tags) {
    const normalizedTag = normalizeComparable(tag);
    if (!normalizedTag) continue;
    if (normalizedInbound.includes(normalizedTag)) phraseHits += 1;
  }
  if (normalizedInbound && normalizedDoc.includes(normalizedInbound)) phraseHits += 2;
  const typeBoost = doc.type === "catalog" ? 0.35 : doc.type === "faq" ? 0.2 : 0.1;

  if (retrievalMode === "semantic") {
    return Number((semanticHits * 1.25 + phraseHits * 1.6 + lexicalHits * 0.7 + typeBoost).toFixed(4));
  }

  if (retrievalMode === "hybrid") {
    return Number((lexicalHits * 1.05 + semanticHits * 0.75 + phraseHits * 1.25 + typeBoost).toFixed(4));
  }

  return Number((lexicalHits * 1.2 + phraseHits * 0.9 + typeBoost).toFixed(4));
}

function buildPreviewFallbackChoice(input: { inboundText: string; responseText?: string | null }) {
  const inbound = clean(input.inboundText, 400).toLowerCase();
  const responseText = clean(input.responseText, 1600) || undefined;
  const isGreeting = /^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(inbound);
  const isDirectQuestion = inbound.includes("?");
  const isHumanTurn =
    /\b(como voce esta|tudo bem|obrigad|valeu|kkk|haha|beleza|show)\b/.test(inbound) || isGreeting;

  return {
    decision: isGreeting || isHumanTurn || isDirectQuestion ? ("respond" as const) : ("ask_more" as const),
    reason: isHumanTurn ? "preview_human_turn" : "preview_conversation_turn",
    confidence: isHumanTurn ? 0.54 : 0.42,
    nextAction: isHumanTurn ? "aprofundar_oportunidade" : "qualificar_contexto_minimo",
    responseText:
      responseText ||
      (isGreeting
        ? "Oi! Tudo bem? Pode falar, como posso te ajudar?"
        : isHumanTurn
          ? "Tudo certo por aqui 😊 E com você?"
          : "Me conta um pouco melhor o teu momento hoje."),
  };
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const evaluationScenario = body.evaluationScenarioId
      ? getAiEvaluationScenario(clean(body.evaluationScenarioId, 80))
      : null;
    if (body.evaluationScenarioId && !evaluationScenario) {
      return NextResponse.json({ error: "Cenario oficial de avaliacao nao encontrado." }, { status: 400 });
    }
    const effectiveBody: Body = evaluationScenario
      ? {
          ...body,
          message: evaluationScenario.message,
          messageType: evaluationScenario.messageType || "text",
          history: evaluationScenario.history,
          leadMemory: evaluationScenario.leadMemory,
          assistantRole: evaluationScenario.assistantRole,
          businessProfileId: evaluationScenario.businessProfileId,
        }
      : body;
    const inboundText = clean(effectiveBody.message, 1400);
    if (!inboundText) {
      return NextResponse.json({ error: "Mensagem obrigatoria para preview." }, { status: 400 });
    }

    const settings = await getTenantSettings(tenantId);
    const ai = settings && typeof settings.ai === "object" && settings.ai ? (settings.ai as Record<string, unknown>) : {};
    const blueprintRoot = settings?.businessBlueprint && typeof settings.businessBlueprint === "object"
      ? (settings.businessBlueprint as Record<string, unknown>)
      : {};
    const activeBlueprint = blueprintRoot.active && typeof blueprintRoot.active === "object"
      ? (blueprintRoot.active as Record<string, unknown>)
      : {};
    const blueprintAiPolicy = activeBlueprint.aiPolicy && typeof activeBlueprint.aiPolicy === "object"
      ? (activeBlueprint.aiPolicy as Record<string, unknown>)
      : {};
    const blueprintBusinessSummary = clean(activeBlueprint.description || activeBlueprint.summary, 2000);
    const businessProfileId = normalizeBusinessProfileId(effectiveBody.businessProfileId || settings?.businessProfileId);
    const businessProfile = getBusinessProfile(businessProfileId);
    const assistantRole = normalizeAltumAssistantRole(effectiveBody.assistantRole || ai.assistantRole);
    const resolvedBusinessSummary =
      clean(ai.businessSummary, 2000) ||
      blueprintBusinessSummary ||
      clean(settings?.name, 120) ||
      businessProfile.description;
    const resolvedToneOfVoice =
      clean(ai.toneOfVoice, 120) ||
      clean(blueprintAiPolicy.toneOfVoice, 120) ||
      businessProfile.ai.toneOfVoice;
    const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);
    const runtimePolicy = buildAiRuntimePolicy(operatingProfile);
    const commercialBrain = normalizeCommercialBrain(ai.commercialBrain);
    const learningHints = await getTenantLearningHints(tenantId);

    const kbSnap = await (await import("@/app/lib/server/firebase-admin")).adminDb
      .collection("kb_docs")
      .where("tenantId", "==", tenantId)
      .limit(50)
      .get();

    const messageWords = normalizeWords(inboundText);
    const kbDocs: PreviewKbDoc[] = kbSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const typeRaw = String(data.type || "faq").toLowerCase();
        const type: PreviewKbDoc["type"] = typeRaw === "catalog" ? "catalog" : typeRaw === "policy" ? "policy" : "faq";
        const tags = Array.isArray(data.tags) ? data.tags.map((tag) => clean(tag, 80)).filter(Boolean) : [];
        const content = clean(data.content, 600);
        const commercialOffer = normalizeCommercialOffer(data);
        const retrievalContent = type === "catalog"
          ? clean(
              [
                content,
                data.productName,
                data.productCategory,
                data.targetProfile,
                data.description,
                data.benefits,
                data.commonQuestions,
                data.objections,
                data.whenRecommend,
                data.whenNotRecommend,
                data.whenHuman,
                data.productSpecs,
                data.stockDelivery,
                data.warranty,
                data.serviceScope,
                data.duration,
                data.schedulingRules,
                data.deliverables,
                data.proofAndCases,
                data.demonstration,
                data.paymentConditions,
                data.supportAndSla,
              ]
                .filter(Boolean)
                .join("\n"),
              8000
            )
          : content;
        return {
          id: doc.id,
          type,
          tags,
          content,
          useInAi: data.useInAi !== false,
          productName: clean(data.productName, 160) || null,
          productCategory: clean(data.productCategory, 120) || null,
          targetProfile: clean(data.targetProfile, 300) || null,
          priceFrom: commercialOffer.priceFrom,
          priceTo: commercialOffer.priceTo,
          currency: commercialOffer.currency,
          inventoryQuantity: commercialOffer.inventoryQuantity,
          availability: commercialOffer.availability,
          availabilityConfigured: commercialOffer.availabilityConfigured,
          description: clean(data.description, 800) || null,
          benefits: clean(data.benefits, 700) || null,
          commonQuestions: clean(data.commonQuestions, 700) || null,
          objections: clean(data.objections, 700) || null,
          whenRecommend: clean(data.whenRecommend, 600) || null,
          whenNotRecommend: clean(data.whenNotRecommend, 600) || null,
          whenHuman: clean(data.whenHuman, 600) || null,
          productSpecs: clean(data.productSpecs, 700) || null,
          stockDelivery: clean(data.stockDelivery, 700) || null,
          warranty: clean(data.warranty, 600) || null,
          serviceScope: clean(data.serviceScope, 700) || null,
          duration: clean(data.duration, 300) || null,
          schedulingRules: clean(data.schedulingRules, 600) || null,
          deliverables: clean(data.deliverables, 700) || null,
          proofAndCases: clean(data.proofAndCases, 700) || null,
          demonstration: clean(data.demonstration, 600) || null,
          paymentConditions: clean(data.paymentConditions, 600) || null,
          supportAndSla: clean(data.supportAndSla, 600) || null,
          score: scoreKbDoc({
            inboundText,
            messageWords,
            retrievalMode: runtimePolicy.retrievalMode,
            doc: { content: retrievalContent, tags, type },
          }),
        };
      })
      .filter((item) => item.content && item.useInAi !== false && item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const tenantContextConfigured = Boolean(
      clean(ai.businessSummary, 2000) ||
      blueprintBusinessSummary ||
      businessProfileId !== "generic" ||
      kbDocs.length > 0
    );
    const configuredGuardrails = parseGuardrails(ai.guardrails);
    const configuredMandatoryQuestions = parseLines(ai.mandatoryQuestions, 20);
    const configuredEscalationTopics = parseLines(ai.escalationTopics, 20);
    const previewGuardrails = Array.from(new Set([
      ...DEFAULT_GUARDRAILS,
      ...parseGuardrails(blueprintAiPolicy.guardrails),
      ...parseGuardrails(commercialBrain.forbiddenSalesMoves),
      ...(configuredGuardrails.length ? configuredGuardrails : businessProfile.ai.guardrails),
    ])).slice(0, 40);
    const previewMandatoryQuestions = (configuredMandatoryQuestions.length
      ? configuredMandatoryQuestions
      : businessProfile.ai.mandatoryQuestions).slice(0, 20);
    const previewEscalationTopics = Array.from(new Set([
      ...parseLines(blueprintAiPolicy.handoffWhen, 20),
      ...deriveHandoffTopicsFromCommercialCriteria(commercialBrain.handoffCriteria),
      ...(configuredEscalationTopics.length ? configuredEscalationTopics : businessProfile.ai.escalationTopics),
    ])).slice(0, 20);
    const tenantContext = compileTenantAiContext({
      tenantId,
      agentName: clean(ai.agentName, 80) || `Agente ${clean(settings?.name, 80) || businessProfile.label}`,
      assistantRole,
      businessSummary: resolvedBusinessSummary,
      objective: clean(ai.objective, 800) || businessProfile.ai.objective,
      toneOfVoice: resolvedToneOfVoice,
      commercialBrain,
      guardrails: previewGuardrails,
      mandatoryQuestions: previewMandatoryQuestions,
      escalationTopics: previewEscalationTopics,
    });

    const history = (effectiveBody.history || []).map((item, index) => ({
      id: `preview_${index + 1}`,
      sender: item.sender || "client",
      text: clean(item.text, 900),
      type: clean(item.type, 40) || "text",
    }));

    const currentMessage = {
      id: "preview_current",
      sender: "client" as const,
      text: inboundText,
      type: clean(effectiveBody.messageType, 40) || "text",
    };
    const conversation = [...history, currentMessage];

    const inferenceStartedAt = Date.now();
    const llmRun =
      runtimePolicy.primaryProvider !== "altum_rules"
        ? await runConversationAgent(
            {
              tenantId,
              chatId: "preview_chat",
              inboundText,
              channel: "whatsapp",
              agentName: clean(ai.agentName, 80) || `Agente ${clean(settings?.name, 80) || businessProfile.label}`,
              assistantRole,
              tenantContextConfigured,
              tenantContext,
              contactName: typeof effectiveBody.contactName === "string" ? effectiveBody.contactName : undefined,
              runtimeStateSummary: clean(effectiveBody.runtimeStateSummary, 320) || undefined,
              leadMemorySummary: summarizeLeadMemoryForPreview(effectiveBody.leadMemory || null) || undefined,
              commercialBrainSummary: summarizeCommercialBrain(commercialBrain) || undefined,
              toneOfVoice: resolvedToneOfVoice,
              businessSummary: resolvedBusinessSummary,
              objective: clean(ai.objective, 800) || businessProfile.ai.objective,
              guardrails: previewGuardrails,
              mandatoryQuestions: previewMandatoryQuestions,
              escalationTopics: previewEscalationTopics,
              playbookOffers: [],
              playbookScripts: [],
              learningHints,
              tier: operatingProfile.tier,
              autonomyMode: operatingProfile.autonomyMode,
              reasoningLevel: operatingProfile.reasoningLevel,
              responseStyle: operatingProfile.responseStyle,
              conversation,
              kbDocs,
              preferredProviders: operatingProfile.preferredProviders as AltumAiProvider[],
            },
            runtimePolicy
          )
        : null;
    const llmResult = llmRun?.result || null;

    const tenantAiConfig = {
      enabled: true,
      responsePaused: false,
      tenantContextConfigured,
      businessProfileId,
      businessProfileLabel: businessProfile.label,
      salesMotion: "consultative" as const,
      agentName: clean(ai.agentName, 80) || `Agente ${clean(settings?.name, 80) || businessProfile.label}`,
      assistantRole,
      businessSummary: resolvedBusinessSummary,
      objective: clean(ai.objective, 800) || businessProfile.ai.objective,
      commercialBrain,
      toneOfVoice: resolvedToneOfVoice,
      responsiblePhone: clean(ai.responsiblePhone, 40),
      handoffNotifyEnabled: ai.handoffNotifyEnabled !== false,
      handoffNotifyPhones: parseLines(ai.handoffNotifyPhones, 8),
      voiceReplyEnabled: ai.voiceReplyEnabled === true,
      voiceReplyVoice: clean(ai.voiceReplyVoice, 40) || "marin",
      voiceReplyMode: ["audio_only", "smart", "always"].includes(clean(ai.voiceReplyMode, 40))
        ? (clean(ai.voiceReplyMode, 40) as "audio_only" | "smart" | "always")
        : "smart",
      voiceReplyMaxChars: Math.max(260, Math.min(1400, Number(ai.voiceReplyMaxChars || 460) || 460)),
      whatsappTemplateFollowUpEnabled: ai.whatsappTemplateFollowUpEnabled !== false,
      whatsappTemplateFollowUpName: clean(ai.whatsappTemplateFollowUpName, 120) || "follow_up_geral",
      whatsappTemplateFollowUpLanguage: clean(ai.whatsappTemplateFollowUpLanguage, 24) || "pt_BR",
      whatsappTemplateFollowUpParams: parseLines(ai.whatsappTemplateFollowUpParams, 12),
      guardrails: previewGuardrails,
      mandatoryQuestions: previewMandatoryQuestions,
      escalationTopics: previewEscalationTopics,
      playbookOffers: [],
      playbookScripts: [],
      learningHints,
      tier: operatingProfile.tier,
      autonomyMode: operatingProfile.autonomyMode,
      reasoningLevel: operatingProfile.reasoningLevel,
      responseStyle: operatingProfile.responseStyle,
      allowPremiumModels: operatingProfile.allowPremiumModels,
      preferredProviders: operatingProfile.preferredProviders as AltumAiProvider[],
      monthlyBudgetUsd: Number(ai.monthlyBudgetUsd || 0) || 0,
      monthlyUsageCap: Number(ai.monthlyUsageCap || 0) || 0,
      rollout: normalizeAiConversationRollout(ai.rollout),
      runtimePolicy,
    };

    const heuristicExtractedFields = extractBusinessFields(
      inboundText,
      tenantAiConfig
    );
    const extractedFields = normalizeExtractedFieldsForCrm(llmResult?.extractedFields || heuristicExtractedFields);

    const fallbackChoice = tenantContextConfigured
      ? buildPreviewFallbackChoice({
          inboundText,
          responseText: llmResult?.responseText || null,
        })
      : {
          decision: "respond" as const,
          reason: "tenant_context_not_configured",
          confidence: 0.98,
          nextAction: "configurar_contexto_da_empresa",
          ledBy: "fallback" as const,
          responseText:
            "Olá! Ainda estou conhecendo esta empresa e não tenho informações confiáveis sobre produtos, serviços ou atendimento. Antes de orientar um cliente, configure a descrição do negócio e a base de conhecimento da empresa.",
        };
    const choice = tenantContextConfigured
      ? resolveConversationalChoice({
          fallbackChoice,
          llmDecision: llmResult?.decision,
          llmReason: llmResult?.reason || null,
          llmConfidence: llmResult?.confidence ?? null,
          llmNextAction: llmResult?.nextAction || null,
          llmResponseText: llmResult?.responseText || null,
          llmTurnGoal: llmResult?.turnGoal || null,
          inboundText,
        })
      : { ...fallbackChoice, ledBy: "fallback" as const };
    const plannerDecision = deriveOperationalPlan({
      inboundText,
      messageType: clean(effectiveBody.messageType, 40) || "text",
      choice,
      llmDecision: llmResult?.decision,
      llmReason: llmResult?.reason || null,
      llmConfidence: llmResult?.confidence ?? null,
      llmTurnGoal: llmResult?.turnGoal || null,
      runtimeState: null,
      leadMemory: (effectiveBody.leadMemory || null) as AltumLeadMemory | null,
      extractedFields,
      conversation,
      kbDocs,
      tenantAi: tenantAiConfig,
    });

    const responseText = cleanPreviewResponseForLead(choice.responseText || fallbackChoice.responseText || "", inboundText) || "";

    const quality = scoreAltumConversationQuality({
      inboundText,
      outboundText: responseText,
      plan: plannerDecision,
      runtimeState: null,
    });

    const preview: AiEvaluationPreview & Record<string, unknown> = {
        conversationalChoice: choice,
        plannerDecision,
        llmTurnGoal: llmResult?.turnGoal || null,
        llmMemorySummary: llmResult?.memorySummary || null,
        extractedFields: extractedFields || null,
        responseText,
        quality,
        providerFallbackTriggered: Boolean(llmRun?.providerFallbackTriggered || false),
        providerChainError: llmRun?.providerChainError || null,
        matchedKbDocs: kbDocs.map((doc) => ({
          id: doc.id,
          type: doc.type,
          score: doc.score,
          preview: doc.content.slice(0, 120),
        })),
      evaluationContext: {
          assistantRole,
          businessProfileId,
          businessProfileLabel: businessProfile.label,
        },
      runtime: {
          source: llmResult ? "model" : "fallback",
          provider: llmResult?.provider || null,
          model: llmResult?.model || null,
          providerFallbackTriggered: Boolean(llmRun?.providerFallbackTriggered || llmResult?.fallbackUsed),
          providerChainError: llmRun?.providerChainError || null,
          tenantContextFingerprint: tenantContext.fingerprint,
          configuredGuardrails: tenantContext.diagnostics.guardrailCount,
          configuredMandatoryQuestions: tenantContext.diagnostics.mandatoryQuestionCount,
          configuredEscalationTopics: tenantContext.diagnostics.escalationTopicCount,
          retrievedKnowledgeDocuments: kbDocs.length,
          latencyMs: Date.now() - inferenceStartedAt,
          inputTokens: llmResult?.inputTokens ?? null,
          outputTokens: llmResult?.outputTokens ?? null,
          estimatedCostUsd: llmResult?.estimatedCostUsd ?? null,
      },
    };

    if (evaluationScenario) {
      const { adminDb } = await import("@/app/lib/server/firebase-admin");
      const proofRef = adminDb.collection("ai_evaluation_previews").doc();
      await proofRef.set({
        tenantId,
        createdBy: user.uid,
        scenarioId: evaluationScenario.id,
        scenarioVersion: "2026-09-28",
        preview,
        createdAt: new Date(),
      });
      preview.evaluationProofId = proofRef.id;
    }

    return NextResponse.json({
      ok: true,
      preview,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro no preview da IA:", error);
    return NextResponse.json({ error: "Falha ao executar preview da IA." }, { status: 500 });
  }
}
