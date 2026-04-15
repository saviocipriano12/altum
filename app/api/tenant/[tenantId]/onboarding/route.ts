import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantReadinessSnapshot } from "@/lib/server/tenant-readiness";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  stepId?: string;
  done?: boolean;
};

const MANUAL_STEP_IDS = new Set(["team_enablement", "incident_runbook_ack", "handoff_drill"]);

function clean(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);
    const snapshot = await getTenantReadinessSnapshot(tenantId);

    return NextResponse.json({
      ok: true,
      tenantId,
      onboarding: snapshot.onboarding,
      summary: snapshot.summary,
      activation: snapshot.activation,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar onboarding do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar onboarding." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const body = (await req.json().catch(() => ({}))) as Body;
    const stepId = clean(body.stepId, 80).toLowerCase();
    const done = body.done === true;

    if (!stepId || !MANUAL_STEP_IDS.has(stepId)) {
      return NextResponse.json(
        { error: "stepId invalido para onboarding manual.", allowed: Array.from(MANUAL_STEP_IDS) },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {
      [`onboarding.manualAcks.${stepId}.done`]: done,
      [`onboarding.manualAcks.${stepId}.doneBy`]: done ? user.uid : null,
      [`onboarding.manualAcks.${stepId}.doneByName`]: done ? user.name : "",
      [`onboarding.manualAcks.${stepId}.doneAt`]: done ? FieldValue.serverTimestamp() : null,
      [`onboarding.updatedAt`]: FieldValue.serverTimestamp(),
      [`onboarding.updatedBy`]: user.uid,
      [`onboarding.updatedByName`]: user.name,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };

    await adminDb.collection("tenant_settings").doc(tenantId).set(patch, { merge: true });

    const snapshot = await getTenantReadinessSnapshot(tenantId);
    return NextResponse.json({
      ok: true,
      tenantId,
      stepId,
      done,
      onboarding: snapshot.onboarding,
      summary: snapshot.summary,
      activation: snapshot.activation,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar onboarding manual:", error);
    return NextResponse.json({ error: "Falha ao atualizar onboarding." }, { status: 500 });
  }
}
