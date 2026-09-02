import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { createCommerceOAuthState, getCommerceOAuthEnv } from "@/lib/server/commerce/oauth";

const COOKIE_NAME = "altum_commerce_nuvem_oauth";

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as { tenantId?: unknown; redirectPath?: unknown };
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    if (!tenantId) return NextResponse.json({ error: "Empresa nao informada." }, { status: 400 });
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_channels");

    const env = getCommerceOAuthEnv().nuvemshop;
    if (!env.clientId || !env.clientSecret) {
      return NextResponse.json({ error: "Conexao gerenciada Nuvemshop ainda nao foi configurada pela Altum." }, { status: 503 });
    }
    const state = await createCommerceOAuthState({
      provider: "nuvemshop",
      tenantId,
      userId: user.uid,
      userName: user.name,
      redirectPath: body.redirectPath as string,
    });
    const base = String(process.env.NUVEMSHOP_AUTH_BASE_URL || "https://www.nuvemshop.com.br").replace(/\/$/, "");
    const authorizationUrl = new URL(`${base}/apps/${encodeURIComponent(env.clientId)}/authorize`);
    authorizationUrl.searchParams.set("state", state);
    const response = NextResponse.json({ ok: true, authorizationUrl: authorizationUrl.toString() });
    response.cookies.set(COOKIE_NAME, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/api/integrations/commerce/nuvemshop/callback",
      maxAge: 15 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao iniciar OAuth Nuvemshop:", error);
    return NextResponse.json({ error: "Falha ao iniciar conexao Nuvemshop." }, { status: 500 });
  }
}
