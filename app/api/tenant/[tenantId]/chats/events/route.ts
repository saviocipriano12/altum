import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess, canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import type { InboxLiveEvent } from "@/lib/inbox-event-stream";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const chatId = new URL(req.url).searchParams.get("chatId") || "";
    const oldestMs = Number(new URL(req.url).searchParams.get("oldestMs") || 0);
    if (chatId.length > 180 || chatId.includes("/")) return Response.json({ error: "Conversa invalida." }, { status: 400 });
    if (!Number.isFinite(oldestMs) || oldestMs < 0 || oldestMs > Date.now() + 300_000) return Response.json({ error: "Periodo invalido." }, { status: 400 });
    let membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    assertTenantRole(membership, "client_viewer");
    const authorize = async () => {
      await requireRequestUser(req);
      membership = await assertTenantAccess(user.uid, tenantId);
      if (chatId) await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });
    };
    if (chatId) await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });
    let stop = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encode = new TextEncoder();
        const subscriptions: Array<() => void> = [];
        let ended = false, checking = false;
        let queue = Promise.resolve();
        const emit = (event: InboxLiveEvent) => { if (!ended) controller.enqueue(encode.encode(`data: ${JSON.stringify(event)}\n\n`)); };
        const close = () => {
          if (ended) return;
          ended = true;
          subscriptions.forEach(unsubscribe => unsubscribe());
          clearInterval(heartbeat); clearTimeout(expiration);
          req.signal.removeEventListener("abort", close);
          try { controller.close(); } catch { /* The reader may already have cancelled. */ }
        };
        const fail = () => { emit({ kind: "closed" }); close(); };
        const deliver = (work: () => Promise<void>) => {
          queue = queue.then(async () => { if (!ended) await work(); }).catch(fail);
        };
        const heartbeat = setInterval(() => {
          if (ended || checking) return;
          checking = true;
          void (async () => {
            await authorize(); await assertTenantModule(tenantId, "inbox");
            if (!ended) controller.enqueue(encode.encode(": heartbeat\n\n"));
          })().catch(fail).finally(() => { checking = false; });
        }, 15_000);
        const expiration = setTimeout(close, Math.max(1, Math.min(240_000, user.token.exp * 1000 - Date.now())));
        stop = close;
        req.signal.addEventListener("abort", close, { once: true });
        if (req.signal.aborted) { close(); return; }
        subscriptions.push(adminDb.collection("chats").where("tenantId", "==", tenantId).orderBy("lastMessageTime", "desc").limit(100)
          .onSnapshot(snapshot => deliver(async () => {
            await authorize();
            if (snapshot.docChanges().some(change => canAccessAssignedCommercialRecord(membership, user.uid, change.doc.data()))) emit({ kind: "chats" });
          }), fail));
        if (chatId) {
          const messages = adminDb.collection("messages").where("chatId", "==", chatId);
          subscriptions.push((oldestMs ? messages.where("createdAt", ">=", Timestamp.fromMillis(oldestMs)) : messages).orderBy("createdAt", "desc").limit(oldestMs ? 2000 : 100)
            .onSnapshot(snapshot => deliver(async () => {
              await authorize();
              const changes = snapshot.docChanges();
              if (changes.some(change => change.doc.data().tenantId !== tenantId)) { fail(); return; }
              const ids = changes.map(change => change.doc.id);
              for (let i = 0; i < ids.length; i += 100) emit({ kind: "messages", ids: ids.slice(i, i + 100) });
              emit({ kind: "ready" });
            }), fail));
        } else emit({ kind: "ready" });
      },
      cancel() { stop(); },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return Response.json({ error: error.message, code: error.code }, { status: 403 });
    return Response.json({ error: "Nao foi possivel acompanhar as conversas." }, { status: 500 });
  }
}
