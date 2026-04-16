import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import {
  createIntegrationOAuthState,
  getAppBaseUrl,
  getGoogleAdsEnv,
  isGooglePlatformConfigured,
} from "@/app/lib/server/integration-oauth";

type Body = {
  tenantId?: string;
  redirectPath?: string;
};

export async function POST(req: Request) {
  try {
    if (!isGooglePlatformConfigured()) {
      return NextResponse.json(
        { error: "Google Ads da plataforma nao configurado. Defina CLIENT_ID/CLIENT_SECRET/DEVELOPER_TOKEN." },
        { status: 503 }
      );
    }

    const user = await requireRequestUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const tenantId = String(body.tenantId || "").trim();
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId obrigatorio." }, { status: 400 });
    }

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const state = await createIntegrationOAuthState({
      provider: "google",
      tenantId,
      userId: user.uid,
      channelType: "google_ads",
      redirectPath: body.redirectPath,
    });

    const env = getGoogleAdsEnv();
    const baseUrl = getAppBaseUrl(req);
    if (!baseUrl) {
      return NextResponse.json({ error: "Base URL da aplicacao nao configurada." }, { status: 500 });
    }

    const redirectUri = `${baseUrl}/api/integrations/google/callback`;
    const scopes = [
      "https://www.googleapis.com/auth/adwords",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" ");

    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: env.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        access_type: "offline",
        include_granted_scopes: "true",
        prompt: "consent",
        scope: scopes,
        state: state.state,
      }).toString();

    return NextResponse.json({
      ok: true,
      provider: "google",
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
    console.error("Erro ao iniciar OAuth do Google:", error);
    return NextResponse.json({ error: "Falha ao iniciar conexao Google." }, { status: 500 });
  }
}
