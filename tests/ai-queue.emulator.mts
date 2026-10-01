import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-ai-queue";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_${suffix}`;
const chatId = `chat_${suffix}`;

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let enqueueIncomingMessageJob: typeof import("../lib/server/ai/queue.ts").enqueueIncomingMessageJob;
let processAiJobNow: typeof import("../lib/server/ai/queue.ts").processAiJobNow;

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  ({ enqueueIncomingMessageJob, processAiJobNow } = await import("../lib/server/ai/queue.ts"));
});

after(async () => {
  const collections = ["jobs", "ai_conversation_turns", "metrics", "chat_state"];
  for (const collectionName of collections) {
    const snap = await adminDb.collection(collectionName).get();
    const matching = snap.docs.filter((doc) => JSON.stringify(doc.data()).includes(suffix));
    await Promise.all(matching.map((doc) => doc.ref.delete()));
  }
});

test("queue enqueue is idempotent for the same provider message", async () => {
  const input = {
    tenantId,
    chatId,
    messageId: `dedupe_${suffix}`,
    dedupeKey: `${tenantId}_dedupe_${suffix}`,
    source: "emulator_test",
    debounceMs: 0,
  };

  const first = await enqueueIncomingMessageJob(input);
  const second = await enqueueIncomingMessageJob(input);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.jobId, first.jobId);
});

test("an older queued message is completed without replying when a newer turn exists", async () => {
  const first = await enqueueIncomingMessageJob({
    tenantId,
    chatId,
    messageId: `older_${suffix}`,
    dedupeKey: `${tenantId}_older_${suffix}`,
    source: "emulator_test",
    debounceMs: 0,
  });
  await enqueueIncomingMessageJob({
    tenantId,
    chatId,
    messageId: `newer_${suffix}`,
    dedupeKey: `${tenantId}_newer_${suffix}`,
    source: "emulator_test",
    debounceMs: 60_000,
  });

  assert.equal(await processAiJobNow(first.jobId), null);
  const job = await adminDb.collection("jobs").doc(first.jobId).get();
  assert.equal(job.data()?.status, "done");
  assert.equal(job.data()?.decision, "skip");
  assert.equal(job.data()?.lastReasonCode, "superseded_by_newer_inbound");
});

test("an active conversation lock prevents a second worker from claiming the turn", async () => {
  const lockedChatId = `${chatId}_locked`;
  const messageId = `locked_${suffix}`;
  const queued = await enqueueIncomingMessageJob({
    tenantId,
    chatId: lockedChatId,
    messageId,
    dedupeKey: `${tenantId}_locked_${suffix}`,
    source: "emulator_test",
    debounceMs: 0,
  });
  const turnId = `${tenantId}_${lockedChatId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 440);
  await adminDb.collection("ai_conversation_turns").doc(turnId).set(
    {
      latestMessageId: messageId,
      settleAt: new Date(0),
      lockJobId: `another_worker_${suffix}`,
      lockedAt: new Date(),
    },
    { merge: true }
  );

  assert.equal(await processAiJobNow(queued.jobId), null);
  const job = await adminDb.collection("jobs").doc(queued.jobId).get();
  assert.equal(job.data()?.status, "pending");
  assert.equal(job.data()?.attempts, 0);
});
