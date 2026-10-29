import test from "node:test";
import assert from "node:assert/strict";
import { readInboxEventStream, type InboxLiveEvent } from "../lib/inbox-event-stream.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET } = await import("../app/api/tenant/[tenantId]/chats/events/route.ts");
const tenantId = `qa_inbox_stream_${Date.now()}`, uid = `${tenantId}_agent`, chatId = `${tenantId}_chat`;
const email = `${uid}@qa.invalid`, password = "QaOnly2026!";
await adminAuth.createUser({ uid, email, password, emailVerified: true });
const batch = adminDb.batch();
const put = (collection: string, id: string, data: Record<string, unknown>) => batch.set(adminDb.collection(collection).doc(id), { tenantId, qaFixture: "server-stream-v1", ...data });
put("tenants", tenantId, { status: "active", billingStatus: "active", accessStatus: "active" });
put("users", uid, { uid, name: "Fictício", email, role: "client_agent", status: "active" });
put("tenant_users", `${tenantId}_${uid}`, { userId: uid, role: "client_agent", status: "active" });
put("tenant_entitlements", tenantId, { version: 1, mode: "custom", modules: { inbox: true }, limits: {} });
put("chats", chatId, { channel: "whatsapp", assignedTo: uid, ownerId: uid, lastMessageTime: new Date() });
put("messages", `${chatId}_first`, { chatId, text: "Nao deve entrar no stream", sender: "client", type: "text", createdAt: new Date() });
await batch.commit();
const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
});
const token = (await login.json()).idToken as string;
test.after(async () => { await adminDb.terminate(); });
function request(scope = tenantId, selected = chatId, signal?: AbortSignal) {
  return new Request(`http://localhost/api/tenant/${scope}/chats/events?chatId=${selected}`, { headers: { Authorization: `Bearer ${token}` }, signal });
}
test("server event stream requires authentication and tenant/assignment access", async () => {
  assert.equal((await GET(new Request("http://localhost/events"), { params: Promise.resolve({ tenantId }) })).status, 401);
  assert.equal((await GET(request("foreign"), { params: Promise.resolve({ tenantId: "foreign" }) })).status, 403);
  await adminDb.collection("chats").doc(`${chatId}_other`).set({ tenantId, ownerId: "other", assignedTo: "other", lastMessageTime: new Date() });
  assert.equal((await GET(request(tenantId, `${chatId}_other`), { params: Promise.resolve({ tenantId }) })).status, 403);
});
test("push delivers additions, receipts and deletions, and stops on reassignment", async t => {
  const controller = new AbortController();
  const response = await GET(request(tenantId, chatId, controller.signal), { params: Promise.resolve({ tenantId }) });
  assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const events: InboxLiveEvent[] = []; const waiting = new Set<() => void>();
  const reading = readInboxEventStream(response.body!, event => { events.push(event); waiting.forEach(check => check()); });
  const wait = (predicate: (event: InboxLiveEvent) => boolean) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(check); reject(new Error("Push timed out")); }, 15_000);
    const check = () => { if (events.some(predicate)) { clearTimeout(timer); waiting.delete(check); resolve(); } };
    waiting.add(check); check();
  });
  const id = `${chatId}_new`;
  try {
    await wait(event => event.kind === "ready"); events.length = 0;
    const started = Date.now();
    await adminDb.collection("messages").doc(id).set({ tenantId, chatId, sender: "agent", type: "audio", createdAt: new Date(), deliveryStatus: "sent" });
    await wait(event => event.kind === "messages" && event.ids.includes(id));
    t.diagnostic(`Firestore write to authenticated push: ${Date.now() - started}ms`);
    assert.ok(events.every(event => !JSON.stringify(event).includes("Nao deve entrar")));
    events.length = 0;
    await adminDb.collection("messages").doc(id).update({ deliveryStatus: "read" });
    await wait(event => event.kind === "messages" && event.ids.includes(id)); events.length = 0;
    await adminDb.collection("messages").doc(id).delete();
    await wait(event => event.kind === "messages" && event.ids.includes(id)); events.length = 0;
    const revoke = adminDb.batch();
    revoke.update(adminDb.collection("chats").doc(chatId), { assignedTo: "other", ownerId: "other", lastMessageTime: new Date() });
    revoke.set(adminDb.collection("messages").doc(`${id}_private`), { tenantId, chatId, sender: "client", type: "text", createdAt: new Date() });
    await revoke.commit(); await wait(event => event.kind === "closed"); await reading;
    assert.ok(!events.some(event => event.kind === "messages" && event.ids.includes(`${id}_private`)));
  } finally { controller.abort(); await reading.catch(() => {}); }
});
