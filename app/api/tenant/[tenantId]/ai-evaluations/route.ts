import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  getTenantSettings,
  TenantAccessError,
} from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  AI_EVALUATION_SCENARIO_VERSION,
  AI_EVALUATION_SCENARIOS,
  evaluateAiScenario,
  getAiEvaluationScenario,
  summarizeAiEvaluation,
  type AiEvaluationPreview,
  type AiEvaluationRunItem,
} from "@/lib/ai-evaluation";
import {
  compareAiEvaluationRuns,
  selectAiEvaluationReferenceBaseline,
  type AiEvaluationComparableResult,
  type AiEvaluationComparableRun,
} from "@/lib/ai-evaluation-baseline";
import {
  summarizeAiEvaluationStability,
  type AiEvaluationOutcomeRun,
} from "@/lib/ai-evaluation-stability";
import { buildAiEvaluationContextFingerprint } from "@/lib/ai-evaluation-context";

type SubmittedResult = {
  scenarioId?: string;
  /** A server receipt produced only by an official, immutable scenario run. */
  proofId?: string;
};

type Body = {
  results?: SubmittedResult[];
  source?: string;
  learningRecommendationFingerprint?: string;
};

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function publicRun(id: string, data: Record<string, unknown>) {
  return {
    id,
    source: clean(data.source, 80) || "manual_console",
    summary: data.summary || null,
    results: Array.isArray(data.results) ? data.results : [],
    scenarioVersion: clean(data.scenarioVersion, 40) || AI_EVALUATION_SCENARIO_VERSION,
    baselineComparison: data.baselineComparison || null,
    stability: data.stability || null,
    tenantContextFingerprint: clean(data.tenantContextFingerprint, 160) || null,
    learningRecommendationFingerprint: clean(data.learningRecommendationFingerprint, 160) || null,
    createdAt: data.createdAt || null,
  };
}

function toComparableRun(
  id: string,
  tenantId: string,
  scenarioVersion: string,
  summary: ReturnType<typeof summarizeAiEvaluation>,
  results: AiEvaluationComparableResult[]
): AiEvaluationComparableRun {
  return { id, tenantId, scenarioVersion, summary, results };
}

function storedComparableRun(
  id: string,
  data: Record<string, unknown>
): AiEvaluationComparableRun | null {
  if (!data.summary || !Array.isArray(data.results)) return null;
  const tenantId = clean(data.tenantId, 120);
  const scenarioVersion = clean(data.scenarioVersion, 40);
  if (!tenantId || !scenarioVersion) return null;
  const results = data.results
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      scenarioId: clean(item.scenarioId, 80),
      passed: item.passed === true,
      error: clean(item.error, 240) || null,
      latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : null,
      estimatedCostUsd:
        typeof item.estimatedCostUsd === "number" ? item.estimatedCostUsd : null,
    }));
  return toComparableRun(
    id,
    tenantId,
    scenarioVersion,
    data.summary as ReturnType<typeof summarizeAiEvaluation>,
    results
  );
}

