import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { File, GetSignedUrlConfig } from "@google-cloud/storage";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { deliverAiKnowledgeMedia } = await import("../lib/server/ai/knowledge-media-delivery.ts");
const { AiKnowledgeMediaPendingError, AiKnowledgeMediaPreparationError } = await import("../lib/server/ai/knowledge-media-outbox.ts");
const { deliverAiConversationText } = await import("../lib/server/ai/text-delivery.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenantId = `qa_knowledge_media_${Date.now()}`, bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const bytes = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
const originalFetch = globalThis.fetch;
let uploads = 0, media = 0, texts = 0, signs = 0, expectedToken = "", unknownMedia = false, unknownCaption = false, omitId = false;
let failSigning = false;
const events: string[] = [];
mock.method(Object.getPrototypeOf(bucket.file("fixture")), "getSignedUrl", async function (this: File, config: GetSignedUrlConfig) {
  signs++;
  if (failSigning) throw new Error("simulated signing unavailable before provider");
  const generation = String(config.queryParams?.generation); assert.match(generation, /^\d+$/); assert.equal(String(this.generation), generation);
  return [`https://qa-knowledge.invalid/${encodeURIComponent(this.name)}?generation=${generation}`];
});
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  if (target.hostname === "legacy-knowledge.invalid") {
    const active = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
    assert.equal(active.size, 1); const job = active.docs[0].data(); assert.ok(job.providerAttemptStartedAt);
    const payload = JSON.parse(String(options?.body));
    const link = new URL(payload.mediaUrl);
    assert.equal(link.hostname, "qa-knowledge.invalid");
    assert.equal(decodeURIComponent(link.pathname.slice(1)), job.mediaArtifact.storagePath);
    assert.equal(link.searchParams.get("generation"), job.mediaArtifact.generation);
    assert.ok(job.mediaArtifact.storagePath.startsWith(`chat-media/${tenantId}/`));
    assert.deepEqual((await bucket.file(job.mediaArtifact.storagePath, { generation: job.mediaArtifact.generation }).download())[0], bytes);
    media++;
    if (unknownMedia) throw new Error("lost legacy material acknowledgement");
    return Response.json({ messageId: `qa-legacy-material-${media}` });
  }
  assert.equal(target.hostname, "graph.facebook.com"); assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${expectedToken}`);
  const working = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.equal(working.size, 1); const job = working.docs[0].data(); assert.ok(job.providerAttemptStartedAt);
  if (target.pathname.endsWith("/qa-knowledge-number/media")) {
    assert.equal(job.kind, "ai_knowledge_media"); assert.ok(job.mediaArtifact);
    const file = (options?.body as FormData).get("file") as globalThis.File;
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes); assert.equal(file.type, "image/png");
    uploads++; events.push("upload"); return Response.json({ id: `qa-knowledge-upload-${uploads}` });
  }
  const payload = JSON.parse(String(options?.body));
  if (target.pathname.endsWith("/me/messages")) {
    assert.equal(payload.recipient.id, "qa-shared-recipient");
    if (payload.message.text) {
      texts++; events.push("caption"); if (unknownCaption) throw new Error("simulated lost social caption acknowledgement");
      return Response.json({ message_id: `mid.qa-caption-${texts}` });
    }
    const link = new URL(payload.message.attachment.payload.url); assert.equal(link.hostname, "qa-knowledge.invalid");
    const path = decodeURIComponent(link.pathname.slice(1));
    assert.deepEqual((await bucket.file(path, { generation: link.searchParams.get("generation")! }).download())[0], bytes);
  } else {
    assert.match(target.pathname, /\/qa-knowledge-number\/messages$/);
    if (payload.type === "text") { texts++; events.push("fallback"); return Response.json({ messages: [{ id: `wamid.qa-fallback-${texts}` }] }); }
    assert.equal(payload.type, "image"); assert.equal(payload.image.id, `qa-knowledge-upload-${uploads}`); assert.equal(payload.image.caption, "Material QA");
  }
  const message = (await adminDb.collection("messages").doc(job.messageId).get()).data()!;
  assert.equal(message.mediaUrl, job.mediaArtifact.storagePath); assert.equal(message.aiGenerated, true); assert.equal(message.sourceMediaUrl, job.mediaUrl);
  media++; events.push("media"); if (unknownMedia) throw new Error("simulated lost material acknowledgement");
  return target.pathname.endsWith("/me/messages") ? Response.json(omitId ? {} : { message_id: `mid.qa-media-${media}` })
    : Response.json({ messages: omitId ? [] : [{ id: `wamid.qa-media-${media}` }] });
};
async function fixture(name: string, channel: "whatsapp" | "instagram" | "messenger" | "site_chat" = "whatsapp") {
  const chatId = `${tenantId}_${name}`, channelId = `${tenantId}_${channel}_channel`, kbDocId = `${chatId}_kb`, token = `qa-token-${channel}`;
  if (channel !== "site_chat") await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: channel, status: "active", accessToken: token,
    ...(channel === "whatsapp" ? { provider: "meta_whatsapp", phoneNumberId: "qa-knowledge-number" } : { externalAccountId: `qa-account-${channel}` }) });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel, channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date(),
    channelExternalAccountId: `qa-account-${channel}`, contactExternalId: "qa-shared-recipient", assignedTo: "qa-human-owner", commerceConversationContext: { productId: "qa-product" } });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true, humanOwnerUserId: null });
  await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)).set({ tenantId, chatId, latestMessageId: "qa-source-001" });
  const mediaStoragePath = `kb-media/${tenantId}/${name}.png`, mediaUrl = `https://firebasestorage.googleapis.com/qa/${name}.png`;
  await bucket.file(mediaStoragePath).save(bytes, { metadata: { contentType: "image/png" } });
  await adminDb.collection("kb_docs").doc(kbDocId).set({ tenantId, mediaStoragePath, mediaUrl, mediaType: "image", availability: "active" });
  expectedToken = token;
  return { tenantId, chatId, sourceMessageId: "qa-source-001", agentName: "Assistente QA", kbDocId, mediaUrl, mediaStoragePath, mediaType: "image" as const, caption: "Material QA", filename: "material.png" };
}
async function jobFor(chatId: string) {
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  return jobs.docs.find(row => row.data().kind === "ai_knowledge_media")!;
}
async function prepareThenInterrupt(input: Awaited<ReturnType<typeof fixture>>) {
  const original = adminDb.runTransaction.bind(adminDb); let interrupted = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (t: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const prepared = await jobFor(input.chatId);
    if (!interrupted && prepared?.data().mediaArtifact && !prepared.data().providerAttemptStartedAt) {
      interrupted = true;
      throw new Error("simulated interruption before provider fence");
    }
    return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError); } finally { hook.mock.restore(); }
  assert.equal(interrupted, true, "interruption must follow durable preparation and precede the provider");
  const job = await jobFor(input.chatId); assert.equal(job.data().status, "retrying"); assert.ok(job.data().mediaArtifact);
  await job.ref.update({ dueAt: new Date(0) }); return job;
}
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "tenant_channels", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "kb_docs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get(); await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  for (const prefix of [`chat-media/${tenantId}/`, `kb-media/${tenantId}/`]) {
    const [files] = await bucket.getFiles({ prefix }); assert.ok(files.every(file => file.name.startsWith(prefix)));
    await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  }
  await adminDb.terminate();
});
test("WhatsApp knowledge material is copied before delivery and one immutable job/message survives replay", async () => {
  const input = await fixture("valid"); const before = { uploads, media, texts };
  const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => deliverAiKnowledgeMedia(input)));
  assert.ok(attempts.some(row => row.status === "fulfilled"));
  for (const row of attempts) if (row.status === "rejected") assert.ok(row.reason instanceof AiKnowledgeMediaPendingError);
  const first = await deliverAiKnowledgeMedia(input); assert.equal((await deliverAiKnowledgeMedia(input)).messageId, first.messageId);
  assert.deepEqual({ uploads, media, texts }, { uploads: before.uploads + 1, media: before.media + 1, texts: before.texts });
  const message = (await adminDb.collection("messages").doc(first.messageId).get()).data()!;
  assert.notEqual(message.mediaUrl, input.mediaUrl); assert.ok(message.mediaUrl.startsWith(`chat-media/${tenantId}/${input.chatId}/`));
  await bucket.file(input.mediaStoragePath).save(Buffer.from("original changed"));
  assert.deepEqual((await bucket.file(message.mediaUrl).download())[0], bytes);
  assert.equal((await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()?.aiEnabled, true);
  assert.equal((await adminDb.collection("chats").doc(input.chatId).get()).data()?.assignedTo, "qa-human-owner");
  assert.equal((await adminDb.collection("chats").doc(input.chatId).get()).data()?.commerceConversationContext.productId, "qa-product");
  await assert.rejects(deliverAiKnowledgeMedia({ ...input, caption: "Changed" }), /outro conteudo/);
});
test("Instagram and Messenger send one caption then one pinned media attachment with correct channel identity", async () => {
  for (const channel of ["instagram", "messenger"] as const) {
    const input = await fixture(channel, channel); const before = events.length;
    const first = await deliverAiKnowledgeMedia(input); await deliverAiKnowledgeMedia(input);
    assert.deepEqual(events.slice(before), ["caption", "media"]);
    const message = (await adminDb.collection("messages").doc(first.messageId).get()).data()!;
    assert.equal(message.channel, channel); assert.match(message.metaMessageId, /^mid.qa-media/);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 2); const asset = jobs.docs.find(row => row.id === first.jobId)!;
    assert.equal(asset.data().predecessorJobId, jobs.docs.find(row => row.id !== first.jobId)!.id);
  }
});
test("site conversation stores media without any external request", async () => {
  const input = await fixture("site", "site_chat"), before = events.length, beforeSigns = signs;
  await deliverAiKnowledgeMedia(input); await deliverAiKnowledgeMedia(input); assert.equal(events.length, before); assert.equal(signs, beforeSigns);
});
test("remote public material is downloaded once through pinned DNS and reused from private storage", async () => {
  const base = await fixture("remote"), input = { ...base, mediaStoragePath: "" }; let downloads = 0;
  await adminDb.collection("kb_docs").doc(input.kbDocId).update({ mediaStoragePath: "" });
  const lookup = mock.method(dns, "lookup", (async () => [{ address: "93.184.216.34", family: 4 }]) as unknown as typeof dns.lookup);
  const request = mock.method(https, "request", ((url: URL, options: https.RequestOptions, callback: (response: IncomingMessage) => void) => {
    assert.equal(url.href, input.mediaUrl); assert.equal(options.agent, false); downloads++;
    const fake = new EventEmitter() as ClientRequest;
    fake.end = (() => {
      options.lookup!(url.hostname, { all: false }, (error, pinned) => { assert.equal(error, null); assert.equal(pinned, "93.184.216.34"); });
      queueMicrotask(() => {
        const response = Object.assign(new PassThrough(), { statusCode: 200, headers: { "content-type": "image/png" } });
        callback(response as unknown as IncomingMessage); response.end(bytes);
      }); return fake;
    }) as typeof fake.end;
    return fake;
  }) as typeof https.request);
  try { const first = await deliverAiKnowledgeMedia(input); assert.equal((await deliverAiKnowledgeMedia(input)).messageId, first.messageId); assert.equal(downloads, 1); }
  finally { lookup.mock.restore(); request.mock.restore(); }
});
test("unknown material or caption acknowledgement blocks duplicate media and cannot be a safe text fallback", async () => {
  for (const reason of ["media", "caption"] as const) {
    const input = await fixture(`unknown_${reason}`, reason === "caption" ? "instagram" : "whatsapp"), before = { uploads, media, texts };
    unknownMedia = reason === "media"; unknownCaption = reason === "caption";
    try {
      await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError);
      await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError);
      assert.deepEqual({ uploads, media, texts }, reason === "caption" ? { uploads: before.uploads, media: before.media, texts: before.texts + 1 }
        : { uploads: before.uploads + 1, media: before.media + 1, texts: before.texts });
    } finally { unknownMedia = false; unknownCaption = false; }
  }
});
test("unavailable source is a verified pre-delivery failure and fallback text uses its own stable slot", async () => {
  const input = await fixture("missing"); await bucket.file(input.mediaStoragePath).delete(); const before = { uploads, media, texts };
  await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPreparationError);
  const fallback = { ...input, slot: "asset_failure" as const, text: "Nao consegui carregar o material. Posso pedir ajuda?" };
  const sent = await deliverAiConversationText(fallback); assert.equal((await deliverAiConversationText(fallback)).messageId, sent.messageId);
  assert.deepEqual({ uploads, media, texts }, { uploads: before.uploads, media: before.media, texts: before.texts + 1 });
});
test("prepared material resumes without recopying its original; tampered accepted bytes or metadata never reach provider", async () => {
  for (const reason of ["original", "bytes", "metadata"] as const) {
    const input = await fixture(`resume_${reason}`), job = await prepareThenInterrupt(input), artifact = job.data().mediaArtifact;
    await bucket.file(input.mediaStoragePath).save(Buffer.from("changed original")); const before = media;
    if (reason === "bytes") await bucket.file(artifact.storagePath).save(Buffer.from("changed accepted copy"));
    if (reason === "metadata") await job.ref.update({ "mediaArtifact.contentType": "text/html" });
    if (reason !== "original") { await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError); assert.equal(media, before); }
    else { await deliverAiKnowledgeMedia(input); assert.equal(media, before + 1); assert.deepEqual((await job.ref.get()).data()?.mediaArtifact, artifact); }
  }
});
test("foreign KB references or revoked permission cannot be delivered or converted into a fallback", async () => {
  const input = await fixture("foreign"); const before = events.length;
  await adminDb.collection("kb_docs").doc(input.kbDocId).update({ tenantId: `${tenantId}_foreign` });
  await assert.rejects(deliverAiKnowledgeMedia(input), /integridade/); assert.equal(events.length, before);
  await adminDb.collection("kb_docs").doc(input.kbDocId).update({ tenantId, mediaStoragePath: `kb-media/foreign/file.png` });
  await assert.rejects(deliverAiKnowledgeMedia({ ...input, mediaStoragePath: "kb-media/foreign/file.png" }), /integridade/);
});
test("success without a media identifier is pending confirmation and is never resent", async () => {
  const input = await fixture("missing_id"), before = media; omitId = true;
  try { await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError); await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError); assert.equal(media, before + 1); }
  finally { omitId = false; }
});
test("human pause, new turn or KB revocation during preparation blocks the provider without enabling fallback", async () => {
  for (const reason of ["pause", "turn", "revoked"] as const) {
    const input = await fixture(`during_${reason}`), before = events.length;
    const original = adminDb.runTransaction.bind(adminDb); let transactions = 0;
    const hook = mock.method(adminDb, "runTransaction", (async (callback: (t: FirebaseFirestore.Transaction) => Promise<unknown>) => {
      if (++transactions === 2) {
        if (reason === "pause") await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false });
        else if (reason === "turn") await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, input.chatId)).update({ latestMessageId: "qa-new-source" });
        else await adminDb.collection("kb_docs").doc(input.kbDocId).update({ availability: "paused" });
      }
      return original(callback);
    }) as typeof adminDb.runTransaction);
    try { await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError); }
    finally { hook.mock.restore(); }
    const job = await jobFor(input.chatId); assert.equal(job.data().status, "dead_letter"); assert.equal(job.data().mediaPreparationFailed, false);
    assert.equal(events.length, before);
  }
});
test("agent uses durable knowledge media and safe fallback only, retaining source URL for later media deduplication", async () => {
  const source = await readFile("lib/server/ai/agent.ts", "utf8"), branch = source.slice(source.indexOf("const mediaDoc = liveCatalogTurn"), source.indexOf("if (responseFormatPromptSent)", source.indexOf("const mediaDoc = liveCatalogTurn")));
  assert.match(branch, /await deliverAiKnowledgeMedia/); assert.match(branch, /if \(!\(error instanceof AiKnowledgeMediaPreparationError\)\) throw error/);
  assert.match(branch, /slot: "asset_failure"/); assert.doesNotMatch(branch, /sendMetaConversationMedia|\.sendMedia\(|\.sendText\(/);
  assert.match(source, /sanitizeText\(item.sourceMediaUrl, 1200\)/);
});

for (const uncertain of [false, true]) test(`legacy material uses signed immutable copy and does not resend (uncertain=${uncertain})`, async () => {
  const input = await fixture(`legacy-${uncertain}`), before = { media, uploads, signs };
  const legacyId = `${tenantId}_legacy_${uncertain}`;
  await adminDb.collection("tenant_channels").doc(legacyId).set({ tenantId, type: "whatsapp", provider: "custom_gateway", status: "active", accessToken: "qa-fake",
    metadata: { gatewayEndpoint: "https://legacy-knowledge.invalid/send" } });
  await adminDb.collection("chats").doc(input.chatId).update({ channelId: legacyId });
  unknownMedia = uncertain;
  try {
    if (uncertain) {
      await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError);
      await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError);
    } else {
      const sent = await deliverAiKnowledgeMedia(input);
      assert.equal((await deliverAiKnowledgeMedia(input)).messageId, sent.messageId);
    }
    assert.deepEqual({ media, uploads, signs }, { media: before.media + 1, uploads: before.uploads, signs: before.signs + 1 });
    assert.equal((await jobFor(input.chatId)).data().status, uncertain ? "reconciliation_required" : "completed");
  } finally { unknownMedia = false; }
});

