import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { buildRevenueGraph, type RevenueGraphRow } from "@/lib/server/growth/revenue-graph";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await Promise.all([assertTenantModule(tenantId, "marketing"), assertTenantModule(tenantId, "crm")]);
    assertTenantCapability(membership, "view_metrics");
    const url = new URL(req.url);
    const rangeDays = Math.min(90, Math.max(1, Number(url.searchParams.get("rangeDays") || 30)));
    const to = new Date(); const from = new Date(to.getTime() - rangeDays * 86400_000);
    const names = ["growth_events", "leads", "chats", "appointments", "orcamentos", "financeiro", "campaign_snapshots"] as const;
    const limits = [2000, 1500, 1500, 800, 800, 800, 2500];
    const snaps = await Promise.all(names.map((name, index) => adminDb.collection(name).where("tenantId", "==", tenantId).limit(limits[index] + 1).get()));
    const incompleteSources = names.filter((_, index) => snaps[index].size > limits[index]);
    const rows = snaps.map((snap, index) => snap.docs.slice(0, limits[index]).map((doc): RevenueGraphRow => ({ id: doc.id, ...doc.data() })));
    const teamWide = hasTeamWideCommercialAccess(membership);
    const visibleLeads = teamWide ? rows[1] : rows[1].filter((row) => canAccessAssignedCommercialRecord(membership, user.uid, row));
    const leadIds = new Set(visibleLeads.map((lead) => lead.id));
    const related = (collection: RevenueGraphRow[]) => teamWide ? collection : collection.filter((row) => leadIds.has(String(row.leadId || "")) && canAccessAssignedCommercialRecord(membership, user.uid, row));
    const graph = buildRevenueGraph({
      events: teamWide ? rows[0] : rows[0].filter((row) => leadIds.has(String(row.externalId || ""))),
      leads: visibleLeads, chats: related(rows[2]), appointments: related(rows[3]), proposals: related(rows[4]), finance: related(rows[5]),
      snapshots: teamWide ? rows[6] : [], from: from.toISOString(), to: to.toISOString(),
    });
    return NextResponse.json({ ok: true, tenantId, rangeDays, scope: teamWide ? "team" : "own", ...graph, incomplete: incompleteSources.length > 0, incompleteSources, sampled: Object.fromEntries(names.map((name, index) => [name, rows[index].length])) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Falha ao montar Revenue Graph:", error);
    return NextResponse.json({ error: "Falha ao montar a jornada de receita." }, { status: 500 });
  }
}
