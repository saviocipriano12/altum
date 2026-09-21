import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { strategySchema, compareStrategyObservations } from "@/lib/admin-strategies";
import { captureStrategyObservation } from "@/lib/server/admin/strategies";
const errorResponse = (error: unknown) => { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error("Falha nas estratégias:", error); return NextResponse.json({ error: "Falha ao consultar ou medir estratégias." }, { status: 500 }); };
export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_admin"] });
    const tenantId = new URL(req.url).searchParams.get("tenantId");
    const query = tenantId ? adminDb.collection("admin_growth_strategies").where("tenantId", "==", tenantId) : adminDb.collection("admin_growth_strategies");
    const snap = await query.orderBy("__name__").limit(501).get();
    const items = snap.docs.slice(0, 500).map(doc => { const row = doc.data(); return { id: doc.id, tenantId: row.tenantId, name: row.name, hypothesis: row.hypothesis, platform: row.platform, channelId: row.channelId, campaignId: row.campaignId, metric: row.metric, status: row.status, baseline: row.baseline, observed: row.observed || null, comparison: row.comparison || null, notes: row.notes || "", createdAt: row.createdAt?.toDate?.().toISOString?.() || null }; });
    return NextResponse.json({ items, partial: snap.size > 500 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] });
    const parsed = strategySchema.safeParse(await req.json());
    if (!parsed.success) throw new RouteAuthError(400, "invalid_strategy", "Informe hipótese, campanha, empresa e indicador.");
    const baseline = await captureStrategyObservation(parsed.data);
    const batch = adminDb.batch(); const ref = adminDb.collection("admin_growth_strategies").doc();
    batch.set(ref, { ...parsed.data, baseline, status: "running", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_strategy_started", actorId: actor.uid, tenantId: parsed.data.tenantId, strategyId: ref.id, createdAt: FieldValue.serverTimestamp() });
    await batch.commit(); return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] });
    const body = await req.json();
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(body.id)) || typeof body.notes !== "string" || body.notes.trim().length < 8) throw new RouteAuthError(400, "invalid_measurement", "Informe a estratégia e uma observação sobre o resultado.");
    const ref = adminDb.collection("admin_growth_strategies").doc(body.id); const snap = await ref.get();
    if (!snap.exists) throw new RouteAuthError(404, "strategy_missing", "Estratégia não encontrada.");
    const data = snap.data()!; const parsed = strategySchema.parse({ tenantId: data.tenantId, name: data.name, hypothesis: data.hypothesis, platform: data.platform, channelId: data.channelId, campaignId: data.campaignId, metric: data.metric });
    const observed = await captureStrategyObservation(parsed);
    const comparison = compareStrategyObservations(data.metric, data.baseline, observed);
    await adminDb.runTransaction(async transaction => { const current = await transaction.get(ref); if (current.data()?.status !== "running") throw new RouteAuthError(409, "strategy_closed", "Estratégia já concluída."); transaction.set(ref, { observed, comparison, notes: body.notes.trim().slice(0, 1200), status: "concluded", concludedBy: actor.uid, concludedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.set(adminDb.collection("audit_logs").doc(), { type: "admin_strategy_concluded", actorId: actor.uid, tenantId: parsed.tenantId, strategyId: ref.id, outcome: comparison.outcome, createdAt: FieldValue.serverTimestamp() }); });
    return NextResponse.json({ ok: true, comparison });
  } catch (error) { return errorResponse(error); }
}
