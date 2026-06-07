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
import { runConversationAgent } from "@/lib/server/ai/router";
import { resolveConversationalChoice } from "@/lib/server/ai/conversation-core";
import { deriveOperationalPlan } from "@/lib/server/ai/operational-plan";
import { scoreAltumConversationQuality } from "@/lib/server/ai/quality-score";
import { getBusinessProfile, getBusinessProfilePlaybookPreset, normalizeBusinessProfileId } from "@/lib/business-profiles";
import type { AltumLeadMemory } from "@/lib/server/ai/runtime-state";
import {
  extractBusinessFields,
  normalizeExtractedFieldsForCrm,
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
};

type Body = {
  message?: string;
  messageType?: string;
  history?: PreviewMessage[];
  contactName?: string;
  runtimeStateSummary?: string;
  leadMemory?: Partial<AltumLeadMemory> | null;
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
        ? "Oi! Tudo bem? Pra te direcionar certo, hoje o foco e gerar mais leads, organizar atendimento ou converter melhor?"
        : isHumanTurn
          ? "Tudo certo por aqui. Pra eu te direcionar melhor, qual e o principal gargalo comercial hoje?"
          : "Me conta um pouco melhor o teu momento hoje."),
  };
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const inboundText = clean(body.message, 1400);
    if (!inboundText) {
      return NextResponse.json({ error: "Mensagem obrigatoria para preview." }, { status: 400 });
    }

    const settings = await getTenantSettings(tenantId);
    const ai = settings && typeof settings.ai === "object" && settings.ai ? (settings.ai as Record<string, unknown>) : {};
    const businessProfileId = normalizeBusinessProfileId(settings?.businessProfileId);
    const businessProfile = getBusinessProfile(businessProfileId);
    const playbookPreset = getBusinessProfilePlaybookPreset(businessProfileId);
    const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);
    const runtimePolicy = buildAiRuntimePolicy(operatingProfile);
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
        return {
          id: doc.id,
          type,
          tags,
          content,
          score: scoreKbDoc({
            inboundText,
            messageWords,
            retrievalMode: runtimePolicy.retrievalMode,
            doc: { content, tags, type },
          }),
        };
      })
      .filter((item) => item.content && item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const history = (body.history || []).map((item, index) => ({
      id: `preview_${index + 1}`,
      sender: item.sender || "client",
      text: clean(item.text, 900),
      type: clean(item.type, 40) || "text",
    }));

    const currentMessage = {
      id: "preview_current",
      sender: "client" as const,
      text: inboundText,
      type: clean(body.messageType, 40) || "text",
    };
    const conversation = [...history, currentMessage];

    const llmRun =
      runtimePolicy.primaryProvider !== "altum_rules"
        ? await runConversationAgent(
            {
              tenantId,
              chatId: "preview_chat",
              inboundText,
              channel: "whatsapp",
              agentName: clean(ai.agentName, 80) || `Agente ${clean(settings?.name, 80) || businessProfile.label}`,
              contactName: typeof body.contactName === "string" ? body.contactName : undefined,
              runtimeStateSummary: clean(body.runtimeStateSummary, 320) || undefined,
              leadMemorySummary: summarizeLeadMemoryForPreview(body.leadMemory || null) || undefined,
              toneOfVoice: clean(ai.toneOfVoice, 120) || businessProfile.ai.toneOfVoice,
              businessSummary: clean(ai.businessSummary, 360) || clean(settings?.name, 120) || businessProfile.description,
              objective: clean(ai.objective, 200) || businessProfile.ai.objective,
              guardrails: Array.from(
                new Set([
                  ...parseGuardrails(ai.guardrails),
                  ...businessProfile.ai.guardrails,
                ])
              ),
              mandatoryQuestions: Array.from(
                new Set([
                  ...businessProfile.ai.mandatoryQuestions,
                  ...parseLines(ai.mandatoryQuestions, 12),
                ])
              ),
              escalationTopics: Array.from(
                new Set([
                  ...businessProfile.ai.escalationTopics,
                  ...parseLines(ai.escalationTopics, 12),
                ])
              ),
              playbookOffers: playbookPreset.offers.slice(0, 6),
              playbookScripts: playbookPreset.scripts.slice(0, 6),
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
      businessProfileId,
      businessProfileLabel: businessProfile.label,
      agentName: clean(ai.agentName, 80) || `Agente ${clean(settings?.name, 80) || businessProfile.label}`,
      businessSummary: clean(ai.businessSummary, 360) || clean(settings?.name, 120) || businessProfile.description,
      objective: clean(ai.objective, 200) || businessProfile.ai.objective,
      toneOfVoice: clean(ai.toneOfVoice, 120) || businessProfile.ai.toneOfVoice,
      responsiblePhone: clean(ai.responsiblePhone, 40),
      handoffNotifyEnabled: ai.handoffNotifyEnabled !== false,
      handoffNotifyPhones: parseLines(ai.handoffNotifyPhones, 8),
      voiceReplyEnabled: ai.voiceReplyEnabled === true,
      voiceReplyVoice: clean(ai.voiceReplyVoice, 40) || "marin",
      guardrails: parseGuardrails(ai.guardrails),
      mandatoryQuestions: parseLines(ai.mandatoryQuestions, 12),
      escalationTopics: parseLines(ai.escalationTopics, 12),
      playbookOffers: playbookPreset.offers.slice(0, 6),
      playbookScripts: playbookPreset.scripts.slice(0, 6),
      learningHints,
      tier: operatingProfile.tier,
      autonomyMode: operatingProfile.autonomyMode,
      reasoningLevel: operatingProfile.reasoningLevel,
      responseStyle: operatingProfile.responseStyle,
      allowPremiumModels: operatingProfile.allowPremiumModels,
      preferredProviders: operatingProfile.preferredProviders as AltumAiProvider[],
      monthlyBudgetUsd: Number(ai.monthlyBudgetUsd || 0) || 0,
      monthlyUsageCap: Number(ai.monthlyUsageCap || 0) || 0,
      runtimePolicy,
    };

    const heuristicExtractedFields = extractBusinessFields(
      inboundText,
      tenantAiConfig as Parameters<typeof extractBusinessFields>[1]
    );
    const extractedFields = normalizeExtractedFieldsForCrm(llmResult?.extractedFields || heuristicExtractedFields);

    const fallbackChoice = buildPreviewFallbackChoice({
      inboundText,
      responseText: llmResult?.responseText || null,
    });
    const choice = resolveConversationalChoice({
      fallbackChoice,
      llmDecision: llmResult?.decision,
      llmReason: llmResult?.reason || null,
      llmConfidence: llmResult?.confidence ?? null,
      llmNextAction: llmResult?.nextAction || null,
      llmResponseText: llmResult?.responseText || null,
      llmTurnGoal: llmResult?.turnGoal || null,
      inboundText,
    });
    const plannerDecision = deriveOperationalPlan({
      inboundText,
      messageType: clean(body.messageType, 40) || "text",
      choice,
      llmDecision: llmResult?.decision,
      llmReason: llmResult?.reason || null,
      llmConfidence: llmResult?.confidence ?? null,
      llmTurnGoal: llmResult?.turnGoal || null,
      runtimeState: null,
      leadMemory: (body.leadMemory || null) as AltumLeadMemory | null,
      extractedFields,
      conversation,
      kbDocs,
      tenantAi: tenantAiConfig,
    });

    const responseText = clean(choice.responseText || fallbackChoice.responseText || "", 1600) || "";

    const quality = scoreAltumConversationQuality({
      inboundText,
      outboundText: responseText,
      plan: plannerDecision,
      runtimeState: null,
    });

    return NextResponse.json({
      ok: true,
      preview: {
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
      },
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
