import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  AGENCY_WHATSAPP_ENV_CHANNEL_ID,
  type WhatsAppChannelConfig,
  getWhatsAppChannelForTenant,
  isOfficialWhatsAppProvider,
  listWhatsAppMessageTemplates,
} from "@/app/lib/server/whatsapp-channel";

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function metadataString(data: Record<string, unknown>, key: string) {
  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
  return clean(metadata[key], 500);
}

function channelWabaId(channel: WhatsAppChannelConfig | null) {
  return clean(channel?.wabaId, 180);
}

async function findTenantOfficialChannelWithWaba(tenantId: string, currentChannelId: string) {
  const snap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", tenantId)
    .where("type", "==", "whatsapp")
    .limit(20)
    .get();

  for (const doc of snap.docs) {
    if (doc.id === currentChannelId) continue;
    const data = doc.data() as Record<string, unknown>;
    const status = clean(data.status, 40) || "active";
    const provider = clean(data.provider, 80) || "meta_whatsapp";
    const wabaId =
      clean(data.wabaId, 180) ||
      metadataString(data, "wabaId") ||
      metadataString(data, "whatsappBusinessAccountId") ||
      metadataString(data, "whatsAppBusinessAccountId");
    const phoneNumberId = clean(data.phoneNumberId, 180);
    const accessToken = decryptSecret(data.accessToken);
    if (status !== "active" || provider !== "meta_whatsapp" || !wabaId || !phoneNumberId || !accessToken) continue;
    return {
      id: doc.id,
      tenantId,
      source: "tenant_channel",
      provider,
      displayName: clean(data.displayName, 120) || "WhatsApp",
      phoneNumber: clean(data.phoneNumber, 80),
      phoneNumberId,
      wabaId,
      accessToken,
      verifyToken: clean(data.verifyToken, 500) || undefined,
      appSecret: decryptSecret(data.appSecret) || undefined,
    } satisfies WhatsAppChannelConfig;
  }

  return null;
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantRole(membership, "client_viewer");
    const url = new URL(req.url);
    const channelId = clean(url.searchParams.get("channelId"), 180);
    const usesAgencyOfficialChannel = channelId === AGENCY_WHATSAPP_ENV_CHANNEL_ID;
    let channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: usesAgencyOfficialChannel || !channelId,
      channelId: channelId || null,
    });
    if (channel && !channelWabaId(channel)) {
      channel = await findTenantOfficialChannelWithWaba(tenantId, channel.id) || channel;
    }
    if (!channel) {
      return NextResponse.json(
        {
          error:
            "Numero oficial nao encontrado ou sem credenciais validas. Escolha um numero API oficial em Configuracoes > Canais.",
          templates: [],
        },
        { status: 404 }
      );
    }
    if (!isOfficialWhatsAppProvider(channel.provider)) {
      return NextResponse.json(
        {
          ok: true,
          requiresTemplate: false,
          error: "Templates da Meta estao disponiveis apenas para numeros conectados pela API oficial.",
          templates: [],
        },
        { status: 400 }
      );
    }
    const result = await listWhatsAppMessageTemplates(channel);
    const templates = result.templates
      .sort((a, b) => Number(a.status !== "approved") - Number(b.status !== "approved") || a.name.localeCompare(b.name));
    return NextResponse.json({
      ok: true,
      channel: {
        id: channel.id,
        source: channel.source,
        provider: channel.provider,
        displayName: channel.displayName || "WhatsApp",
        phoneNumber: channel.phoneNumber || "",
        phoneNumberId: channel.phoneNumberId,
      },
      wabaId: result.wabaId,
      templates,
      summary: {
        total: templates.length,
        approved: templates.filter((item) => item.status === "approved").length,
        pending: templates.filter((item) => item.status === "pending").length,
        rejected: templates.filter((item) => item.status === "rejected").length,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar templates do tenant:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao listar templates." }, { status: 500 });
  }
}
