import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  AGENCY_TENANT_ID,
  getWhatsAppChannelForTenant,
  listWhatsAppMessageTemplates,
} from "@/app/lib/server/whatsapp-channel";

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function summarize(templates: Array<{ status: string; category: string }>) {
  return {
    total: templates.length,
    approved: templates.filter((item) => item.status === "approved").length,
    pending: templates.filter((item) => item.status === "pending").length,
    rejected: templates.filter((item) => item.status === "rejected").length,
    marketing: templates.filter((item) => item.category === "MARKETING").length,
    utility: templates.filter((item) => item.category === "UTILITY").length,
  };
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_agent"] });

    const url = new URL(req.url);
    const tenantId = clean(url.searchParams.get("tenantId"), 140) || AGENCY_TENANT_ID;
    const channelId = clean(url.searchParams.get("channelId"), 140) || null;
    const phoneNumberId = clean(url.searchParams.get("phoneNumberId"), 140) || null;

    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: tenantId === AGENCY_TENANT_ID,
      channelId,
      phoneNumberId,
    });

    if (!channel) {
      return NextResponse.json(
        {
          ok: false,
          tenantId,
          templates: [],
          summary: summarize([]),
          error: "Nenhum canal WhatsApp oficial encontrado para este tenant.",
        },
        { status: 404 }
      );
    }

    const result = await listWhatsAppMessageTemplates(channel);
    const templates = result.templates.sort((a, b) => {
      const statusOrder = Number(a.status !== "approved") - Number(b.status !== "approved");
      if (statusOrder !== 0) return statusOrder;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      ok: true,
      tenantId,
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
      summary: summarize(templates),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao listar templates WhatsApp no admin:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao listar templates WhatsApp." },
      { status: 500 }
    );
  }
}
