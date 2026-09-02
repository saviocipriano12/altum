import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { sendTenantChatTemplate } from "@/lib/server/chat-dispatch";
import type { WhatsAppTemplateHeaderMedia } from "@/app/lib/server/whatsapp-channel";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";

type Body = {
  templateName?: string;
  languageCode?: string;
  bodyParams?: string[];
  headerMedia?: {
    type?: string;
    link?: string;
    id?: string;
    filename?: string;
  } | null;
};

function normalizeTemplateName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase()
    .slice(0, 512);
}

function normalizeLanguageCode(value: unknown) {
  return String(value || "pt_BR").trim().slice(0, 24) || "pt_BR";
}

function normalizeBodyParams(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeHeaderMedia(value: Body["headerMedia"]): WhatsAppTemplateHeaderMedia | null {
  if (!value || typeof value !== "object") return null;
  const type = String(value.type || "").trim().toLowerCase();
  if (type !== "image" && type !== "video" && type !== "document") return null;
  const link = String(value.link || "").trim();
  const id = String(value.id || "").trim();
  if (!link && !id) return null;
  return {
    type,
    ...(link ? { link } : {}),
    ...(id ? { id } : {}),
    ...(value.filename ? { filename: String(value.filename).trim().slice(0, 180) } : {}),
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantCapability(membership, "respond_inbox");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });

    const body = (await req.json()) as Body;
    const templateName = normalizeTemplateName(body.templateName);
    const languageCode = normalizeLanguageCode(body.languageCode);
    const bodyParams = normalizeBodyParams(body.bodyParams);
    const headerMedia = normalizeHeaderMedia(body.headerMedia);

    if (!templateName) {
      return NextResponse.json({ error: "Campo obrigatorio: templateName." }, { status: 400 });
    }

    const result = await sendTenantChatTemplate({
      tenantId,
      chatId,
      templateName,
      languageCode,
      bodyParams,
      headerMedia,
      actor: { id: user.uid, name: user.name },
      pauseAi: true,
      pauseMinutes: 30,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
      channel: result.channel,
      phoneNumberId: result.phoneNumberId,
      metaMessageId: result.metaMessageId,
      templateName: result.templateName,
      languageCode: result.languageCode,
      headerMedia: result.headerMedia || null,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao enviar template manual do tenant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar template." },
      { status: 500 }
    );
  }
}
