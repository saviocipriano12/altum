import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  buildAiDigitalTwinSnapshot,
  compareAiDigitalTwinRuns,
  type AiDigitalTwinEvaluationRun,
  type AiDigitalTwinStoredResult,
} from "@/lib/ai-digital-twin";
import { persistAiDigitalTwinRun } from "@/lib/server/ai/digital-twin-store";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().getTime();
  if (typeof value === "object" && "_seconds" in value && typeof (value as { _seconds?: number })._seconds === "number") return (value as { _seconds: number })._seconds * 1000;
  return 0;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => clean(item, 120)).filter(Boolean).slice(0, 30) : [];
}

function storedRun(id: string, data: Record<string, unknown>): AiDigitalTwinEvaluationRun {
  const summary = data.summary && typeof data.summary === "object" ? data.summary as Record<string, unknown> : {};
  const baseline = data.baselineComparison && typeof data.baselineComparison === "object" ? data.baselineComparison as Record<string, unknown> : {};
  const stability = data.stability && typeof data.stability === "object" ? data.stability as Record<string, unknown> : {};
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    id,
    tenantId: clean(data.tenantId, 140),
    scenarioVersion: clean(data.scenarioVersion, 80),
    learningRecommendationFingerprint: clean(data.learningRecommendationFingerprint, 160) || null,
    summaryGate: clean(summary.gate, 40) || null,
    baselineStatus: clean(baseline.status, 40) || null,
    stabilityStatus: clean(stability.status, 40) || null,
    results: results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map((item): AiDigitalTwinStoredResult => ({
      scenarioId: clean(item.scenarioId, 100),
      passed: item.passed === true,
      critical: item.critical === true,
      category: clean(item.category, 80),
      decision: clean(item.decision, 40) || null,
      responseGoal: clean(item.responseGoal, 80) || null,
      stateAfter: clean(item.stateAfter, 80) || null,
      qualityScore: typeof item.qualityScore === "number" ? item.qualityScore : null,
      latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : null,
      estimatedCostUsd: typeof item.estimatedCostUsd === "number" ? item.estimatedCostUsd : null,
      providerFallbackTriggered: item.providerFallbackTriggered === true,
      actionPlanExecutionMode: clean(item.actionPlanExecutionMode, 40) || null,
      actionPlanReadySteps: stringList(item.actionPlanReadySteps),
      actionPlanApprovalSteps: stringList(item.actionPlanApprovalSteps),
      responseValidationStatus: clean(item.responseValidationStatus, 40) || null,
      issues: stringList(item.issues),
    })),
  };
}

async function authorize(req: Request, tenantId: string) {
  const user = await requireRequestUser(req);
  const membership = await assertTenantAccess(user.uid, tenantId);
  await assertTenantModule(tenantId, "ai");
  assertTenantCapability(membership, "manage_ai");
  return user;
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    await authorize(req, tenantId);
    const snapshot = await adminDb.collection("ai_digital_twin_runs").where("tenantId", "==", tenantId).limit(30).get();
    const runs = snapshot.docs
      .map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .slice(0, 10);
    return NextResponse.json({ ok: true, tenantId, runs });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar simulacoes da IA:", error);
    return NextResponse.json({ error: "Falha ao carregar simulacoes da IA." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    const user = await authorize(req, tenantId);
    const body = await req.json() as { baselineRunId?: string; candidateRunId?: string; candidateFingerprint?: string };
    const baselineRunId = clean(body.baselineRunId, 160);
    const candidateRunId = clean(body.candidateRunId, 160);
    const candidateFingerprint = clean(body.candidateFingerprint, 160);
    if (!baselineRunId || !candidateRunId || baselineRunId === candidateRunId) return NextResponse.json({ error: "Baseline e candidato distintos sao obrigatorios." }, { status: 400 });
    const [baselineDoc, candidateDoc] = await Promise.all([
      adminDb.collection("ai_evaluation_runs").doc(baselineRunId).get(),
      adminDb.collection("ai_evaluation_runs").doc(candidateRunId).get(),
    ]);
    if (!baselineDoc.exists || !candidateDoc.exists) return NextResponse.json({ error: "Execucao oficial nao encontrada." }, { status: 404 });
    const baselineData = baselineDoc.data() as Record<string, unknown>;
    const candidateData = candidateDoc.data() as Record<string, unknown>;
    const baseline = storedRun(baselineDoc.id, baselineData);
    const candidate = storedRun(candidateDoc.id, candidateData);
    const twinSnapshot = buildAiDigitalTwinSnapshot({
      tenantId,
      baselineRunId,
      candidateRunId,
      baselineContextFingerprint: clean(baselineData.tenantContextFingerprint, 160),
      candidateContextFingerprint: clean(candidateData.tenantContextFingerprint, 160),
      candidateLearningFingerprint: candidate.learningRecommendationFingerprint,
    });
    const comparison = compareAiDigitalTwinRuns({ tenantId, baseline, candidate, expectedCandidateFingerprint: candidateFingerprint || null });
    const persisted = await persistAiDigitalTwinRun({
      tenantId,
      createdBy: user.uid,
      createdByName: user.name,
      snapshot: twinSnapshot,
      comparison,
    });
    return NextResponse.json({ ok: true, tenantId, run: { id: persisted.id, persistenceStatus: persisted.status, snapshot: twinSnapshot, comparison } });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao executar gemeo digital:", error);
    return NextResponse.json({ error: "Falha ao executar simulacao da IA." }, { status: 500 });
  }
}
