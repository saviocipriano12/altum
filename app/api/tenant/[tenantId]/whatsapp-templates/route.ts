import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import {
  getWhatsAppChannelForTenant,
  isOfficialWhatsAppProvider,
  listWhatsAppMessageTemplates,
} from "@/app/lib/server/whatsapp-channel";

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    const url = new URL(req.url);
    const channelId = clean(url.searchParams.get("channelId"), 180);
    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: false,
      channelId: channelId || null,
    });
    if (!channel) {
      return NextResponse.json({ error: "Numero oficial nao encontrado ou sem credenciais validas.", templates: [] }, { status: 404 });
    }
    if (!isOfficialWhatsAppProvider(channel.provider)) {
      return NextResponse.json(
        { error: "Templates da Meta estao disponiveis apenas para numeros conectados pela API oficial.", templates: [] },
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
        displayName: channel.displayName || "WhatsApp",
        phoneNumber: channel.phoneNumber || "",
      },
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
