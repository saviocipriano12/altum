import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { sendTenantChatText } from "@/lib/server/chat-dispatch";

type Body = {
  text?: string;
  replyToId?: string | null;
};

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
    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    const result = await sendTenantChatText({
      tenantId,
      chatId,
      text,
      replyToId: body.replyToId || null,
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
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao enviar mensagem manual do tenant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar mensagem." },
      { status: 500 }
    );
  }
}
