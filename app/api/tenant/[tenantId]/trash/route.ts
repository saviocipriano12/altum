import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import {
  deleteTenantTrashPermanently,
  listTenantTrash,
  restoreTenantTrash,
} from "@/lib/server/tenant-data-deletion";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    return NextResponse.json({ ok: true, items: await listTenantTrash(tenantId) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "Falha ao carregar lixeira." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    const body = (await req.json()) as { trashId?: unknown };
    const trashId = typeof body.trashId === "string" ? body.trashId.trim() : "";
    if (!trashId) return NextResponse.json({ error: "trashId obrigatorio." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await restoreTenantTrash({ tenantId, trashId })) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao restaurar item." }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    const body = (await req.json()) as { trashId?: unknown };
    const trashId = typeof body.trashId === "string" ? body.trashId.trim() : "";
    if (!trashId) return NextResponse.json({ error: "trashId obrigatorio." }, { status: 400 });
    return NextResponse.json({
      ok: true,
      ...(await deleteTenantTrashPermanently({ tenantId, trashId })),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao excluir item." }, { status: 500 });
  }
}
