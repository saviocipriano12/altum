import assert from "node:assert/strict";
import test, { after, before } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET, PATCH } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/read-issues/route.ts");
const { GET: getMessages } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts");
const { selectReferencedMessage } = await import("../lib/conversation-source-link.ts");
const { projectCommercialReadIssues } = await import("../lib/server/crm/read-issues.ts");
const { commercialReadNotice } = await import("../lib/crm-read-state.ts");
const tenantId = `qa_read_review_${Date.now()}`, uid = `${tenantId}_seller`;
let token = "", seq = 0;
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaLocalReview2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, role: "client_agent", status: "active", name: "Vendedor fictício" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, inbox: true }, limits: {} });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaLocalReview2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  for (const name of ["users", "tenant_users", "tenant_entitlements", "leads", "chats", "messages", "tenant_channels"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function request(body?: unknown, authorized = true, cursor?: string) {
  return new Request(`http://127.0.0.1/read-issues${cursor ? `?cursor=${cursor}` : ""}`, { method: body ? "PATCH" : "GET", headers: {
    ...(authorized ? { authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function fixture() {
  const id = `${tenantId}_${++seq}`, lead = adminDb.collection("leads").doc(id), chat = adminDb.collection("chats").doc(`${id}_chat`);
  await lead.set({ tenantId, ownerId: uid, customFields: { orcamento: "Conferido pela equipe" } });
  await chat.set({ tenantId, leadId: id, assignedTo: uid });
  const context = { params: Promise.resolve({ tenantId, leadId: id }) };
  async function add(messageId?: string) {
    const message = adminDb.collection("messages").doc(messageId || `${id}_${++seq}`);
    await message.set({ tenantId, chatId: chat.id, leadId: id, sender: "client", type: "audio", createdAt: new Date() });
    await project(message); return message;
  }
  async function project(message: FirebaseFirestore.DocumentReference) {
    const source = await message.get();
    await adminDb.runTransaction(async tx => {
      const current = await tx.get(lead);
      const state = await projectCommercialReadIssues(tx, lead, current.data()?.aiCommercialReadState,
        { status: "media_failed", chatId: chat.id, messageId: message.id, occurredAtMs: Date.now(), sourceCreatedAtMs: source.createTime!.toMillis(),
          sourceOrder: `${String(source.createTime!.seconds).padStart(12, "0")}:${String(source.createTime!.nanoseconds).padStart(9, "0")}`,
          sourceRevision: `${source.updateTime!.seconds}:${source.updateTime!.nanoseconds}` }, `${current.createTime!.seconds}:${current.createTime!.nanoseconds}`);
      tx.update(lead, { aiCommercialReadState: state });
    });
  }
  async function list(cursor?: string) { const response = await GET(request(undefined, true, cursor), context); assert.equal(response.status, 200); return response.json(); }
  const message = await add();
  return { lead, chat, message, context, add, project, list };
}
const review = (item: Record<string, unknown>) => ({ id: item.id, revision: item.revision, sourceRevision: item.sourceRevision,
  leadGeneration: item.leadGeneration, contextRevision: item.contextRevision, note: "Conferi o áudio e registrei o orçamento correto na ficha.", confirmed: true });

test("authenticated human review resolves its source, records authorship and does not invent an automatic reading", async () => {
  const f = await fixture(), item = (await f.list()).items[0];
  assert.equal((await GET(request(undefined, false), f.context)).status, 401);
  const response = await PATCH(request(review(item)), f.context); assert.equal(response.status, 200);
  const row = (await f.lead.get()).data()!;
  assert.equal(row.customFields.orcamento, "Conferido pela equipe");
  assert.equal(row.aiCommercialReadState.status, "media_failed"); assert.equal(commercialReadNotice(row.aiCommercialReadState), null);
  const issue = await f.lead.collection("commercial_read_issues").doc(item.id).get();
  assert.equal(issue.data()?.resolution, "manual"); assert.equal(issue.data()?.reviewedBy, uid);
  assert.equal((await f.lead.collection("events").get()).size, 1);
  assert.equal((await PATCH(request(review(item)), f.context)).status, 409);
  assert.equal((await f.lead.collection("events").get()).size, 1);
  await f.project(f.message); await f.project(f.message);
  assert.equal((await f.lead.get()).data()!.aiCommercialReadState.pendingCount, 0);
  await f.message.update({ text: "Conteúdo alterado após conferência" }); await f.project(f.message);
  assert.equal((await f.lead.get()).data()!.aiCommercialReadState.pendingCount, 1);
});
test("updated or recreated source and changed issue revision cannot be acknowledged from an old form", async () => {
  const f = await fixture(), old = (await f.list()).items[0];
  await f.message.update({ text: "Nova transcrição" });
  assert.equal((await PATCH(request(review(old)), f.context)).status, 409);
  const latest = (await f.list()).items[0];
  await f.project(f.message);
  assert.equal((await PATCH(request(review(latest)), f.context)).status, 409);
  const now = (await f.list()).items[0], data = (await f.message.get()).data()!;
  await f.message.delete(); await f.message.set(data);
  assert.equal((await PATCH(request(review(now)), f.context)).status, 409);
});
test("revoked capability, another seller and transferred personal channel prevent review", async () => {
  const f = await fixture(), item = (await f.list()).items[0];
  const membership = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
  await membership.update({ capabilities: [] });
  assert.equal((await PATCH(request(review(item)), f.context)).status, 403);
  await membership.update({ capabilities: ["edit_leads"] });
  await f.lead.update({ ownerId: "another-seller" });
  assert.equal((await GET(request(), f.context)).status, 403);
  await f.lead.update({ ownerId: uid });
  const channel = adminDb.collection("tenant_channels").doc(`${f.chat.id}_channel`);
  await channel.set({ tenantId, channelScope: "personal", ownerUserId: "another-seller" });
  await f.chat.update({ channelId: channel.id, channelScope: "personal", channelOwnerUserId: uid });
  assert.deepEqual((await f.list()).items, []);
  assert.equal((await PATCH(request(review(item)), f.context)).status, 409);
  assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("recreated customer or conversation cannot accept a review from its previous generation", async () => {
  const f = await fixture(), old = (await f.list()).items[0], original = (await f.lead.get()).data()!;
  await f.lead.delete(); await f.lead.set(original);
  assert.equal((await PATCH(request(review(old)), f.context)).status, 409);
  const fresh = (await f.list()).items[0], chat = (await f.chat.get()).data()!;
  await f.chat.delete(); await f.chat.set(chat);
  assert.equal((await PATCH(request(review(fresh)), f.context)).status, 409);
  assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("confirmation and note are mandatory and CRM module revocation blocks the commit", async () => {
  const f = await fixture(), item = (await f.list()).items[0];
  for (const change of [{ confirmed: false }, { note: "" }, { note: "x".repeat(601) }, { id: "../another" }])
    assert.equal((await PATCH(request({ ...review(item), ...change }), f.context)).status, 400);
  await adminDb.collection("tenant_entitlements").doc(tenantId).update({ "modules.crm": false });
  assert.equal((await PATCH(request(review(item)), f.context)).status, 403);
  await adminDb.collection("tenant_entitlements").doc(tenantId).update({ "modules.crm": true });
});
test("pending messages are paginated without silently dropping the twenty-first source", async () => {
  const f = await fixture(); for (let index = 0; index < 20; index++) await f.add();
  const first = await f.list(); assert.equal(first.items.length, 20); assert.ok(first.nextCursor);
  const second = await f.list(first.nextCursor); assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item: { id: string }) => item.id)).size, 21);
});
test("an old CRM source is read directly without loading history and retains protected access and generation", async () => {
  const f = await fixture(), batch = adminDb.batch();
  for (let index = 0; index < 220; index++) batch.set(adminDb.collection("messages").doc(`${f.chat.id}_recent_${index}`), {
    tenantId, chatId: f.chat.id, sender: "client", text: "Mensagem recente fictícia", createdAt: new Date(Date.now() + index + 1000), type: "text" });
  await batch.commit();
  const context = { params: Promise.resolve({ tenantId, chatId: f.chat.id }) };
  const req = (id: string) => new Request(`http://localhost/messages?id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });
  const item = (await f.list()).items[0], link = new URL(item.href, "http://localhost");
  assert.equal(link.searchParams.get("messageId"), f.message.id);
  const response = await getMessages(req(f.message.id), context); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.items.length, 1); assert.equal(body.hasMore, false);
  assert.equal(selectReferencedMessage(body, f.message.id, link.searchParams.get("messageGeneration")).id, f.message.id);
  const long = await f.add(`${f.lead.id}_${"m".repeat(240 - f.lead.id.length - 1)}`);
  const longItem = (await f.list()).items.find((item: { href: string }) => new URL(item.href, "http://localhost").searchParams.get("messageId") === long.id);
  assert.ok(longItem);
  assert.equal((await getMessages(req(long.id), context)).status, 200);
  const other = await f.add(); await other.update({ chatId: "another-chat" });
  assert.equal((await getMessages(req(other.id), context)).status, 403);
  const source = (await f.message.get()).data()!; await f.message.delete(); await f.message.set(source);
  const replaced = await getMessages(req(f.message.id), context); assert.equal(replaced.status, 200);
  const replacedPayload = await replaced.json();
  assert.throws(() => selectReferencedMessage(replacedPayload, f.message.id, link.searchParams.get("messageGeneration")), /foi substituída/);
});
