import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type AiLogItem = {
  id: string;
  createdAt?: unknown;
  decision?: string;
  confidence?: number | null;
  [key: string]: unknown;
};

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

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb.collection("ai_logs").where("tenantId", "==", tenantId).limit(150).get();
    const items: AiLogItem[] = snap.docs
      .map((doc): AiLogItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .slice(0, 40);

    const summary = {
      total: items.length,
      responded: items.filter((item) => item.decision === "respond").length,
      askMore: items.filter((item) => item.decision === "ask_more").length,
      handoff: items.filter((item) => item.decision === "handoff").length,
      skipped: items.filter((item) => item.decision === "skip").length,
      lowConfidence: items.filter((item) => typeof item.confidence === "number" && item.confidence < 0.55).length,
      recommendationReady: items.filter((item) =>
        ["recommend", "move_to_next_step"].includes(String(item.responseGoal || ""))
      ).length,
      objectionHandling: items.filter((item) => String(item.stateAfter || "") === "objection_handling").length,
      avgQualityScore: items.length
        ? Number(
            (
              items.reduce((sum, item) => sum + (typeof item.qualityScore === "number" ? item.qualityScore : 0), 0) /
              Math.max(1, items.filter((item) => typeof item.qualityScore === "number").length || 1)
            ).toFixed(3)
          )
        : 0,
    };

    return NextResponse.json({ ok: true, tenantId, summary, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar logs de IA:", error);
    return NextResponse.json({ error: "Falha ao carregar logs de IA." }, { status: 500 });
  }
}
