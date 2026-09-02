import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = {
  leadId?: string;
  reason?: "lead_created" | "lead_qualified" | "meeting_scheduled" | "meeting_completed" | "sale_won";
  appointmentId?: string | null;
  force?: boolean;
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    if (
      !hasTenantCapability(membership, "manage_channels") &&
      !hasTenantCapability(membership, "view_metrics") &&
      !hasTenantCapability(membership, "edit_leads")
    ) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para disparar conversoes.");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const leadId = clean(body.leadId, 180);
    const reason = clean(body.reason, 80) as Body["reason"];

    if (!leadId || !reason) {
      return NextResponse.json({ error: "Campos obrigatorios: leadId e reason." }, { status: 400 });
    }

    const result = await dispatchLeadConversionEvents({
      tenantId,
      leadId,
      reason,
      appointmentId: clean(body.appointmentId, 180) || null,
      force: Boolean(body.force),
    });

    return NextResponse.json({
      tenantId,
      leadId,
      reason,
      ...result,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao disparar conversoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao disparar conversoes." }, { status: 500 });
  }
}
