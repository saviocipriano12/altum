import test, { after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatText, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenantId = `qa_text_integrity_${Date.now()}`, channelId = `${tenantId}_channel`;
const originalFetch = globalThis.fetch;
let calls = 0, expectedText = "";
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com");
  assert.match(target.pathname, /\/qa-text-number\/messages$/);
  const payload = JSON.parse(String(options?.body));
  assert.equal(payload.type, "text"); assert.equal(payload.text.body, expectedText);
  assert.equal(payload.to, "5511000000077");
  calls++;
  return Response.json({ messages: [{ id: `wamid.qa-text-${calls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active",
  provider: "meta_whatsapp", phoneNumberId: "qa-text-number", accessToken: "qa-fake-token", channelScope: "shared" });
async function fixture(name: string, text: string, withReply = false) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000077", lastClientMessageAt: new Date() });
  const replyToId = withReply ? `${chatId}_reference` : null;
  if (replyToId) await adminDb.collection("messages").doc(replyToId).set({ tenantId, chatId, text: "Mensagem citada", sender: "client" });
  return queueTenantChatText({ tenantId, chatId, text, replyToId, actor: { id: "qa-owner", name: "Ficticio QA" }, clientRequestId: `text-integrity-${name}-0001` });
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["chat_outbound_jobs", "messages", "chat_outbound_locks", "chat_state", "chats", "tenant_channels", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("accepted 4000-character text reaches simulated Meta verbatim exactly once", async () => {
  expectedText = "a".repeat(3994) + "\n🙂fim";
  const queued = await fixture("valid", expectedText);
  assert.equal((await processChatOutboundJobs({ jobId: queued.jobId })).results[0]?.status, "sent");
  assert.equal((await processChatOutboundJobs({ jobId: queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, 1);
  assert.equal((await adminDb.collection("messages").doc(queued.messageId).get()).data()?.text, expectedText);
});

test("changed same-length text is blocked before contacting provider", async () => {
  const queued = await fixture("changed", "Original");
  await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).update({ text: "Alterado" });
  const result = await processChatOutboundJobs({ jobId: queued.jobId });
  assert.equal(result.results[0]?.status, "dead_letter");
  assert.match(result.results[0]?.error || "", /integridade/);
  assert.equal(calls, 1);
  assert.equal((await adminDb.collection("messages").doc(queued.messageId).get()).data()?.text, "Original");
});

test("oversized or invalid legacy queued payload is not truncated and sent", async () => {
  for (const [name, patch] of [["oversized", { text: "a".repeat(4001) }], ["reply", { replyToId: "a".repeat(181) }]] as const) {
    const queued = await fixture(name, "Original");
    await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).update({ ...patch, requestFingerprint: "" });
    assert.equal((await processChatOutboundJobs({ jobId: queued.jobId })).results[0]?.status, "dead_letter");
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.errorCode, "PREFLIGHT_PERMANENT");
  }
  assert.equal(calls, 1);
});

test("reference deleted or moved after enqueue blocks dispatch before simulated Meta", async () => {
  for (const mode of ["deleted", "other-chat", "other-tenant"]) {
    const name = `reply-${mode}`;
    const queued = await fixture(name, "Resposta original", true);
    const reference = adminDb.collection("messages").doc(`${tenantId}_${name}_reference`);
    const before = calls;
    if (mode === "deleted") await reference.delete();
    else await reference.update(mode === "other-chat" ? { chatId: `${tenantId}_another_chat` } : { tenantId: `${tenantId}_foreign` });
    try {
      const result = await processChatOutboundJobs({ jobId: queued.jobId });
      assert.equal(result.results[0]?.status, "dead_letter", JSON.stringify(result));
      assert.match(result.results[0]?.error || "", /Mensagem respondida nao pertence/);
      assert.equal(calls, before, "An invalid reference must be rejected before delivery");
      const job = (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()!;
      assert.equal(job.errorCode, "PREFLIGHT_PERMANENT");
      assert.equal(job.reconciliationReason, null);
      assert.equal((await adminDb.collection("messages").doc(queued.messageId).get()).data()?.deliveryStatus, "failed");
    } finally { if (mode === "other-tenant") await reference.update({ tenantId }); }
  }
});

test("valid reference still delivers one reply after preflight", async () => {
  expectedText = "Resposta com referencia valida";
  const queued = await fixture("reply-valid", expectedText, true);
  const before = calls;
  assert.equal((await processChatOutboundJobs({ jobId: queued.jobId })).results[0]?.status, "sent");
  assert.equal(calls, before + 1);
  assert.equal((await processChatOutboundJobs({ jobId: queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before + 1);
  assert.equal((await adminDb.collection("messages").doc(queued.messageId).get()).data()?.replyToId, `${tenantId}_reply-valid_reference`);
});
