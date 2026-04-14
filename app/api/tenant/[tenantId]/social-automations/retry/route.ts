import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { retrySocialAutomationLog } from "@/lib/server/social/service";

function cleanText(value: unknown, max = 240) {
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
    const canManage =
      hasTenantCapability(membership, "manage_channels") || hasTenantCapability(membership, "manage_automations");

    if (!canManage) {
      return NextResponse.json({ error: "Perfil sem capacidade para reprocessar eventos sociais." }, { status: 403 });
    }

    const body = (await req.json()) as { logId?: string };
    const logId = cleanText(body?.logId, 240);
    if (!logId) {
      return NextResponse.json({ error: "logId e obrigatorio." }, { status: 400 });
    }

    const result = await retrySocialAutomationLog({
      tenantId,
      logId,
      actorId: user.uid,
      actorName: user.name || "Operador",
    });

    return NextResponse.json({ ok: true, tenantId, logId, result });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    const message = error instanceof Error ? error.message : "";
    if (
      message === "social_log_not_found" ||
      message === "social_log_tenant_mismatch" ||
      message === "social_log_invalid_channel" ||
      message === "social_log_invalid_event_type" ||
      message === "social_log_missing_actor_id" ||
      message === "social_log_missing_comment_id"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === "social_channel_not_found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error("Erro ao reprocessar log social:", error);
    return NextResponse.json({ error: "Falha ao reprocessar evento social." }, { status: 500 });
  }
}

