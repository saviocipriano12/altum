import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import {
  enqueueOutboundCampaign,
  processOutboundCampaignJobs,
} from "@/lib/server/outbound-campaigns";
import { resolveImmediateOutboundProcessLimit } from "@/lib/server/outbound-scheduling";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { ChatOutboundIdempotencyError, ChatOutboundRequestIdError } from "@/lib/server/chat-outbound-idempotency";

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; campaignId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, campaignId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_automations");

    const raw = await req.text();
    const body = (raw.trim() ? JSON.parse(raw) : {}) as { scheduledAt?: unknown; clientRequestId?: string | null };
    if (!body || typeof body !== "object" || Array.isArray(body) || (body.scheduledAt != null && typeof body.scheduledAt !== "string")) {
      return NextResponse.json({ error: "Dados de disparo invalidos." }, { status: 400 });
    }
    const scheduledAt =
      typeof body.scheduledAt === "string" && body.scheduledAt.trim()
        ? new Date(body.scheduledAt)
        : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "Data de agendamento invalida." }, { status: 400 });
    }

    const result = await enqueueOutboundCampaign({
      tenantId,
      campaignId,
      actor: { id: user.uid, name: user.name },
      scheduledAt,
      clientRequestId: body.clientRequestId,
    });
    if (new Date(result.scheduledAt).getTime() <= Date.now() && !result.replayed) {
      await processOutboundCampaignJobs({
        tenantId,
        runId: result.runId,
        limit: resolveImmediateOutboundProcessLimit(result.jobs),
      });
    }

    return NextResponse.json({ ok: true, tenantId, campaignId, ...result });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ChatOutboundRequestIdError) return NextResponse.json({ error: "Dados de disparo invalidos." }, { status: 400 });
    if (error instanceof ChatOutboundIdempotencyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao disparar campanha outbound:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao disparar campanha outbound." },
      { status: 500 }
    );
  }
}
