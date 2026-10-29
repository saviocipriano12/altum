import { after, NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { queueTenantChatTemplate, processChatOutboundJobs } from "@/lib/server/chat-outbound";
import { normalizeOutboundTemplate } from "@/lib/server/chat-outbound-template";
import { ChatOutboundPayloadError } from "@/lib/server/chat-outbound-payload";
import { normalizeChatOutboundRequestId, ChatOutboundRequestIdError, ChatOutboundIdempotencyError } from "@/lib/server/chat-outbound-idempotency";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";

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

    let body: unknown;
    try { body = await req.json(); } catch { throw new ChatOutboundPayloadError("Dados de template invalidos."); }
    const template = normalizeOutboundTemplate(body);
    const clientRequestId = normalizeChatOutboundRequestId((body as Record<string, unknown>).clientRequestId);
    const result = await queueTenantChatTemplate({
      tenantId,
      chatId,
      ...template,
      clientRequestId,
      actor: { id: user.uid, name: user.name },
    });
    after(() => processChatOutboundJobs({ jobId: result.jobId, limit: 1 }).catch(() => { console.error("Falha ao processar template pendente."); }));

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
      ...result,
      channel: "whatsapp",
      templateName: template.templateName,
      languageCode: template.languageCode,
      headerMedia: template.headerMedia,
    });
  } catch (error) {
    if (error instanceof ChatOutboundPayloadError || error instanceof ChatOutboundRequestIdError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    if (error instanceof ChatOutboundIdempotencyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
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
