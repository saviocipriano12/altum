import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { callWhatsAppGateway, getWhatsAppChannelById } from "@/app/lib/server/whatsapp-channel";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeSessionStatus(value: unknown) {
  const status = clean(value, 80).toLowerCase();
  if (["connected", "ready", "open", "online"].includes(status)) return "connected";
  if (["qr", "qr_required", "pairing", "pending_qr"].includes(status)) return "qr_required";
  if (["connecting", "starting", "syncing"].includes(status)) return "connecting";
  if (["disconnected", "closed", "offline"].includes(status)) return "disconnected";
  if (["error", "failed"].includes(status)) return "error";
  return status || "unknown";
}

function readPayloadStatus(payload: Record<string, unknown>) {
  return normalizeSessionStatus(
    payload.status ||
      payload.state ||
      payload.connectionState ||
      (payload.session && typeof payload.session === "object"
        ? (payload.session as Record<string, unknown>).status
        : "")
  );
}

function readQrValue(payload: Record<string, unknown>) {
  return (
    clean(payload.qr, 4000) ||
    clean(payload.qrCode, 4000) ||
    clean(payload.code, 4000) ||
    clean(payload.base64, 6000) ||
    clean(payload.qrImageUrl, 1200)
  );
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; channelId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, channelId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const channel = await getWhatsAppChannelById(channelId);
    if (!channel || channel.tenantId !== tenantId) {
      return NextResponse.json({ error: "Canal WhatsApp nao encontrado." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const action = clean(searchParams.get("action"), 40) || "status";
    if (channel.provider === "meta_whatsapp") {
      return NextResponse.json({
        ok: true,
        provider: channel.provider,
        status: "connected",
        message: "Canal oficial Meta usa webhook e token oficial; QR nao se aplica.",
      });
    }

    if (action === "qr") {
      if (!channel.qrCodeEndpoint) {
        return NextResponse.json({
          ok: true,
          provider: channel.provider,
          status: "not_configured",
          message: "Configure o endpoint de QR do gateway para parear esta sessao.",
        });
      }
      const payload = await callWhatsAppGateway({
        channel,
        endpoint: channel.qrCodeEndpoint,
        payload: { action: "qr" },
      });
      const status = readPayloadStatus(payload);
      const qr = readQrValue(payload);
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

    if (!channel.sessionStatusEndpoint) {
      return NextResponse.json({
        ok: true,
        provider: channel.provider,
        status: "not_configured",
        message: "Configure o endpoint de status do gateway para monitorar esta sessao.",
      });
    }

    const payload = await callWhatsAppGateway({
      channel,
      endpoint: channel.sessionStatusEndpoint,
      payload: { action: "status" },
    });
    const status = readPayloadStatus(payload);
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