test("legacy signing failure retries only preparation and preserves the accepted immutable artifact", async () => {
  const input = await fixture("legacy-signing-failure"), before = media;
  const legacyId = `${tenantId}_legacy_signing`;
  await adminDb.collection("tenant_channels").doc(legacyId).set({ tenantId, type: "whatsapp", provider: "custom_gateway", status: "active", accessToken: "qa-fake",
    metadata: { gatewayEndpoint: "https://legacy-knowledge.invalid/send" } });
  await adminDb.collection("chats").doc(input.chatId).update({ channelId: legacyId });
  failSigning = true;
  try { await assert.rejects(deliverAiKnowledgeMedia(input), AiKnowledgeMediaPendingError); }
  finally { failSigning = false; }
  const job = await jobFor(input.chatId), artifact = job.data().mediaArtifact;
  assert.equal(job.data().status, "retrying"); assert.equal(job.data().providerAttemptStartedAt, undefined);
  assert.equal(media, before); assert.ok(artifact);
  await job.ref.update({ dueAt: new Date(0) });
  const sent = await deliverAiKnowledgeMedia(input);
  assert.equal(sent.jobId, job.id); assert.equal(media, before + 1);
  assert.deepEqual((await job.ref.get()).data()?.mediaArtifact, artifact);
});
