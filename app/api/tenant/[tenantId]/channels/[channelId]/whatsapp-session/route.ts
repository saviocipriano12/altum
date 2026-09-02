import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { getWhatsAppChannelById, isOfficialWhatsAppProvider } from "@/app/lib/server/whatsapp-channel";
import { getWhatsAppMessagingProvider } from "@/lib/server/messaging/registry";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; channelId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, channelId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantCapability(membership, "manage_channels");

    const channel = await getWhatsAppChannelById(channelId);
    if (!channel || channel.tenantId !== tenantId) {
      return NextResponse.json({ error: "Canal WhatsApp nao encontrado." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const action = clean(searchParams.get("action"), 40) || "status";
    if (isOfficialWhatsAppProvider(channel.provider)) {
      return NextResponse.json({
        ok: true,
        provider: channel.provider,
        status: "connected",
        message: "Canal oficial Meta usa webhook e token oficial; QR nao se aplica.",
      });
    }

    const provider = getWhatsAppMessagingProvider(channel);
    if (action === "qr") {
      if (!provider.supportsQr || !provider.getQrCode) {
        return NextResponse.json({
          ok: true,
          provider: channel.provider,
          status: "not_configured",
          message: "Este provedor nao oferece pareamento por QR.",
        });
      }
      if (provider.provision) {
        await provider.provision({ webhookUrl: `${new URL(req.url).origin}/api/webhooks/whatsapp` });
      }
      const result = await provider.getQrCode();
      const { status, qr, payload } = result;
      await adminDb.collection("tenant_channels").doc(channel.id).set(
        {
          connectionStatus: status === "connected" ? "ready" : status === "error" ? "error" : "auth_pending",
          lastSyncAt: FieldValue.serverTimestamp(),
          lastError: status === "error" ? clean(payload.error || payload.message, 500) : "",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true, provider: channel.provider, status, qr, payload });
    }

    if (!provider.getSession) {
      return NextResponse.json({
        ok: true,
        provider: channel.provider,
        status: "not_configured",
        message: "Este provedor nao oferece consulta de sessao.",
      });
    }

    const { status, payload } = await provider.getSession();
    await adminDb.collection("tenant_channels").doc(channel.id).set(
      {
        connectionStatus: status === "connected" ? "ready" : status === "error" ? "error" : "degraded",
        lastSyncAt: FieldValue.serverTimestamp(),
        lastError: status === "error" ? clean(payload.error || payload.message, 500) : "",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, provider: channel.provider, status, payload });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao consultar sessao WhatsApp:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar sessao WhatsApp." },
      { status: 500 }
    );
  }
}
