import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { adportGoogleCredentials, hasAdportGoogleCredentials } from "@/lib/server/growth/adport-connectors";
import { discoverMetaPixels, discoverGoogleConversions, pixelDocumentId } from "@/lib/server/growth/pixel-inventory";
export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] }); const body = await req.json();
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(body.tenantId)) || !/^[A-Za-z0-9_-]{1,180}$/.test(String(body.channelId))) throw new RouteAuthError(400, "invalid_account", "Selecione uma conta conectada.");
    await assertTenantModule(body.tenantId, "marketing");
    const snap = await adminDb.collection("tenant_channels").doc(body.channelId).get(); const channel = snap.data();
    if (!channel || channel.tenantId !== body.tenantId || !["meta_ads", "google_ads"].includes(channel.type) || channel.status !== "active" || !channel.externalAccountId) throw new RouteAuthError(409, "account_changed", "Conta sem conexão ativa ou vínculo válido.");
    const refreshToken = decryptSecret(channel.refreshToken); const accessToken = decryptSecret(channel.accessToken);
    if (channel.type === "meta_ads" && !accessToken || channel.type === "google_ads" && !hasAdportGoogleCredentials({ refreshToken })) throw new RouteAuthError(409, "account_credentials_missing", "A conta precisa de credenciais válidas.");
    const assets = channel.type === "meta_ads" ? await discoverMetaPixels(channel.externalAccountId, accessToken) : await discoverGoogleConversions(channel.externalAccountId, adportGoogleCredentials({ refreshToken, loginCustomerId: channel.metadata?.loginCustomerId || channel.pageId }));
    if (assets.length > 200) throw new RouteAuthError(409, "inventory_limit", "A conta excede duzentos ativos. Refine o inventário antes de importar.");
    const batch = adminDb.batch();
    for (const asset of assets) batch.set(adminDb.collection("admin_growth_pixels").doc(pixelDocumentId(body.tenantId, asset.provider, asset.externalId)), { ...asset, tenantId: body.tenantId, channelId: snap.id, accountId: channel.externalAccountId, verificationStatus: "provider_access_verified", verifiedAt: FieldValue.serverTimestamp(), verifiedBy: actor.uid }, { merge: true });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_pixels_discovered", actorId: actor.uid, tenantId: body.tenantId, channelId: snap.id, count: assets.length, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
    return Response.json({ ok: true, count: assets.length, partial: assets.length >= 200, eventDeliveryVerified: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha na descoberta de pixels:", error); return Response.json({ error: "Não foi possível consultar pixels ou conversões. Confira a autorização da conta." }, { status: 502 }); }
}
