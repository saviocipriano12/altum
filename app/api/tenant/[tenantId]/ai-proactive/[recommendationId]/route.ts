import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess } from "@/lib/server/commercial-access";
import { reviewAiProactiveRecommendation } from "@/lib/server/ai/proactive-store";

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; recommendationId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, recommendationId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "edit_leads");
    const body = await req.json() as { action?: string; outcome?: string };
    const action = clean(body.action, 30);
    const outcome = clean(body.outcome, 30);
    if (!["accept", "dismiss", "complete"].includes(action)) return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    if (action === "complete" && !["positive", "negative", "neutral"].includes(outcome)) return NextResponse.json({ error: "Resultado obrigatorio." }, { status: 400 });
    const ref = adminDb.collection("ai_proactive_recommendations").doc(clean(recommendationId));
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Recomendacao nao encontrada neste tenant." }, { status: 404 });
    const leadId = clean(snapshot.data()?.leadId);
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    try {
      const reviewed = await reviewAiProactiveRecommendation({
        tenantId,
        recommendationId,
        action: action as "accept" | "dismiss" | "complete",
        outcome: action === "complete" ? outcome as "positive" | "negative" | "neutral" : null,
        reviewedBy: user.uid,
        reviewedByName: user.name,
      });
      return NextResponse.json({ ok: true, tenantId, recommendationId, status: reviewed.status, outcome: reviewed.outcome });
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_proactive_transition") return NextResponse.json({ error: "Transicao de recomendacao invalida." }, { status: 409 });
      throw error;
    }
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao revisar inteligencia proativa:", error);
    return NextResponse.json({ error: "Falha ao revisar inteligencia proativa." }, { status: 500 });
  }
}
