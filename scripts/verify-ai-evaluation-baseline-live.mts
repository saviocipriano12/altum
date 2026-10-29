import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import {
  AI_EVALUATION_SCENARIOS,
  AI_EVALUATION_SCENARIO_VERSION,
  evaluateAiScenario,
  summarizeAiEvaluation,
  type AiEvaluationPreview,
  type AiEvaluationRunItem,
} from "../lib/ai-evaluation.ts";
import { runConversationAgent, type ConversationAgentInput } from "../lib/server/ai/router.ts";
import { compileTenantAiContext } from "../lib/server/ai/tenant-context.ts";
import { deriveOperationalPlan } from "../lib/server/ai/operational-plan.ts";
import { scoreAltumConversationQuality } from "../lib/server/ai/quality-score.ts";
import type { AltumLeadMemory } from "../lib/server/ai/runtime-state.ts";
import {
  mergeRelationshipState,
  relationshipFactsForPrompt,
} from "../lib/server/ai/relationship-state.ts";
import {
  specialistSupervisorInstruction,
  superviseAiSpecialist,
} from "../lib/server/ai/specialist-supervisor.ts";
import {
  compileAiSpecialistExecutionContract,
  validateAiSpecialistOutput,
} from "../lib/server/ai/specialist-execution.ts";
import { compileAiActionPlan } from "../lib/server/ai/action-plan.ts";
import { composeAiResponse } from "../lib/server/ai/response-composer.ts";
import { deriveDeterministicConversationFields } from "../lib/server/ai/deterministic-field-extraction.ts";

nextEnv.loadEnvConfig(process.cwd());

const model = process.env.ALTUM_EVAL_MODEL || "gpt-4.1-mini";
const tenantId = "quality-evaluation-baseline";
const runtimePolicy = {
  primaryProvider: "openai" as const,
  fallbackProviders: [] as const,
  conversationModel: model,
  extractionModel: model,
  retrievalMode: "hybrid" as const,
  supportsToolCalling: true,
  supportsDeepReasoning: false,
  budgetMode: "conservative" as const,
};

const businessSummaries = {
  generic: "Empresa que organiza atendimento e operacao comercial com IA.",
  imobiliaria: "Imobiliaria que atende compradores, vendedores e interessados em imoveis.",
  clinica: "Clinica que orienta pacientes sobre atendimento e agendamento sem realizar diagnostico por mensagem.",
  agencia: "Agencia que presta servicos de marketing e geracao de oportunidades.",
};

const guardrails = [
  "Nao invente produto, preco, prazo, disponibilidade ou politica.",
  "Nao se apresente como humano.",
  "Respeite imediatamente pedidos de atendimento humano.",
  "Nao pressione o cliente nem force oferta antes de entender a necessidade.",
  "Em saude, nao diagnostique nem prescreva por mensagem.",
];

const kbDocs: ConversationAgentInput["kbDocs"] = [
  {
    id: "catalog-ai",
    type: "catalog",
    content: "Atendimento comercial com IA para WhatsApp e redes sociais.",
    tags: ["atendimento", "whatsapp", "vendas", "ia"],
    productName: "Atendimento comercial com IA",
    productCategory: "servico",
    description: "Organiza conversas, contexto de clientes e acompanhamento comercial.",
    benefits: "Agilidade no atendimento e continuidade das oportunidades.",
    availability: "active",
    score: 0.95,
  },
];

