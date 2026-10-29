import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { evaluateTenantLearningPromotion } from "@/lib/server/ai/learning-approval";

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

function publicRecommendation(id: string, data: Record<string, unknown>) {
  return {
    id,
    schemaVersion: clean(data.schemaVersion, 80),
    status: clean(data.status, 40),
    targetKind: clean(data.targetKind, 60),
    targetId: clean(data.targetId, 120),
    sampleSize: Number(data.sampleSize || 0),
    distinctRelationships: Number(data.distinctRelationships || 0),
    confidence: Number(data.confidence || 0),
    conflictRatio: Number(data.conflictRatio || 0),
    explanation: clean(data.explanation, 500),
    rollback: clean(data.rollback, 500),
    fingerprint: clean(data.fingerprint, 160),
    windowStartMs: Number(data.windowStartMs || 0),
    windowEndMs: Number(data.windowEndMs || 0),
    expiresAt: data.expiresAt || null,
    updatedAt: data.updatedAt || null,
    approvedEvaluationRunId: clean(data.approvedEvaluationRunId, 160) || null,
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
    const snapshot = await adminDb.collection("ai_tenant_learning_recommendations").where("tenantId", "==", tenantId).limit(100).get();
    const recommendations = snapshot.docs
      .map((doc) => publicRecommendation(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => b.confidence - a.confidence || b.sampleSize - a.sampleSize);
    return NextResponse.json({ ok: true, tenantId, recommendations });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar recomendacoes de aprendizado:", error);
    return NextResponse.json({ error: "Falha ao carregar aprendizados da IA." }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    const user = await authorize(req, tenantId);
    const body = await req.json() as { recommendationId?: string; fingerprint?: string; action?: string; evaluationRunId?: string; digitalTwinRunId?: string };
    const recommendationId = clean(body.recommendationId, 160);
    const fingerprint = clean(body.fingerprint, 160);
    const action = clean(body.action, 40);
    if (!recommendationId || !fingerprint || !["approve", "reject", "archive"].includes(action)) {
      return NextResponse.json({ error: "Recomendacao, fingerprint e acao valida sao obrigatorios." }, { status: 400 });
    }
    const ref = adminDb.collection("ai_tenant_learning_recommendations").doc(recommendationId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Recomendacao nao encontrada." }, { status: 404 });
    const recommendation = snapshot.data() as Record<string, unknown>;
    if (recommendation.tenantId !== tenantId) return NextResponse.json({ error: "Recomendacao fora deste tenant." }, { status: 403 });
    if (recommendation.fingerprint !== fingerprint) return NextResponse.json({ error: "A evidencia mudou. Execute uma nova avaliacao." }, { status: 409 });

    if (action === "approve") {
      const evaluationRunId = clean(body.evaluationRunId, 160);
      const digitalTwinRunId = clean(body.digitalTwinRunId, 160);
      const [run, twin] = await Promise.all([
        evaluationRunId ? adminDb.collection("ai_evaluation_runs").doc(evaluationRunId).get() : Promise.resolve(null),
        digitalTwinRunId ? adminDb.collection("ai_digital_twin_runs").doc(digitalTwinRunId).get() : Promise.resolve(null),
      ]);
      const runData = run?.exists ? run.data() as Record<string, unknown> : null;
      const twinData = twin?.exists ? twin.data() as Record<string, unknown> : null;
      const summary = runData?.summary && typeof runData.summary === "object" ? runData.summary as Record<string, unknown> : {};
      const baseline = runData?.baselineComparison && typeof runData.baselineComparison === "object" ? runData.baselineComparison as Record<string, unknown> : {};
      const stability = runData?.stability && typeof runData.stability === "object" ? runData.stability as Record<string, unknown> : {};
      const results = Array.isArray(runData?.results) ? runData.results as Array<Record<string, unknown>> : [];
      const promotion = evaluateTenantLearningPromotion({
        tenantId,
        fingerprint,
        nowMs: Date.now(),
        recommendation: {
          ...recommendation,
          updatedAtMs: toMillis(recommendation.updatedAt),
          expiresAtMs: toMillis(recommendation.expiresAt),
        },
        evaluation: runData ? {
          runId: evaluationRunId,
          tenantId: runData.tenantId,
          scenarioVersion: runData.scenarioVersion,
          learningRecommendationFingerprint: runData.learningRecommendationFingerprint,
          createdAtMs: toMillis(runData.createdAt),
          summaryGate: summary.gate,
          baselineStatus: baseline.status,
          stabilityStatus: stability.status,
          results,
        } : null,
        digitalTwin: twinData ? {
          tenantId: twinData.tenantId,
          status: twinData.status,
          candidateFingerprint: twinData.candidateFingerprint,
          candidateRunId: twinData.candidateRunId,
          createdAtMs: toMillis(twinData.createdAt),
        } : null,
      });
      if (!promotion.ready) {
        return NextResponse.json({ error: "A recomendacao exige duas baterias oficiais estaveis, sem regressao e vinculadas a esta evidencia.", reasons: promotion.reasons }, { status: 409 });
      }
      await ref.set({
        status: "approved",
        approvedBy: user.uid,
        approvedByName: user.name,
        approvedAt: FieldValue.serverTimestamp(),
        approvedEvaluationRunId: evaluationRunId,
        approvedDigitalTwinRunId: digitalTwinRunId,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      await ref.set({
        status: action === "reject" ? "rejected" : "archived",
        reviewedBy: user.uid,
        reviewedByName: user.name,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return NextResponse.json({ ok: true, tenantId, recommendationId, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "archived" });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao revisar recomendacao de aprendizado:", error);
    return NextResponse.json({ error: "Falha ao revisar aprendizado da IA." }, { status: 500 });
  }
}
