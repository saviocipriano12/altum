import { after, NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { getWhatsAppChannelForTenant } from "@/app/lib/server/whatsapp-channel";
import { startTenantWhatsAppConversation, type WhatsAppStartBody } from "@/lib/server/whatsapp-conversation-start";
import { ChatOutboundIdempotencyError } from "@/lib/server/chat-outbound-idempotency";
import { processChatOutboundJobs } from "@/lib/server/chat-outbound";

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantCapability(membership, "respond_inbox");
    const body = await req.json() as WhatsAppStartBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new RouteAuthError(400, "invalid_payload", "Dados de envio invalidos.");
    const existing: Record<string, unknown> | null = body.chatId ? await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId: body.chatId }) : null;
    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: false, channelId: body.channelId || String(existing?.channelId || "") || null,
    });
    if (!channel) return NextResponse.json({ error: "Canal WhatsApp ativo nao configurado para este tenant." }, { status: 400 });
    const result = await startTenantWhatsAppConversation({ tenantId, user, membership, channel, body });
    if ("jobId" in result) {
      after(() => processChatOutboundJobs({ jobId: result.jobId, limit: 1 }).catch((error) => {
        console.error("Falha no processamento do inicio de conversa:", error);
      }));
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON de envio invalido.", code: "invalid_payload" }, { status: 400 });
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof ChatOutboundIdempotencyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    console.error("Erro ao preparar conversa WhatsApp do tenant:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao iniciar conversa." }, { status: 500 });
  }
}
