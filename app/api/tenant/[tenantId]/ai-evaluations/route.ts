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

type SubmittedResult = {
  scenarioId?: string;
  /** A server receipt produced only by an official, immutable scenario run. */
  proofId?: string;
};

type Body = {
  results?: SubmittedResult[];
  source?: string;
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
    createdAt: data.createdAt || null,
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
    }));

    const ref = adminDb.collection("ai_evaluation_runs").doc();
    await ref.set({
      tenantId,
      createdBy: user.uid,
      source: clean(body.source, 80) || "manual_console",
      scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
      summary,
      results: persistedResults,
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