const scenarioFilter = (process.env.ALTUM_EVAL_SCENARIO || "").trim();
const scenarioIds = new Set(
  scenarioFilter
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const selectedScenarios = scenarioFilter
  ? AI_EVALUATION_SCENARIOS.filter((scenario) => scenarioIds.has(scenario.id))
  : AI_EVALUATION_SCENARIOS;
if (scenarioFilter && selectedScenarios.length !== scenarioIds.size) {
  throw new Error(`Um ou mais cenarios de avaliacao sao desconhecidos: ${scenarioFilter}`);
}
const results: AiEvaluationRunItem[] = [];

function prepareScenarioLeadMemory(
  scenarioId: string,
  leadMemory: AltumLeadMemory | null | undefined
): AltumLeadMemory | null {
  if (!leadMemory) return null;
  if (leadMemory.relationshipState) return leadMemory;
  const verifiedFacts = {
    preferredName: leadMemory.preferredName,
    businessType: leadMemory.businessType,
    primaryGoal: leadMemory.primaryGoal,
    budgetBand: leadMemory.budgetBand,
    urgency: leadMemory.urgency,
    dominantIntent: leadMemory.dominantIntent,
    dominantObjection: leadMemory.dominantObjection,
    decisionMaker: leadMemory.decisionMaker,
    digitalMaturity: leadMemory.digitalMaturity,
    city: leadMemory.city,
    currentChannels: leadMemory.currentChannels,
    teamSize: leadMemory.teamSize,
    recommendedOffer: leadMemory.recommendedOffer,
    leadTone: leadMemory.leadTone,
    activeTopic: leadMemory.activeTopic,
    conversationMaturity: leadMemory.conversationMaturity,
  };
  const seeded = mergeRelationshipState({
    tenantId,
    leadId: `evaluation_${scenarioId}`,
    occurredAtMs: Date.now() - 1_000,
    sourceMessageId: `evaluation:${scenarioId}`,
    inboundText: Object.values(verifiedFacts).filter(Boolean).join(" "),
    derivedFacts: verifiedFacts,
  });
  return { ...leadMemory, relationshipState: seeded.state };
}

for (const scenario of selectedScenarios) {
  const assistantRole = scenario.assistantRole || "sales";
  const businessProfileId = scenario.businessProfileId || "generic";
  const businessSummary = businessSummaries[businessProfileId];
  const scenarioLeadMemory = prepareScenarioLeadMemory(
    scenario.id,
    (scenario.leadMemory || null) as AltumLeadMemory | null
  );
  const supervisorDecision = superviseAiSpecialist({
    tenantId,
    chatId: `baseline-${scenario.id}`,
    messageId: `evaluation:${scenario.id}`,
    configuredRole: assistantRole,
    inboundText: scenario.message,
    runtimeState: null,
    leadMemory: scenarioLeadMemory,
    extractedFields: null,
  });
  const effectiveAssistantRole = supervisorDecision.selectedSpecialist || assistantRole;
  const tenantContext = compileTenantAiContext({
    tenantId,
    agentName: "Lia",
    assistantRole: effectiveAssistantRole,
    businessSummary,
    objective: "Resolver a necessidade atual e conduzir somente o proximo passo que fizer sentido.",
    toneOfVoice: "Humano, direto, respeitoso e natural.",
    commercialBrain: {
      idealCustomer: "Empresas que atendem clientes por canais digitais.",
      diagnosisStyle: "Responda primeiro e investigue uma variavel por vez.",
      proposalStyle: "Confirme escopo e condicoes documentadas antes de orientar a decisao.",
      forbiddenSalesMoves: "Nao empurre oferta, reuniao ou proposta sem contexto e intencao do cliente.",
    },
    guardrails,
    mandatoryQuestions: ["Qual resultado voce quer melhorar primeiro?"],
    escalationTopics: ["pedido de humano", "cancelamento formal", "orientacao medica"],
    hasVerifiedOffers: true,
  });
  const specialistExecution = compileAiSpecialistExecutionContract({
    supervisor: supervisorDecision,
    roleContract: tenantContext.roleContract,
    autonomyMode: "hybrid",
    tenantContextConfigured: true,
  });
  const history = (scenario.history || []).map((item, index) => ({
    id: `history-${index + 1}`,
    sender: item.sender,
    text: item.text,
    type: item.type,
  }));
  const startedAt = Date.now();
  const relationshipEvidence = relationshipFactsForPrompt(scenarioLeadMemory?.relationshipState || null);

  try {
    const run = await runConversationAgent(
      {
        tenantId,
        chatId: `baseline-${scenario.id}`,
        inboundText: scenario.message,
        messageType: scenario.messageType || "text",
        channel: scenario.channel || "whatsapp",
        agentName: "Lia",
        assistantRole: effectiveAssistantRole,
        supervisorInstruction: [
          specialistSupervisorInstruction(supervisorDecision),
          specialistExecution.prompt,
        ].join("\n"),
        tenantContext,
        tenantContextConfigured: true,
        leadMemorySummary: scenarioLeadMemory
          ? [
              relationshipEvidence.confirmed.length
                ? `fatos confirmados (nao perguntar novamente): ${relationshipEvidence.confirmed.join("; ")}`
                : "",
              relationshipEvidence.hypotheses.length
                ? `hipoteses (validar antes de usar): ${relationshipEvidence.hypotheses.join("; ")}`
                : "",
              JSON.stringify(scenarioLeadMemory).slice(0, 700),
            ].filter(Boolean).join(" | ").slice(0, 1200)
          : undefined,
        toneOfVoice: "humano, direto e natural",
        businessSummary,
        objective: "Resolver a necessidade atual e conduzir somente o proximo passo que fizer sentido.",
        guardrails,
        mandatoryQuestions: ["Qual resultado voce quer melhorar primeiro?"],
        escalationTopics: ["pedido de humano", "cancelamento formal", "orientacao medica"],
        playbookOffers: [],
        playbookScripts: [],
        tier: "essential",
        autonomyMode: "hybrid",
        reasoningLevel: "fast",
        responseStyle: "concise",
        conversation: history,
        kbDocs,
        preferredProviders: ["openai"],
      },
      runtimePolicy
    );
    const rawResult = run.result;
    const specialistValidation = validateAiSpecialistOutput({
      contract: specialistExecution,
      result: rawResult,
    });
    const result = specialistValidation.accepted ? rawResult : null;
    if (!result) {
      const specialistError = specialistValidation.blockedReasons.length
        ? `specialist_output_${specialistValidation.status}:${specialistValidation.blockedReasons.join(",")}`
        : run.providerChainError || "modelo_sem_resposta";
      results.push({
        scenarioId: scenario.id,
        label: scenario.label,
        preview: null,
        error: specialistError,
        verdict: { passed: false, issues: [specialistError] },
      });
      continue;
    }

    const decision = result.decision === "skip" ? "respond" : result.decision;
    const extractedFields = {
      ...deriveDeterministicConversationFields(scenario.message),
      ...(result.extractedFields || {}),
    };
    const choice = {
      decision,
      reason: result.reason,
      confidence: result.confidence,
      nextAction: result.nextAction || "resolver_necessidade_atual",
      ledBy: "llm" as const,
    };
    const plannerDecision = deriveOperationalPlan({
      inboundText: scenario.message,
      messageType: scenario.messageType || "text",
      choice,
      llmDecision: result.decision,
      llmReason: result.reason,
      llmConfidence: result.confidence,
      llmTurnGoal: result.turnGoal || null,
      runtimeState: null,
      leadMemory: scenarioLeadMemory,
      extractedFields,
      conversation: [...history, { id: "current", sender: "client", text: scenario.message }],
      kbDocs: kbDocs.map((doc) => ({
        id: doc.id,
        type: doc.type,
        content: doc.content,
        tags: doc.tags,
        score: doc.score || 0,
      })),
      tenantAi: {
        escalationTopics: ["pedido de humano", "cancelamento formal", "orientacao medica"],
        playbookOffers: [],
        learningHints: null,
        salesMotion: "consultative",
        assistantRole: effectiveAssistantRole,
        roleContract: tenantContext.roleContract,
      },
    });
    const confirmedFactKeys = scenarioLeadMemory?.relationshipState
      ? Object.values(scenarioLeadMemory.relationshipState.facts)
          .filter((fact) => fact.status === "confirmed")
          .map((fact) => fact.key)
          .slice(0, 20)
      : [];
    const actionPlan = compileAiActionPlan({
      tenantId,
      chatId: `evaluation_${scenario.id}`,
      messageId: `evaluation_${scenario.id}_current`,
      leadId: `evaluation_${scenario.id}_lead`,
      autonomyMode: "hybrid",
      specialist: specialistExecution,
      planner: plannerDecision,
      tenantContextConfigured: true,
      shadowMode: true,
      extractedFieldKeys: Object.keys(extractedFields),
      confirmedFactKeys,
      verifiedOffer: kbDocs.some((doc) => doc.type === "catalog"),
      explicitPurchaseIntent:
        plannerDecision.intent === "purchase_interest" ||
        /\b(quero\s+(comprar|fechar|contratar)|pode\s+(fechar|gerar|mandar)|vou\s+fechar|finalizar\s+(a\s+)?compra)\b/i.test(scenario.message),
      sensitiveDataDetected:
        /\b(senha|cvv|codigo\s+de\s+seguranca|numero\s+completo\s+do\s+cartao|cartao\s+completo)\b/i.test(scenario.message),
    });
    const responseComposition = composeAiResponse({
      inboundText: scenario.message,
      draftText: result.responseText || "",
      channel: scenario.channel || "whatsapp",
      messageType: scenario.messageType || "text",
      decision,
      responseGoal: plannerDecision.responseGoal,
      relationshipState: scenarioLeadMemory?.relationshipState || null,
      allowUrls: false,
      verifiedPrice: kbDocs.some((doc) => doc.type === "catalog" && doc.priceFrom !== null && doc.priceFrom !== undefined),
      verifiedInventory: kbDocs.some((doc) => doc.type === "catalog" && doc.inventoryQuantity !== null && doc.inventoryQuantity !== undefined),
      verifiedPayment: kbDocs.some((doc) => doc.type === "catalog" && Boolean(doc.paymentConditions)),
      verifiedDelivery: kbDocs.some((doc) => doc.type === "catalog" && Boolean(doc.stockDelivery)),
    });
    const responseText = responseComposition.text;
    const quality = scoreAltumConversationQuality({
      inboundText: scenario.message,
      outboundText: responseText,
      plan: plannerDecision,
      runtimeState: null,
    });
    const preview: AiEvaluationPreview = {
      plannerDecision,
      extractedFields,
      actionPlan,
      responseValidationTrace: responseComposition.receipt,
      responseText,
      quality,
      evaluationContext: { assistantRole, businessProfileId },
      runtime: {
        source: "model",
        provider: result.provider,
        model: result.model,
        providerFallbackTriggered: run.providerFallbackTriggered || result.fallbackUsed,
        providerChainError: run.providerChainError || null,
        tenantContextFingerprint: tenantContext.fingerprint,
        tenantContextSchemaVersion: tenantContext.schemaVersion,
        roleContractVersion: tenantContext.roleContract.schemaVersion,
        roleContractFingerprint: tenantContext.roleContract.fingerprint,
        effectiveAssistantRole: tenantContext.roleContract.role,
        configuredAssistantRole: assistantRole,
        specialistSupervisorVersion: supervisorDecision.schemaVersion,
        specialistSupervisorMode: supervisorDecision.mode,
        specialistSupervisorReason: supervisorDecision.reason,
        specialistDecisionKey: supervisorDecision.idempotencyKey,
        specialistExecutionVersion: specialistExecution.schemaVersion,
        specialistTaskKind: specialistExecution.taskKind,
        specialistAllowedTools: specialistExecution.allowedTools,
        specialistOutputStatus: specialistValidation.status,
        specialistBlockedReasons: specialistValidation.blockedReasons,
        actionPlanVersion: actionPlan.schemaVersion,
        actionPlanFingerprint: actionPlan.fingerprint,
        actionPlanExecutionMode: actionPlan.executionMode,
        actionPlanReadySteps: actionPlan.steps.filter((step) => step.authorization === "ready").map((step) => step.kind),
        actionPlanApprovalSteps: actionPlan.steps.filter((step) => step.authorization === "approval_required").map((step) => step.kind),
        actionPlanBlockedSteps: actionPlan.steps.filter((step) => step.authorization === "blocked").map((step) => step.kind),
        responseComposerVersion: responseComposition.receipt.schemaVersion,
        responseValidationStatus: responseComposition.receipt.status,
        responseValidationBlockedReasons: responseComposition.receipt.blockedReasons,
        responseValidationTransformations: responseComposition.receipt.transformations,
        responseMessageCount: responseComposition.receipt.messageCount,
        roleReadiness: tenantContext.roleContract.readiness,
        missingRoleSignals: tenantContext.roleContract.missingSignals,
        relationshipStateRevision: scenarioLeadMemory?.relationshipState?.revision ?? null,
        relationshipConfirmedFactKeys: confirmedFactKeys,
        relationshipRemovedRepeatedQuestionKeys: responseComposition.receipt.removedRelationshipQuestionKeys,
        relationshipPrivacyBoundaryApplied: responseComposition.receipt.transformations.some((item) => item.startsWith("privacy_boundary:")),
        configuredGuardrails: tenantContext.diagnostics.guardrailCount,
        configuredMandatoryQuestions: tenantContext.diagnostics.mandatoryQuestionCount,
        configuredEscalationTopics: tenantContext.diagnostics.escalationTopicCount,
        retrievedKnowledgeDocuments: kbDocs.length,
        latencyMs: Date.now() - startedAt,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        estimatedCostUsd: result.estimatedCostUsd ?? null,
      },
    };
    results.push({
      scenarioId: scenario.id,
      label: scenario.label,
      preview,
      error: run.providerFallbackTriggered || result.fallbackUsed ? "fallback_de_provedor" : null,
      verdict: evaluateAiScenario(preview, scenario),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      scenarioId: scenario.id,
      label: scenario.label,
      preview: null,
      error: message,
      verdict: { passed: false, issues: [message] },
    });
  }

  const latest = results.at(-1);
  process.stdout.write(
    `${latest?.verdict?.passed ? "PASS" : "FAIL"} ${scenario.id}` +
      `${latest?.verdict?.issues.length ? ` — ${latest.verdict.issues.join("; ")}` : ""}\n`
  );
}

const summary = summarizeAiEvaluation(results);
const artifactDir = resolve(process.cwd(), ".qa-artifacts", "ai-evaluation");
await mkdir(artifactDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactPath = resolve(artifactDir, `baseline-${stamp}.json`);
await writeFile(
  artifactPath,
  JSON.stringify(
    {
      schemaVersion: 1,
      scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
      capturedAt: new Date().toISOString(),
      tenantId,
      model,
      verificationMode: scenarioFilter ? "targeted" : "full",
      scenarioFilter: scenarioFilter || null,
      summary,
      results: results.map((item) => ({
        scenarioId: item.scenarioId,
        label: item.label,
        passed: item.verdict?.passed === true,
        issues: item.verdict?.issues || [],
        error: item.error || null,
        decision: item.preview?.plannerDecision?.decision || null,
        responseGoal: item.preview?.plannerDecision?.responseGoal || null,
        stateAfter: item.preview?.plannerDecision?.stateAfter || null,
        assistantRole: item.preview?.evaluationContext?.assistantRole || null,
        businessProfileId: item.preview?.evaluationContext?.businessProfileId || null,
        qualityScore: item.preview?.quality?.score ?? null,
        responseText: item.preview?.responseText || null,
        runtime: item.preview?.runtime || null,
      })),
    },
    null,
    2
  ),
  "utf8"
);

if (scenarioFilter) {
  const targetedPassed = results.every((item) => item.verdict?.passed === true);
  process.stdout.write(`\nVerificacao direcionada: ${targetedPassed ? "aprovada" : "reprovada"} (${results.filter((item) => item.verdict?.passed).length}/${results.length})\n`);
} else {
  process.stdout.write(`\nGate: ${summary.gate}\n`);
  process.stdout.write(`Aprovados: ${summary.approved}/${summary.total} (${Math.round(summary.passRate * 100)}%)\n`);
  process.stdout.write(`Falhas criticas: ${summary.criticalFailures}\n`);
}
process.stdout.write(`Artefato: ${artifactPath}\n`);

if (
  process.argv.includes("--require-ready") &&
  (scenarioFilter ? results.some((item) => item.verdict?.passed !== true) : summary.gate !== "ready")
) process.exitCode = 1;
