import { after, NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  getTenantConversationCommercialObservationHealth,
  processConversationCommercialObservationJobs,
  reconcileTenantConversationCommercialObservations,
  reprocessConversationCommercialObservationJob,
} from "@/lib/server/crm/conversation-observation-queue";

async function authorize(req: Request, tenantId: string) {
  const user = await requireRequestUser(req);
  const membership = await assertTenantAccess(user.uid, tenantId);
  await assertTenantModule(tenantId, "inbox");
  assertTenantCapability(membership, "respond_inbox");
  return user;
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    await authorize(req, tenantId);
    return NextResponse.json({ ok: true, ...(await getTenantConversationCommercialObservationHealth(tenantId)) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar observacoes." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    const user = await authorize(req, tenantId);
    const body = await req.json() as { action?: string; jobId?: string; limit?: number };
    const result = body.action === "reprocess"
      ? await reprocessConversationCommercialObservationJob({ tenantId, jobId: String(body.jobId || ""), actorId: user.uid })
      : await reconcileTenantConversationCommercialObservations(tenantId, body.limit);
    after(() => processConversationCommercialObservationJobs({ limit: 30 }).catch((error) => console.error("Falha ao drenar observacoes CRM:", error)));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao reconciliar CRM." }, { status: 400 });
  }
}
