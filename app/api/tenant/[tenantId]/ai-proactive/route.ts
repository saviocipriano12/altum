import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess, canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import { evaluateAndPersistLeadProactivity } from "@/lib/server/ai/proactive-processor";

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function millis(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

async function authorize(req: Request, tenantId: string) {
  const user = await requireRequestUser(req);
  const membership = await assertTenantAccess(user.uid, tenantId);
  await assertTenantModule(tenantId, "ai");
  assertTenantCapability(membership, "edit_leads");
  return { user, membership };
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    const { user, membership } = await authorize(req, tenantId);
    const snap = await adminDb.collection("ai_proactive_recommendations").where("tenantId", "==", tenantId).limit(100).get();
    const now = Date.now();
    const rawItems = snap.docs
      .map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((item) => millis(item.expiresAt) > now);
    const leadIds = [...new Set(rawItems.map((item) => clean(item.leadId)).filter(Boolean))];
    const leadEntries = await Promise.all(leadIds.map(async (leadId) => {
      const lead = await adminDb.collection("leads").doc(leadId).get();
      return [leadId, lead.exists ? lead.data() as Record<string, unknown> : null] as const;
    }));
    const leads = new Map(leadEntries);
    const items = rawItems
      .filter((item) => {
        const lead = leads.get(clean(item.leadId));
        return Boolean(lead && canAccessAssignedCommercialRecord(membership, user.uid, lead));
      })
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const actionable = items.filter((item) => ["suggested", "accepted"].includes(clean(item.status, 30)));
    return NextResponse.json({
      ok: true,
      tenantId,
      items,
      summary: {
        total: items.length,
        actionable: actionable.length,
        suppressed: items.filter((item) => clean(item.status, 30) === "suppressed").length,
        urgent: actionable.filter((item) => clean(item.priority, 20) === "urgent").length,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar inteligencia proativa:", error);
    return NextResponse.json({ error: "Falha ao carregar inteligencia proativa." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    const { user, membership } = await authorize(req, tenantId);
    const body = await req.json() as { leadId?: string; quietHours?: boolean };
    const leadId = clean(body.leadId);
    if (!leadId) return NextResponse.json({ error: "Lead obrigatorio." }, { status: 400 });
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    const result = await evaluateAndPersistLeadProactivity({ tenantId, leadId, createdBy: user.uid, quietHours: body.quietHours === true });
    if (result.reason === "lead_scope_invalid") return NextResponse.json({ error: "Lead nao encontrado neste tenant." }, { status: 404 });
    return NextResponse.json({ ok: true, tenantId, leadId, recommendation: result.recommendation ? { persistenceStatus: result.status, ...result.recommendation } : null });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao gerar inteligencia proativa:", error);
    return NextResponse.json({ error: "Falha ao gerar inteligencia proativa." }, { status: 500 });
  }
}
