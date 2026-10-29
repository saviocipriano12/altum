import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { qaWaveBuffer } from "./fixtures/audio-wave.mts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "qa-fake-local-only", ALTUM_TTS_SOURCE_FORMAT: "wav" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { deliverAiConversationVoice } = await import("../lib/server/ai/voice-delivery.ts");
const { AiVoiceDeliveryPendingError, AiVoicePreparationError } = await import("../lib/server/ai/voice-delivery-errors.ts");
const { deliverAiConversationText } = await import("../lib/server/ai/text-delivery.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenantId = `qa_ai_voice_${Date.now()}`, channelId = `${tenantId}_channel`;
const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const originalFetch = globalThis.fetch;
let synthesis = 0, uploads = 0, voices = 0, texts = 0, failSynthesis = false, loseVoiceAck = false, omitVoiceId = false;
let duringSpeech: (() => Promise<void>) | null = null;
const prototype = Object.getPrototypeOf(bucket.file("qa-fixture"));
mock.method(prototype, "getSignedUrl", async () => { throw new Error("AI voice must not require URL signing"); });
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  const active = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.equal(active.size, 1);
  const job = active.docs[0].data(), message = (await adminDb.collection("messages").doc(job.messageId).get()).data()!;
  assert.equal(message.aiGenerated, true); assert.equal(job.origin, "ai");
  if (target.hostname === "api.openai.com") {
    assert.equal(target.pathname, "/v1/audio/speech"); assert.equal(job.kind, "ai_voice");
    assert.equal(job.providerAttemptStartedAt, undefined); assert.equal(message.deliveryStatus, "queued");
    const payload = JSON.parse(String(options?.body)); assert.equal(payload.input, message.voiceReplyTranscript); assert.equal(payload.voice, "marin");
    synthesis++;
    if (duringSpeech) await duringSpeech();
    return failSynthesis ? new Response("qa synthesis unavailable", { status: 503 }) : new Response(new Uint8Array(qaWaveBuffer()), { headers: { "content-type": "audio/wav" } });
  }
  if (target.hostname === "legacy-voice.invalid") {
    assert.equal(job.kind, "text"); assert.ok(job.providerAttemptStartedAt);
    const payload = JSON.parse(String(options?.body)); assert.equal(payload.type, "text");
    texts++; return Response.json({ messageId: `qa-legacy-text-${texts}` });
  }
  assert.equal(target.hostname, "graph.facebook.com");
  assert.ok(job.providerAttemptStartedAt, "durable provider fence must precede every WhatsApp request");
  if (target.pathname.endsWith("/qa-ai-voice-number/media")) {
    assert.ok(job.voiceArtifacts); assert.equal(message.mediaUrl, job.voiceArtifacts.playback.storagePath);
    assert.equal(message.mediaMimeType, "audio/mpeg"); assert.equal(message.mediaSize, job.voiceArtifacts.playback.size);
    for (const variant of ["delivery", "playback"]) assert.ok((await bucket.file(job.voiceArtifacts[variant].storagePath).exists())[0]);
    const file = (options?.body as FormData).get("file") as File;
    assert.equal(file.name, "voice.ogg"); assert.match(file.type, /audio\/ogg/);
    const bytes = Buffer.from(await file.arrayBuffer()); assert.equal(bytes.subarray(0, 4).toString(), "OggS"); assert.ok(bytes.includes(Buffer.from("OpusHead")));
    uploads++; return Response.json({ id: `qa-ai-voice-upload-${uploads}` });
  }
  assert.match(target.pathname, /\/qa-ai-voice-number\/messages$/);
  const payload = JSON.parse(String(options?.body));
  if (payload.type === "audio") {
    assert.equal(payload.audio.voice, true); assert.equal(payload.audio.id, `qa-ai-voice-upload-${uploads}`);
    voices++; if (loseVoiceAck) throw new Error("simulated lost AI voice acknowledgement");
    if (omitVoiceId) return Response.json({ messages: [] });
  } else { assert.equal(payload.type, "text"); texts++; }
  return Response.json({ messages: [{ id: `wamid.qa-ai-voice-${voices}-text-${texts}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-ai-voice-number", accessToken: "qa-only" });
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000085", lastClientMessageAt: new Date(), commerceConversationContext: { productId: "qa-product" } });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true, humanOwnerUserId: null });
  await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)).set({ tenantId, chatId, latestMessageId: "qa-source-001" });
  return { tenantId, chatId, sourceMessageId: "qa-source-001", text: "Ola, posso te ajudar com este modelo?", agentName: "Assistente QA", voice: "marin", maxChars: 460 };
}
async function jobFor(chatId: string) {
  const rows = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  return rows.docs.find(row => row.data().kind === "ai_voice")!;
}
async function interruptBeforeProvider(input: Awaited<ReturnType<typeof fixture>>) {
  const original = adminDb.runTransaction.bind(adminDb); let interrupted = false;
  const intercepted = async (callback: (value: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const prepared = await jobFor(input.chatId);
    if (!interrupted && prepared?.data().voiceArtifacts && !prepared.data().providerAttemptStartedAt) {
      interrupted = true;
      throw new Error("simulated interruption after durable preparation, before provider fence");
    }
    return original(callback);
  };
  const hook = mock.method(adminDb, "runTransaction", intercepted as typeof adminDb.runTransaction);
  try { await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError); }
  finally { hook.mock.restore(); }
  assert.equal(interrupted, true, "interruption must follow durable preparation and precede the provider");
  const job = await jobFor(input.chatId);
  assert.equal(job.data().status, "retrying"); assert.ok(job.data().voiceArtifacts); assert.equal(job.data().providerAttemptStartedAt, undefined);
  await job.ref.update({ dueAt: new Date(0) });
  return job;
}
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "tenant_channels", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  const prefix = `chat-media/${tenantId}/`, [files] = await bucket.getFiles({ prefix });
  assert.ok(files.every(file => file.name.startsWith(prefix)));
  await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  await adminDb.terminate();
});
test("AI voice accepts before synthesis, stores both files before delivery and reuses one job on concurrent/repeated calls", async () => {
  const input = await fixture("valid"); const before = { synthesis, uploads, voices, texts };
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => deliverAiConversationVoice(input)));
  const successful = results.filter(row => row.status === "fulfilled"); assert.ok(successful.length);
  const result = await deliverAiConversationVoice(input);
  assert.deepEqual({ synthesis, uploads, voices, texts }, { synthesis: before.synthesis + 1, uploads: before.uploads + 1, voices: before.voices + 1, texts: before.texts });
  assert.equal(result.durationMs, 500); assert.equal(result.durationSource, "measured_wav");
  const message = (await adminDb.collection("messages").doc(result.messageId).get()).data()!;
  assert.equal(message.voiceReply, true); assert.equal(message.text, input.text); assert.equal(message.senderName, input.agentName);
  assert.equal(message.deliveryStatus, "sent"); assert.equal(message.aiGenerated, true);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
  const state = (await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()!;
  assert.equal(state.aiEnabled, true); assert.equal(state.humanOwnerUserId, null);
  const chat = (await adminDb.collection("chats").doc(input.chatId).get()).data()!;
  assert.equal(chat.queueStatus, "unassigned"); assert.equal(chat.commerceConversationContext.productId, "qa-product");
  await assert.rejects(deliverAiConversationVoice({ ...input, text: "Outro conteudo" }), /outro conteudo/);
});
test("unknown voice outcome is not a preparation failure and never repeats synthesis, upload or audio", async () => {
  const input = await fixture("unknown"); const before = { synthesis, uploads, voices, texts };
  loseVoiceAck = true;
  try {
    await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
    await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
    assert.deepEqual({ synthesis, uploads, voices, texts }, { synthesis: before.synthesis + 1, uploads: before.uploads + 1, voices: before.voices + 1, texts: before.texts });
    assert.equal((await jobFor(input.chatId)).data().status, "reconciliation_required");
  } finally { loseVoiceAck = false; }
});
test("verified synthesis failure is eligible for one durable text fallback, not an audio retry", async () => {
  const input = await fixture("preparation_failure"); const before = { synthesis, uploads, voices, texts };
  failSynthesis = true;
  try {
    await assert.rejects(deliverAiConversationVoice(input), AiVoicePreparationError);
    await assert.rejects(deliverAiConversationVoice(input), AiVoicePreparationError);
    const voiceJob = await jobFor(input.chatId); assert.equal(voiceJob.data().voicePreparationFailed, true); assert.equal(voiceJob.data().providerAttemptStartedAt, undefined);
    const fallback = { ...input, slot: "primary" as const, text: "Nao consegui preparar o audio. Continuo por texto." };
    const sent = await deliverAiConversationText(fallback);
    assert.equal((await deliverAiConversationText(fallback)).messageId, sent.messageId);
    assert.deepEqual({ synthesis, uploads, voices, texts }, { synthesis: before.synthesis + 1, uploads: before.uploads, voices: before.voices, texts: before.texts + 1 });
  } finally { failSynthesis = false; }
});
test("HTTP success without an external voice message ID remains uncertain and never triggers text or another audio", async () => {
  const input = await fixture("missing_message_id"); const before = { synthesis, uploads, voices, texts };
  omitVoiceId = true;
  try {
    await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
    await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
    const job = await jobFor(input.chatId); assert.equal(job.data().status, "reconciliation_required"); assert.equal(job.data().voicePreparationFailed, false);
    assert.deepEqual({ synthesis, uploads, voices, texts }, { synthesis: before.synthesis + 1, uploads: before.uploads + 1, voices: before.voices + 1, texts: before.texts });
  } finally { omitVoiceId = false; }
});
test("human pause or a newer source during synthesis blocks voice and is not eligible for text fallback", async () => {
  for (const reason of ["pause", "source"] as const) {
    const input = await fixture(reason); const before = { uploads, voices, texts };
    duringSpeech = async () => {
      if (reason === "pause") await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false, humanOwnerUserId: "qa-human" });
      else await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, input.chatId)).update({ latestMessageId: "qa-source-newer" });
    };
    try {
      await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
      const job = await jobFor(input.chatId); assert.equal(job.data().status, "dead_letter"); assert.equal(job.data().voicePreparationFailed, false);
      assert.match(job.data().error, reason === "pause" ? /pausada/ : /nova mensagem/);
      assert.deepEqual({ uploads, voices, texts }, before);
    } finally { duringSpeech = null; }
  }
});
test("durably prepared voice resumes without generating or overwriting its files again", async () => {
  const input = await fixture("resume"); const before = synthesis;
  const interrupted = await interruptBeforeProvider(input), artifacts = interrupted.data().voiceArtifacts;
  const result = await deliverAiConversationVoice(input);
  assert.equal(result.jobId, interrupted.id); assert.equal(synthesis, before + 1);
  assert.deepEqual((await interrupted.ref.get()).data()?.voiceArtifacts, artifacts);
  assert.equal(String((await bucket.file(artifacts.playback.storagePath).getMetadata())[0].generation), artifacts.playback.generation);
});
test("changed playback bytes or foreign artifact paths are rejected before provider and without a text fallback", async () => {
  for (const reason of ["bytes", "scope"] as const) {
    const input = await fixture(`tampered_${reason}`); const interrupted = await interruptBeforeProvider(input);
    const artifacts = interrupted.data().voiceArtifacts, before = { synthesis, uploads, voices, texts };
    if (reason === "bytes") await bucket.file(artifacts.playback.storagePath).save(Buffer.from("tampered playback"));
    else await interrupted.ref.update({ "voiceArtifacts.delivery.storagePath": "chat-media/foreign-tenant/chat/wrong-voice/delivery.ogg" });
    await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
    const job = (await interrupted.ref.get()).data()!; assert.equal(job.status, "dead_letter"); assert.match(job.error, /integridade/); assert.equal(job.voicePreparationFailed, false);
    assert.deepEqual({ synthesis, uploads, voices, texts }, before);
  }
});
test("voice source contract wires the agent to durable delivery and only preparation error can enter its fallback", async () => {
  const source = await readFile("lib/server/ai/agent.ts", "utf8");
  const branch = source.slice(source.indexOf("if (shouldSendVoiceReply) {", source.indexOf("let sentAsTemplate")), source.indexOf("const mediaDoc = liveCatalogTurn"));
  assert.match(branch, /await deliverAiConversationVoice\(/);
  assert.match(branch, /if \(!\(error instanceof AiVoicePreparationError\)\) throw error/);
  assert.doesNotMatch(branch, /getWhatsAppMessagingProvider|sendMetaConversationText|sendAltumVoiceReply/);
  assert.match(branch, /slot: "checkout"/); assert.match(branch, /slot: "secondary"/);
});

test("legacy gateway rejects unsupported voice before delivery fence, permitting one durable text fallback", async () => {
  const input = await fixture("legacy-voice"), before = { uploads, voices, texts };
  const legacyId = `${tenantId}_legacy`;
  await adminDb.collection("tenant_channels").doc(legacyId).set({ tenantId, type: "whatsapp", provider: "custom_gateway", status: "active", accessToken: "qa-only",
    metadata: { gatewayEndpoint: "https://legacy-voice.invalid/send" } });
  await adminDb.collection("chats").doc(input.chatId).update({ channelId: legacyId });
  await assert.rejects(deliverAiConversationVoice(input), AiVoicePreparationError);
  const job = await jobFor(input.chatId);
  assert.equal(job.data().status, "dead_letter"); assert.equal(job.data().voicePreparationFailed, true);
  assert.equal(job.data().providerAttemptStartedAt, undefined);
  assert.deepEqual({ uploads, voices, texts }, before);
  // The known unsupported channel never reached the provider. The existing
  // agent fallback uses a separate stable text slot; retain the same source.
  const text = { ...input, slot: "primary" as const, text: "Continuo por texto." };
  const sent = await deliverAiConversationText(text);
  assert.equal((await deliverAiConversationText(text)).messageId, sent.messageId);
  assert.equal(texts, before.texts + 1);
});

test("human pause during legacy voice preparation is not mistaken for a safe capability fallback", async () => {
  const input = await fixture("legacy-voice-paused"), before = { uploads, voices, texts };
  const legacyId = `${tenantId}_legacy_paused`;
  await adminDb.collection("tenant_channels").doc(legacyId).set({ tenantId, type: "whatsapp", provider: "custom_gateway", status: "active", accessToken: "qa-only",
    metadata: { gatewayEndpoint: "https://legacy-voice.invalid/send" } });
  await adminDb.collection("chats").doc(input.chatId).update({ channelId: legacyId });
  duringSpeech = async () => { await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false, humanOwnerUserId: "qa-human" }); };
  try {
    await assert.rejects(deliverAiConversationVoice(input), AiVoiceDeliveryPendingError);
    const job = await jobFor(input.chatId);
    assert.equal(job.data().status, "dead_letter"); assert.equal(job.data().voicePreparationFailed, false);
    assert.equal(job.data().providerAttemptStartedAt, undefined);
    assert.deepEqual({ uploads, voices, texts }, before);
  } finally { duringSpeech = null; }
});
