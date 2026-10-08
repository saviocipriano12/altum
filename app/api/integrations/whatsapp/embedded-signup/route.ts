import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { countTenantWhatsAppChannels } from "@/lib/server/tenant-usage";
import { encryptSecret } from "@/app/lib/server/secret-crypto";
import { getMetaEnv } from "@/app/lib/server/integration-oauth";

type Body = {
  action?: "config" | "complete";
  tenantId?: string;
  code?: string;
  phoneNumberId?: string;
  wabaId?: string;
};

function clean(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: { message?: unknown } }).error;
  return clean(error?.message, 500) || fallback;
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const tenantId = clean(body.tenantId, 180);
    if (!tenantId) return NextResponse.json({ error: "tenantId é obrigatório." }, { status: 400 });

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");
    await assertTenantModule(tenantId, "whatsapp");

    const env = getMetaEnv();
    const configId = clean(process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID, 200);
    if (!env.appId || !env.appSecret || !env.verifyToken || !configId) {
      return NextResponse.json(
        { error: "Conexão oficial ainda não está habilitada. Configure META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN e META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID." },
        { status: 503 }
      );
    }

    if (body.action === "config") {
      return NextResponse.json({ ok: true, appId: env.appId, configId, graphVersion: env.graphVersion });
    }

    const code = clean(body.code, 4000);
    const phoneNumberId = clean(body.phoneNumberId, 180);
    const requestedWabaId = clean(body.wabaId, 180);
    if (!code || !phoneNumberId || !requestedWabaId) {
      return NextResponse.json({ error: "A Meta não retornou todos os dados do número. Tente conectar novamente." }, { status: 400 });
    }

    const tokenResponse = await fetch(
      `https://graph.facebook.com/${env.graphVersion}/oauth/access_token?` +
        new URLSearchParams({ client_id: env.appId, client_secret: env.appSecret, code }).toString(),
      { cache: "no-store" }
    );
    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown };
    const accessToken = clean(tokenPayload.access_token, 5000);
    if (!tokenResponse.ok || !accessToken) {
      return NextResponse.json({ error: errorMessage(tokenPayload, "Não foi possível autorizar a conta na Meta.") }, { status: 400 });
    }

    const phoneResponse = await fetch(
      `https://graph.facebook.com/${env.graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,whatsapp_business_account`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    const phonePayload = (await phoneResponse.json().catch(() => ({}))) as {
      id?: unknown;
      display_phone_number?: unknown;
      verified_name?: unknown;
      whatsapp_business_account?: { id?: unknown };
      error?: unknown;
    };
    const confirmedPhoneId = clean(phonePayload.id, 180);
    const confirmedWabaId = clean(phonePayload.whatsapp_business_account?.id, 180);
    if (!phoneResponse.ok || confirmedPhoneId !== phoneNumberId || confirmedWabaId !== requestedWabaId) {
      return NextResponse.json({ error: errorMessage(phonePayload, "Não foi possível validar o número selecionado na Meta.") }, { status: 400 });
    }

    // A URL de webhook do app não basta: cada WABA conectada precisa assinar este
    // app para que mensagens e status daquele cliente cheguem à Altum.
    const subscriptionResponse = await fetch(
      `https://graph.facebook.com/${env.graphVersion}/${encodeURIComponent(confirmedWabaId)}/subscribed_apps`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    const subscriptionPayload = (await subscriptionResponse.json().catch(() => ({}))) as { success?: unknown; error?: unknown };
    if (!subscriptionResponse.ok || subscriptionPayload.success !== true) {
      return NextResponse.json({ error: errorMessage(subscriptionPayload, "A Meta não permitiu ativar os webhooks deste número.") }, { status: 400 });
    }

    const existing = await adminDb
      .collection("tenant_channels")
      .where("tenantId", "==", tenantId)
      .where("type", "==", "whatsapp")
      .where("phoneNumberId", "==", phoneNumberId)
      .limit(1)
      .get();
    const channelRef = existing.empty ? adminDb.collection("tenant_channels").doc() : existing.docs[0].ref;
    if (existing.empty) {
      await assertTenantLimitAvailable({
        tenantId,
        limitId: "whatsappChannels",
        currentUsage: await countTenantWhatsAppChannels(tenantId),
        increment: 1,
      });
    }

    const displayName = clean(phonePayload.verified_name, 120) || "WhatsApp comercial";
    await Promise.all([
      channelRef.set(
        {
          tenantId,
          type: "whatsapp",
          provider: "meta_whatsapp",
          displayName,
          phoneNumber: clean(phonePayload.display_phone_number, 80),
          phoneNumberId,
          wabaId: confirmedWabaId,
          accessToken: encryptSecret(accessToken),
          verifyToken: env.verifyToken,
          appSecret: encryptSecret(env.appSecret),
          status: "active",
          connectionStatus: "ready",
          channelScope: "shared",
          distributionEnabled: true,
          metadata: { oauthManaged: "true", onboarding: "meta_embedded_signup" },
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: user.name,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("tenant_settings").doc(tenantId).set(
        { tenantId, defaultWhatsAppChannelId: channelRef.id, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
      adminDb.collection("audit_logs").add({
        type: "tenant_whatsapp_embedded_signup_connected",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        channelId: channelRef.id,
        phoneNumberId,
        wabaId: confirmedWabaId,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, channelId: channelRef.id, displayName, phoneNumber: clean(phonePayload.display_phone_number, 80) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "tenant_limit_exceeded" ? 409 : 403 });
    console.error("Erro no Embedded Signup do WhatsApp:", error);
    return NextResponse.json({ error: "Falha ao concluir conexão oficial com a Meta." }, { status: 500 });
  }
}
