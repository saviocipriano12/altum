import assert from "node:assert/strict";
import { mock } from "node:test";
import { qaWaveBuffer } from "./audio-wave.mts";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "demo-altum-qa-lab");
const jobId = process.argv[2];
process.env.OPENAI_API_KEY = "qa-crash-fake-local-only";
process.env.ALTUM_TTS_SOURCE_FORMAT = "wav";
assert.match(jobId, /^outbox_[a-f0-9]{48}$/);
const { adminDb, adminStorage } = await import("../../app/lib/server/firebase-admin.ts");
const { processChatOutboundJobs } = await import("../../lib/server/chat-outbound.ts");
const prototype = Object.getPrototypeOf(adminStorage.bucket("demo-altum-qa-lab.appspot.com").file("qa-fixture"));
mock.method(prototype, "getSignedUrl", async () => ["https://qa-crash.invalid/private-file"]);
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return original(url, options);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(jobId).get()).data()!;
  if (target.hostname === "api.openai.com") {
    assert.equal(target.pathname, "/v1/audio/speech"); assert.equal(job.kind, "ai_voice");
    assert.equal(job.providerAttemptStartedAt, undefined);
    await adminDb.collection("qa_test_provider_calls").doc(`${jobId}_tts`).create({ tenantId: job.tenantId, chatId: job.chatId, kind: "tts_fixture" });
    return new Response(new Uint8Array(qaWaveBuffer()), { headers: { "content-type": "audio/wav" } });
  }
  assert.equal(target.hostname, "graph.facebook.com");
  assert.ok(job.providerAttemptStartedAt, "delivery fence must be durable before calling provider");
  assert.equal(job.providerAttemptId, job.leaseToken);
  assert.equal(job.providerAttemptCount, 1);
  if (target.pathname.endsWith("/qa-crash-number/media")) {
    assert.ok(["media", "ai_voice", "ai_knowledge_media"].includes(job.kind));
    if (job.kind === "media") {
      const file = (options?.body as FormData).get("file") as File;
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), (await adminStorage.bucket("demo-altum-qa-lab.appspot.com").file(job.storagePath).download())[0]);
    } else assert.ok(job.kind === "ai_voice" ? job.voiceArtifacts : job.mediaArtifact);
    return Response.json({ id: "qa-crash-voice-upload" });
  }
  if (job.kind === "social_reply") {
    const reply = job.socialReply;
    assert.ok(target.pathname.endsWith(reply.mode === "private_comment" ? `/${reply.accountId}/messages` : `/${reply.commentId}/${reply.channelType === "instagram" ? "replies" : "comments"}`));
  } else assert.match(target.pathname, /\/qa-crash-number\/messages$/);
  await adminDb.collection("qa_test_provider_calls").doc(jobId).create({ tenantId: job.tenantId, chatId: job.chatId,
    jobId, accepted: true, payload: JSON.parse(String(options?.body)) });
  // Abrupt process loss: no exception handler/finally/outbox completion can run.
  process.exit(71);
};
await processChatOutboundJobs({ jobId, limit: 1 });
throw new Error("Fixture did not reach the simulated provider");
