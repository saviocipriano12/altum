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

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; campaignId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, campaignId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_automations");

    const body = (await req.json().catch(() => ({}))) as { scheduledAt?: unknown };
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
    });
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      await processOutboundCampaignJobs({ tenantId, limit: 1 });
    }

    return NextResponse.json({ ok: true, tenantId, campaignId, ...result });
  } catch (error) {
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
