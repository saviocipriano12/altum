import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { TenantAccessError } from "@/lib/server/tenant";
import { ContactLinkError } from "@/lib/server/crm/contact-links";
import { ConversationSelectionError, readConversationSelection, selectConversationContext } from "@/lib/server/crm/conversation-context-selection";

async function handle(req: Request, context: { params: Promise<{ tenantId: string; chatId: string }> }, write: boolean) {
  try {
    const user = await requireRequestUser(req), params = await context.params, actor = { ...params, userId: user.uid, userName: user.name };
    return NextResponse.json({ ok: true, ...await (write ? selectConversationContext(actor, await req.json()) : readConversationSelection(actor)) });
  } catch (error) {
    if (error instanceof RouteAuthError || error instanceof ConversationSelectionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof ContactLinkError) return NextResponse.json({ error: "O vínculo do cliente precisa de revisão.", code: "contact_identity_review" }, { status: 409 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    console.error("Falha ao selecionar negociação da conversa", error);
    return NextResponse.json({ error: "Não foi possível salvar o contexto da conversa." }, { status: 500 });
  }
}
export async function GET(req: Request, context: { params: Promise<{ tenantId: string; chatId: string }> }) { return handle(req, context, false); }
export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; chatId: string }> }) { return handle(req, context, true); }
