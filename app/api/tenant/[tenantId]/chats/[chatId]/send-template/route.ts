import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { sendTenantChatTemplate } from "@/lib/server/chat-dispatch";

type Body = {
  templateName?: string;
  languageCode?: string;
  bodyParams?: string[];
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

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");

    const body = (await req.json()) as Body;
    const templateName = normalizeTemplateName(body.templateName);
    const languageCode = normalizeLanguageCode(body.languageCode);
    const bodyParams = normalizeBodyParams(body.bodyParams);

    if (!templateName) {
      return NextResponse.json({ error: "Campo obrigatorio: templateName." }, { status: 400 });
    }

    const result = await sendTenantChatTemplate({
      tenantId,
      chatId,
      templateName,
      languageCode,
      bodyParams,
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
