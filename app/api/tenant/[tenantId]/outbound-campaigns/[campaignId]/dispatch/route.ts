import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import { dispatchOutboundCampaign } from "@/lib/server/outbound-campaigns";

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; campaignId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, campaignId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_automations");

    const result = await dispatchOutboundCampaign({
      tenantId,
      campaignId,
      actor: { id: user.uid, name: user.name },
    });

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
