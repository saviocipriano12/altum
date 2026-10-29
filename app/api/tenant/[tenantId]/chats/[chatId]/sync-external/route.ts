import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { reconcileExternalWhatsAppMessages } from "@/lib/server/messaging/whatsapp-external-reconciliation";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { recoverRecentMetaInbox } from "@/lib/server/meta-inbox-recovery";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: Request, context: { params: Promise<{ tenantId: string; chatId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer"); await assertTenantModule(tenantId, "inbox");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });
    const chat = (await adminDb.collection("chats").doc(chatId).get()).data();
    if (chat?.tenantId === tenantId && ["instagram", "messenger"].includes(chat.channel)) {
      const result = await recoverRecentMetaInbox(tenantId, { chatId });
      return Response.json({ ...result, imported: result.synced });
    }
    return Response.json(await reconcileExternalWhatsAppMessages(tenantId, chatId));
  } catch (error) {
    if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof TenantAccessError) return Response.json({ error: error.message }, { status: 403 });
    return Response.json({ status: "unavailable", imported: 0 });
  }
}