function storedOutcomeRun(id: string, data: Record<string, unknown>): AiEvaluationOutcomeRun | null {
  const scenarioVersion = clean(data.scenarioVersion, 40);
  if (!scenarioVersion || !Array.isArray(data.results)) return null;
  return {
    id,
    scenarioVersion,
    results: data.results
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        scenarioId: clean(item.scenarioId, 80),
        passed: item.passed === true,
      })),
  };
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "manage_ai");

    const snap = await adminDb
      .collection("ai_evaluation_runs")
      .where("tenantId", "==", tenantId)
      .limit(30)
      .get();
    const runs = snap.docs
      .map((doc) => publicRun(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      tenantId,
      scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
      scenarioCount: AI_EVALUATION_SCENARIOS.length,
      latest: runs[0] || null,
      runs,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar avaliacoes da IA:", error);
    return NextResponse.json({ error: "Falha ao carregar avaliacoes da IA." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const requestedLearningFingerprint = clean(body.learningRecommendationFingerprint, 160);
    const submitted = Array.isArray(body.results) ? body.results : [];
    const uniqueScenarioIds = new Set(submitted.map((item) => clean(item.scenarioId, 80)).filter(Boolean));
    const expectedScenarioIds = new Set(AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id));
    const hasExactCoverage =
      submitted.length === expectedScenarioIds.size &&
      uniqueScenarioIds.size === expectedScenarioIds.size &&
      [...uniqueScenarioIds].every((scenarioId) => expectedScenarioIds.has(scenarioId));
    if (!hasExactCoverage) {
      return NextResponse.json(
        { error: "A bateria precisa conter todos os cenarios oficiais uma unica vez." },
        { status: 400 }
      );
    }

    const settings = await getTenantSettings(tenantId);
    const settingsUpdatedAt = toMillis((settings as Record<string, unknown> | null)?.updatedAt);
    const results: AiEvaluationRunItem[] = await Promise.all(submitted.map(async (item) => {
      const scenarioId = clean(item.scenarioId, 80);
      const scenario = getAiEvaluationScenario(scenarioId);
      if (!scenario) {
        return {
          scenarioId,
          label: "Cenario desconhecido",
          preview: null,
          error: "cenario_desconhecido",
          verdict: { passed: false, issues: ["cenario_desconhecido"] },
        };
      }
      const proofId = clean(item.proofId, 120);
      if (!proofId) {
        return {
          scenarioId,
          label: scenario.label,
          preview: null,
          error: "prova_de_execucao_ausente",
          verdict: { passed: false, issues: ["prova_de_execucao_ausente"] },
        };
      }
      const proof = await adminDb.collection("ai_evaluation_previews").doc(proofId).get();
      const proofData = proof.exists ? (proof.data() as Record<string, unknown>) : null;
      const proofCreatedAt = toMillis(proofData?.createdAt);
      const proofIsValid =
        Boolean(proofData) &&
        proofData?.tenantId === tenantId &&
        proofData?.createdBy === user.uid &&
        proofData?.scenarioId === scenarioId &&
        proofCreatedAt >= settingsUpdatedAt &&
        proofCreatedAt > Date.now() - 30 * 60 * 1000;
      if (!proofIsValid) {
        return {
          scenarioId,
          label: scenario.label,
          preview: null,
          error: "prova_de_execucao_invalida_ou_expirada",
          verdict: { passed: false, issues: ["prova_de_execucao_invalida_ou_expirada"] },
        };
      }
      const preview = (proofData?.preview || null) as AiEvaluationPreview | null;
      const error = preview?.runtime?.source !== "model"
        ? "avaliacao_sem_resposta_do_modelo"
        : preview.runtime.providerFallbackTriggered
          ? "avaliacao_com_fallback_de_provedor"
          : requestedLearningFingerprint && preview.runtime.learningRecommendationFingerprint !== requestedLearningFingerprint
            ? "recomendacao_de_aprendizado_nao_aplicada_na_prova"
          : null;
      return {
        scenarioId,
        label: scenario.label,
        preview,
        error,
        verdict: error ? { passed: false, issues: [error] } : evaluateAiScenario(preview, scenario),
      };
    }));

    const summary = summarizeAiEvaluation(results);
    const persistedResults = results.map((item) => ({
      scenarioId: item.scenarioId,
      label: item.label,
      category: getAiEvaluationScenario(item.scenarioId)?.category || "unknown",
      assistantRole: getAiEvaluationScenario(item.scenarioId)?.assistantRole || null,
      businessProfileId: getAiEvaluationScenario(item.scenarioId)?.businessProfileId || null,
      critical: getAiEvaluationScenario(item.scenarioId)?.critical === true,
      passed: item.verdict?.passed === true,
      issues: (item.verdict?.issues || []).map((issue) => clean(issue, 240)).slice(0, 12),
      error: clean(item.error, 240) || null,
      decision: clean(item.preview?.plannerDecision?.decision, 40) || null,
      responseGoal: clean(item.preview?.plannerDecision?.responseGoal, 80) || null,
      stateAfter: clean(item.preview?.plannerDecision?.stateAfter, 80) || null,
      qualityScore:
        typeof item.preview?.quality?.score === "number"
          ? Math.max(0, Math.min(1, item.preview.quality.score))
          : null,
      runtimeSource: clean(item.preview?.runtime?.source, 20) || null,
      provider: clean(item.preview?.runtime?.provider, 80) || null,
      model: clean(item.preview?.runtime?.model, 120) || null,
      providerFallbackTriggered: item.preview?.runtime?.providerFallbackTriggered === true,
      latencyMs: typeof item.preview?.runtime?.latencyMs === "number" ? item.preview.runtime.latencyMs : null,
      estimatedCostUsd:
        typeof item.preview?.runtime?.estimatedCostUsd === "number" ? item.preview.runtime.estimatedCostUsd : null,
      tenantContextFingerprint: clean(item.preview?.runtime?.tenantContextFingerprint, 160) || null,
      roleContractFingerprint: clean(item.preview?.runtime?.roleContractFingerprint, 160) || null,
      roleContractVersion: clean(item.preview?.runtime?.roleContractVersion, 80) || null,
      effectiveAssistantRole: clean(item.preview?.runtime?.effectiveAssistantRole, 40) || null,
      specialistSupervisorVersion: clean(item.preview?.runtime?.specialistSupervisorVersion, 80) || null,
      specialistExecutionVersion: clean(item.preview?.runtime?.specialistExecutionVersion, 80) || null,
      actionPlanVersion: clean(item.preview?.runtime?.actionPlanVersion, 80) || null,
      actionPlanFingerprint: clean(item.preview?.runtime?.actionPlanFingerprint, 160) || null,
      actionPlanExecutionMode: clean(item.preview?.runtime?.actionPlanExecutionMode, 40) || null,
      actionPlanReadySteps: (item.preview?.runtime?.actionPlanReadySteps || []).map((step) => clean(step, 80)).filter(Boolean).slice(0, 20),
      actionPlanApprovalSteps: (item.preview?.runtime?.actionPlanApprovalSteps || []).map((step) => clean(step, 80)).filter(Boolean).slice(0, 20),
      actionPlanBlockedSteps: (item.preview?.runtime?.actionPlanBlockedSteps || []).map((step) => clean(step, 80)).filter(Boolean).slice(0, 20),
      responseComposerVersion: clean(item.preview?.runtime?.responseComposerVersion, 80) || null,
      responseValidationStatus: clean(item.preview?.runtime?.responseValidationStatus, 40) || null,
      learningRecommendationFingerprint: clean(item.preview?.runtime?.learningRecommendationFingerprint, 160) || null,
      specialistSupervisorMode: clean(item.preview?.runtime?.specialistSupervisorMode, 40) || null,
      specialistSupervisorReason: clean(item.preview?.runtime?.specialistSupervisorReason, 120) || null,
      specialistOutputStatus: clean(item.preview?.runtime?.specialistOutputStatus, 40) || null,
      specialistBlockedReasons: (item.preview?.runtime?.specialistBlockedReasons || [])
        .map((reason) => clean(reason, 120))
        .filter(Boolean)
        .slice(0, 12),
      roleReadiness: clean(item.preview?.runtime?.roleReadiness, 40) || null,
      missingRoleSignals: (item.preview?.runtime?.missingRoleSignals || [])
        .map((signal) => clean(signal, 80))
        .filter(Boolean)
        .slice(0, 12),
    }));

    const ref = adminDb.collection("ai_evaluation_runs").doc();
    const candidateRun = toComparableRun(
      ref.id,
      tenantId,
      AI_EVALUATION_SCENARIO_VERSION,
      summary,
      persistedResults
    );
    const previousSnap = await adminDb
      .collection("ai_evaluation_runs")
      .where("tenantId", "==", tenantId)
      .limit(30)
      .get();
    const baselineRun = selectAiEvaluationReferenceBaseline(
      previousSnap.docs.flatMap((doc) => {
        const run = storedComparableRun(doc.id, doc.data() as Record<string, unknown>);
        return run ? [{ run, createdAtMs: toMillis(doc.data().createdAt) }] : [];
      }),
      { tenantId, scenarioVersion: AI_EVALUATION_SCENARIO_VERSION }
    );
    const baselineComparison = compareAiEvaluationRuns(baselineRun, candidateRun);
    const tenantContextFingerprint = buildAiEvaluationContextFingerprint(
      persistedResults.map((result) => ({
        scenarioId: result.scenarioId,
        tenantContextFingerprint: result.tenantContextFingerprint,
        roleContractFingerprint: result.roleContractFingerprint,
        effectiveAssistantRole: result.effectiveAssistantRole,
        specialistSupervisorVersion: result.specialistSupervisorVersion,
        specialistExecutionVersion: result.specialistExecutionVersion,
        actionPlanVersion: result.actionPlanVersion,
        responseComposerVersion: result.responseComposerVersion,
        learningRecommendationFingerprint: result.learningRecommendationFingerprint,
      }))
    );
    const previousStabilityRuns = tenantContextFingerprint
      ? previousSnap.docs
          .map((doc) => ({
            run: storedOutcomeRun(doc.id, doc.data() as Record<string, unknown>),
            scenarioVersion: clean(doc.data().scenarioVersion, 40),
            fingerprint: clean(doc.data().tenantContextFingerprint, 160),
            createdAtMs: toMillis(doc.data().createdAt),
          }))
          .filter((item): item is { run: AiEvaluationOutcomeRun; scenarioVersion: string; fingerprint: string; createdAtMs: number } =>
            Boolean(item.run) &&
            item.scenarioVersion === AI_EVALUATION_SCENARIO_VERSION &&
            item.fingerprint === tenantContextFingerprint
          )
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, 2)
          .reverse()
          .map((item) => item.run)
      : [];
    const stability = summarizeAiEvaluationStability([
      ...previousStabilityRuns,
      {
        id: ref.id,
        scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
        results: persistedResults.map((result) => ({
          scenarioId: result.scenarioId,
          passed: result.passed,
        })),
      },
    ]);

    await ref.set({
      tenantId,
      createdBy: user.uid,
      source: clean(body.source, 80) || "manual_console",
      scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
      summary,
      results: persistedResults,
      baselineComparison,
      tenantContextFingerprint,
      stability,
      learningRecommendationFingerprint: requestedLearningFingerprint || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      run: {
        id: ref.id,
        source: clean(body.source, 80) || "manual_console",
        scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
        summary,
        results: persistedResults,
        baselineComparison,
        tenantContextFingerprint,
        stability,
        learningRecommendationFingerprint: requestedLearningFingerprint || null,
        createdAt: Date.now(),
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao registrar avaliacao da IA:", error);
    return NextResponse.json({ error: "Falha ao registrar avaliacao da IA." }, { status: 500 });
  }
}
