import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  getTenantOmnichannelIdentityHealth,
  reconcileTenantOmnichannelIdentities,
} from "@/lib/server/omnichannel-identity-reconciliation";

async function authorize(req: Request, tenantId: string) {
  const user = await requireRequestUser(req);
  const membership = await assertTenantAccess(user.uid, tenantId);
  await assertTenantModule(tenantId, "inbox");
  assertTenantCapability(membership, "respond_inbox");
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    await authorize(req, tenantId);
    return NextResponse.json({ ok: true, ...(await getTenantOmnichannelIdentityHealth(tenantId)) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar identidades." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    await authorize(req, tenantId);
    return NextResponse.json({ ok: true, ...(await reconcileTenantOmnichannelIdentities(tenantId)) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao reconciliar identidades." }, { status: 400 });
  }
}
