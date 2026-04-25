import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import {
  createIntegrationOAuthState,
  getAppBaseUrl,
  getMetaEnv,
  getMetaOAuthScopes,
  isMetaPlatformConfigured,
  type MetaOAuthChannelType,
} from "@/app/lib/server/integration-oauth";

type Body = {
  tenantId?: string;
  channelType?: string;
  redirectPath?: string;
};

function normalizeChannelType(value: unknown): MetaOAuthChannelType | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "instagram" || normalized === "messenger" || normalized === "meta_ads") {
    return normalized;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    if (!isMetaPlatformConfigured()) {
      return NextResponse.json(
        { error: "Meta da plataforma nao configurado. Defina META_APP_ID, META_APP_SECRET e META_VERIFY_TOKEN." },
        { status: 503 }
      );
    }

    const user = await requireRequestUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const tenantId = String(body.tenantId || "").trim();
    const channelType = normalizeChannelType(body.channelType);

    if (!tenantId || !channelType) {
      return NextResponse.json({ error: "tenantId e channelType sao obrigatorios." }, { status: 400 });
    }
    const metaChannelType: MetaOAuthChannelType = channelType;

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const state = await createIntegrationOAuthState({
      provider: "meta",
      tenantId,
      userId: user.uid,
      channelType: metaChannelType,
      redirectPath: body.redirectPath,
    });

    const env = getMetaEnv();
    const baseUrl = getAppBaseUrl(req);
    if (!baseUrl) {
      return NextResponse.json({ error: "Base URL da aplicacao nao configurada." }, { status: 500 });
    }

    const redirectUri = `${baseUrl}/api/integrations/meta/callback`;
    const requestedScopes = getMetaOAuthScopes(metaChannelType);
    const scopes = requestedScopes.join(",");

    const authUrl =
      `https://www.facebook.com/${env.graphVersion}/dialog/oauth` +
      `?client_id=${encodeURIComponent(env.appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state.state)}` +
      `&scope=${encodeURIComponent(scopes)}`;

    return NextResponse.json({
      ok: true,
      provider: "meta",
      channelType: metaChannelType,
      scopes: requestedScopes,
      authUrl,
      stateId: state.stateId,
      expiresAt: state.expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao iniciar OAuth da Meta:", error);
    return NextResponse.json({ error: "Falha ao iniciar conexao Meta." }, { status: 500 });
  }
}
