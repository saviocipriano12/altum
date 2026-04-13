import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantRole,
  hasTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import {
  getTenantSocialAutomationSummary,
  saveTenantSocialAutomationConfig,
} from "@/lib/server/social/service";

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const payload = await getTenantSocialAutomationSummary(tenantId);
    return NextResponse.json({ ok: true, tenantId, ...payload });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar automacoes sociais:", error);
    return NextResponse.json({ error: "Falha ao carregar automacoes sociais." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    const canManage = hasTenantCapability(membership, "manage_channels") || hasTenantCapability(membership, "manage_automations");

    if (!canManage) {
      return NextResponse.json({ error: "Perfil sem capacidade para gerir automacoes sociais." }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const config = await saveTenantSocialAutomationConfig({
      tenantId,
      actorId: user.uid,
      actorName: user.name,
      body,
    });

    return NextResponse.json({ ok: true, tenantId, config });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao salvar automacoes sociais:", error);
    return NextResponse.json({ error: "Falha ao salvar automacoes sociais." }, { status: 500 });
  }
}
