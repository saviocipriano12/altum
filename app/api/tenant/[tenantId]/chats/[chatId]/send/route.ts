import { after, NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { ChatOutboundIdempotencyError, ChatOutboundRequestIdError } from "@/lib/server/chat-outbound-idempotency";
import { processChatOutboundJobs, queueTenantChatText } from "@/lib/server/chat-outbound";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { ChatOutboundPayloadError, normalizeOutboundText, normalizeOutboundReplyId } from "@/lib/server/chat-outbound-payload";
import { normalizeChatOutboundRequestId } from "@/lib/server/chat-outbound-idempotency";

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    assertTenantCapability(membership, "respond_inbox");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });

    let payload: unknown;
    try { payload = await req.json(); }
    catch { throw new ChatOutboundPayloadError("Dados de envio invalidos."); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ChatOutboundPayloadError("Dados de envio invalidos.");
    const body = payload as Record<string, unknown>;
    const text = normalizeOutboundText(body.text);
    const replyToId = normalizeOutboundReplyId(body.replyToId);
    const clientRequestId = normalizeChatOutboundRequestId(body.clientRequestId);

    const result = await queueTenantChatText({
      tenantId,
      chatId,
      text,
      replyToId,
      actor: { id: user.uid, name: user.name },
      clientRequestId,
    });
    after(() => processChatOutboundJobs({ jobId: result.jobId, limit: 1 }).catch((jobError) => {
      console.error("Falha no envio assincrono de texto:", jobError);
    }));

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
      ...result,
    });
  } catch (error) {
    if (error instanceof ChatOutboundPayloadError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof ChatOutboundRequestIdError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    if (error instanceof ChatOutboundIdempotencyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Erro ao enviar mensagem manual do tenant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar mensagem." },
      { status: 500 }
    );
  }
}
