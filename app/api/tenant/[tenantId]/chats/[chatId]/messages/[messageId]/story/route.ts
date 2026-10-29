import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getMetaChannelForTenant } from "@/app/lib/server/meta-channel";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { refreshInstagramStoryMessage } from "@/lib/server/instagram-story-context";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(req: Request, context: { params: Promise<{ tenantId: string; chatId: string; messageId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId, chatId, messageId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);assertTenantRole(membership, "client_viewer");await assertTenantModule(tenantId, "inbox");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });
    const chat = await adminDb.collection("chats").doc(chatId).get(), data = chat.data();
    if (!data || data.tenantId !== tenantId || data.channel !== "instagram") return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    const channel = await getMetaChannelForTenant(tenantId, "instagram", { channelId: data.channelId });
    if (!channel || channel.id !== data.channelId) return Response.json({ error: "Canal indisponível." }, { status: 404 });
    const message = await adminDb.collection("messages").doc(messageId).get();
    if (message.data()?.tenantId !== tenantId || message.data()?.chatId !== chatId || message.data()?.channelId !== channel.id) return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
    const story = await refreshInstagramStoryMessage({ channel, chatId, messageId, force: new URL(req.url).searchParams.get("refresh") === "1" });
    return Response.json({ ok: true, context: story }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof TenantAccessError) return Response.json({ error: error.message }, { status: 403 });
    return Response.json({ error: "Não foi possível carregar este story agora." }, { status: 503 });
  }
}
