import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deliverSocialReply, resumeSocialReply } = await import("../lib/server/social/reply-delivery.ts");
const { socialReplyIdentity, socialReplyFingerprint, socialContactId } = await import("../lib/server/social/reply-contract.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { retrySocialAutomationLog, handleMetaSocialEvent } = await import("../lib/server/social/service.ts");
const { createChatOutboundFingerprint } = await import("../lib/server/chat-outbound-idempotency.ts");
const { commitChatOutboundEnqueue } = await import("../lib/server/chat-outbound-enqueue.ts");
const { appendSocialReplyAcceptance } = await import("../lib/server/social/reply-contract.ts");
const tenantId = `qa_social_outbox_${Date.now()}`;
const originalFetch = globalThis.fetch;
let calls = 0, outcome: "normal" | "lost" | "noid" = "normal", earlyRead = false;
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, init);
  assert.equal(target.hostname, "graph.facebook.com");
  const body = JSON.parse(String(init?.body));
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  const job = jobs.docs.find(doc => {
    const reply = doc.data().socialReply;
    return reply && (target.pathname.endsWith(`/${reply.commentId}/replies`) || target.pathname.endsWith(`/${reply.commentId}/comments`) ||
      (target.pathname.endsWith(`/${reply.accountId}/messages`) && body.recipient?.comment_id === reply.commentId));
  });
  assert.ok(job); assert.ok(job.data().providerAttemptStartedAt); assert.equal(job.data().providerAttemptCount, 1);
  const reply = job.data().socialReply;
  assert.equal(new Headers(init?.headers).get("authorization"), `Bearer qa-token-${reply.channelType}`);
  if (reply.mode === "private_comment") assert.deepEqual(body, { recipient: { comment_id: reply.commentId }, message: { text: reply.text } });
  else { assert.deepEqual(body, { message: reply.text }); assert.ok(target.pathname.endsWith(reply.channelType === "instagram" ? "/replies" : "/comments")); }
  calls++;
  if (earlyRead && job.data().messageId) await adminDb.collection("messages").doc(job.data().messageId).update({ deliveryStatus: "read", status: "read" });
  if (outcome === "lost") throw new Error("lost social ACK");
  return Response.json(outcome === "noid" ? {} : reply.mode === "private_comment" ? { message_id: `mid.social-${calls}` } : { id: `comment.social-${calls}` });
};
async function fixture(name: string, type: "instagram" | "messenger" = "instagram", privateReply = false) {
  const logId = `${tenantId}_${name}`, chatId = `${logId}_chat`, channelId = `${logId}_channel`, accountId = `qa-account-${name}`, actorId = `qa-actor-${name}`;
  const rule = { id: "qa-rule", name: "QA", enabled: true, mediaIds: [], keywords: [], message: "Resposta fixa", privateReply };
  await adminDb.collection("social_automations").doc(tenantId).set({ tenantId, enabled: true, commentAutoReply: true, commentRules: [rule],
    activeHours: { timezone: "UTC", start: "00:00", end: "00:00", days: [0,1,2,3,4,5,6] } });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type, status: "active", accessToken: `qa-token-${type}`, externalAccountId: accountId });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: type, channelId, contactExternalId: actorId, channelExternalAccountId: accountId,
    assignedTo: "qa-owner", lastMessage: "Antes", outboundSequence: 0 });
  const reply = { logId, eventId: `event-${name}`, channelId, channelType: type, accountId, pageId: "", actorId, commentId: `qa-comment-${name}`, postId: "qa-post",
    text: `Resposta aceita ${name}`, mode: privateReply ? "private_comment" as const : "public_comment" as const,
    ruleId: rule.id, ruleFingerprint: createChatOutboundFingerprint([rule]) };
  await adminDb.collection("social_automation_logs").doc(logId).set({ tenantId, channelId, channelType: type, eventType: "comment", eventId: reply.eventId,
    actorId, commentId: reply.commentId, postId: reply.postId, text: "Ola", status: "claimed", preparationProtocol: 1, claimToken: "qa-claim", claimUntil: new Date(Date.now()+300000) });
  return { tenantId, chatId, reply, claimToken: "qa-claim" };
}
async function queue(input: Awaited<ReturnType<typeof fixture>>) {
  const identity = socialReplyIdentity(tenantId, input.reply);
  await commitChatOutboundEnqueue({ tenantId, chatId: input.chatId, identity, fingerprint: socialReplyFingerprint(tenantId, input.chatId, input.reply),
    actor: { id: "qa", name: "QA" }, replyToId: null, preview: input.reply.text, stateId: "unused", pauseAi: false, internalOnly: input.reply.mode === "public_comment",
    beforeCommit: batch => appendSocialReplyAcceptance(batch, { ...input, jobId: identity.jobId }),
    build: () => ({ message: { channel: input.reply.channelType, type: "text", text: input.reply.text }, job: { kind: "social_reply", socialReply: input.reply } }) });
  return identity;
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["social_reply_deliveries", "social_automations", "social_automation_logs", "social_automation_contacts", "chats", "messages", "tenant_channels", "chat_outbound_jobs", "chat_outbound_locks", "qa_test_provider_calls",
    "leads", "contact_profiles", "lead_events", "lead_tasks", "lead_intake_events", "tenant_settings", "automation_runs", "crm_observation_jobs", "audit_logs", "jobs"]) {
    const docs = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const doc of docs.docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
for (const [type, privateReply] of [["instagram", false], ["instagram", true], ["messenger", false]] as const) test(`${type} ${privateReply ? "private" : "public"} keeps one receipt without inventing a DM`, async () => {
  const input = await fixture(`${type}-${privateReply}`, type, privateReply), before = calls;
  const first = await deliverSocialReply(input), second = await deliverSocialReply({ ...input, reply: { ...input.reply, text: "Nao pode substituir" } });
  assert.equal(first.status, "sent"); assert.equal(first.jobId, second.jobId); assert.equal(second.responseText, input.reply.text); assert.equal(calls, before + 1);
  const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.size, privateReply ? 1 : 0);
  const chat = (await adminDb.collection("chats").doc(input.chatId).get()).data()!;
  assert.equal(chat.assignedTo, "qa-owner"); if (!privateReply) { assert.equal(chat.lastMessage, "Antes"); assert.equal(chat.outboundSequence, 0); }
});
test("concurrent attempts accept only one reply", async () => {
  const input = await fixture("concurrent", "instagram", true), before = calls;
  await Promise.allSettled(Array.from({length: 5}, () => deliverSocialReply(input)));
  assert.equal((await resumeSocialReply({ tenantId, logId: input.reply.logId })).status, "sent"); assert.equal(calls, before+1);
});
for (const failure of ["lost", "noid"] as const) test(`${failure} acknowledgement never becomes sent or another reply`, async () => {
  const input = await fixture(failure), before = calls; outcome = failure;
  try {
    assert.equal((await deliverSocialReply(input)).status, "pending_confirmation");
    assert.equal((await retrySocialAutomationLog({ tenantId, logId: input.reply.logId, actorId: "qa", actorName: "QA" })).status, "pending_confirmation");
    assert.equal(calls, before+1); assert.equal((await adminDb.collection("social_automation_logs").doc(input.reply.logId).get()).data()?.status, "pending_confirmation");
  } finally { outcome = "normal"; }
});
for (const change of ["optout", "disabled", "rule", "channel", "actor", "foreign", "payload"] as const) test(`queued reply rechecks ${change} before provider`, async () => {
  const input = await fixture(`revoke-${change}`), queued = await queue(input), before = calls;
  if (change === "optout") await adminDb.collection("social_automation_contacts").doc(socialContactId(tenantId, input.reply.channelType, input.reply.actorId)).update({ optedOut: true });
  if (change === "disabled") await adminDb.collection("social_automations").doc(tenantId).update({ enabled: false });
  if (change === "rule") await adminDb.collection("social_automations").doc(tenantId).update({ commentRules: [] });
  if (change === "channel") await adminDb.collection("tenant_channels").doc(input.reply.channelId).update({ externalAccountId: "other-account" });
  if (change === "actor") await adminDb.collection("chats").doc(input.chatId).update({ contactExternalId: "other-actor" });
  if (change === "foreign") await adminDb.collection("social_automation_logs").doc(input.reply.logId).update({ tenantId: "qa-foreign" });
  if (change === "payload") await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).update({ "socialReply.text": "changed" });
  try {
    await processChatOutboundJobs({ jobId: queued.jobId }); assert.equal(calls, before);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.status, "dead_letter");
  } finally { if (change === "foreign") await adminDb.collection("social_automation_logs").doc(input.reply.logId).update({ tenantId }); }
});
test("legacy sent log cannot be reset into retrying and uncertain legacy delivery needs review", async () => {
  const input = await fixture("legacy"), ref = adminDb.collection("social_automation_logs").doc(input.reply.logId), before = calls;
  await ref.set({ tenantId, status: "sent" });
  assert.equal((await retrySocialAutomationLog({ tenantId, logId: ref.id, actorId: "qa", actorName: "QA" })).status, "sent");
  await ref.update({ status: "failed" });
  await assert.rejects(retrySocialAutomationLog({ tenantId, logId: ref.id, actorId: "qa", actorName: "QA" }), /legado/); assert.equal(calls, before);
});
test("removed accepted job is not recreated", async () => {
  const input = await fixture("removed"), queued = await queue(input), before = calls;
  await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).delete();
  await assert.rejects(resumeSocialReply({ tenantId, logId: input.reply.logId }), /removida/); assert.equal(calls, before);
});
test("consent is checked again inside the durable provider fence", async () => {
  const input = await fixture("fence-race"), queued = await queue(input), before = calls;
  const original = adminDb.runTransaction.bind(adminDb); let transactions = 0;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    if (++transactions === 2) await adminDb.collection("social_automation_contacts").doc(socialContactId(tenantId, input.reply.channelType, input.reply.actorId)).update({ optedOut: true });
    return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await processChatOutboundJobs({ jobId: queued.jobId }); } finally { hook.mock.restore(); }
  assert.equal(calls, before); assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.providerAttemptStartedAt, undefined);
});
test("source no longer has provider sends and manual retry does not rewrite accepted status", async () => {
  const source = await readFile("lib/server/social/service.ts", "utf8");
  assert.doesNotMatch(source, /await (sendMetaCommentReply|sendInstagramPrivateCommentReply|sendMetaConversationText)\(/);
  assert.match(source, /await deliverSocialReply\(/); assert.match(source, /if \(logData.deliveryJobId\) return resumeSocialReply/);
});

test("full social webhook flow and replay keep the accepted rule text and one delivery", async () => {
  const input = await fixture("full-flow", "instagram", true), before = calls;
  await adminDb.collection("social_automation_logs").doc(input.reply.logId).delete();
  const channel = { id: input.reply.channelId, tenantId, type: "instagram" as const, provider: "instagram", accessToken: "qa-token-instagram", externalAccountId: input.reply.accountId };
  const event = { eventId: input.reply.eventId, eventType: "comment" as const, channelType: "instagram" as const, entryId: input.reply.accountId,
    actorId: input.reply.actorId, actorName: "Contato QA", actorUsername: "qa", text: "Ola", commentId: input.reply.commentId, postId: input.reply.postId, timestamp: null, field: "comments" };
  const result = await handleMetaSocialEvent({ tenantId, channel, event }); assert.equal(result.status, "sent");
  const again = await handleMetaSocialEvent({ tenantId, channel, event }); assert.equal(again.status, "sent"); assert.equal(calls, before+1);
  const changedTimestamp = await handleMetaSocialEvent({ tenantId, channel, event: { ...event, eventId: `${event.eventId}-new-time`, timestamp: 1770000000 } });
  assert.equal(changedTimestamp.status, "sent"); assert.equal(calls, before+1);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().socialReply.text, "Resposta fixa");
});

test("lost acceptance commit acknowledgement retains the same social delivery", async () => {
  const input = await fixture("enqueue-ack"), original = adminDb.batch.bind(adminDb); let lost = false;
  const hook = mock.method(adminDb, "batch", () => {
    const batch = original(), commit = batch.commit.bind(batch);
    batch.commit = async () => { const result = await commit(); if (!lost) { lost = true; throw new Error("lost enqueue acknowledgement"); } return result; };
    return batch;
  });
  const before = calls;
  try { assert.equal((await deliverSocialReply(input)).status, "sent"); } finally { hook.mock.restore(); }
  assert.ok(lost); assert.equal((await deliverSocialReply(input)).status, "sent"); assert.equal(calls, before+1);
});

test("failed atomic acceptance leaves neither message, job nor queued source", async () => {
  const input = await fixture("uncommitted", "instagram", true), original = adminDb.batch.bind(adminDb);
  const hook = mock.method(adminDb, "batch", () => { const batch = original(); batch.commit = async () => { throw new Error("uncommitted transport"); }; return batch; });
  try { await assert.rejects(deliverSocialReply(input), /uncommitted/); } finally { hook.mock.restore(); }
  const identity = socialReplyIdentity(tenantId, input.reply);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(identity.jobId).get()).exists, false);
  assert.equal((await adminDb.collection("messages").doc(identity.messageId).get()).exists, false);
  assert.equal((await adminDb.collection("social_automation_logs").doc(input.reply.logId).get()).data()?.status, "claimed");
});

test("lost final receipt acknowledgement cannot downgrade the sent source", async () => {
  const input = await fixture("receipt-ack"), queued = await queue(input), before = calls;
  const original = adminDb.runTransaction.bind(adminDb); let lost = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const result = await original(callback);
    if (!lost && (await adminDb.collection("social_automation_logs").doc(input.reply.logId).get()).data()?.status === "sent") { lost = true; throw new Error("lost receipt ACK"); }
    return result;
  }) as typeof adminDb.runTransaction);
  try { await processChatOutboundJobs({ jobId: queued.jobId }); } finally { hook.mock.restore(); }
  assert.ok(lost); assert.equal((await resumeSocialReply({ tenantId, logId: input.reply.logId })).status, "sent"); assert.equal(calls, before+1);
});

for (const privateReply of [false, true]) test(`process loss after social acceptance cannot resend (private=${privateReply})`, async () => {
  const input = await fixture(`process-crash-${privateReply}`, "instagram", privateReply), queued = await queue(input), before = calls;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/chat-outbound-crash-worker.mts", queued.jobId], { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", c => output += c); child.stderr.on("data", c => output += c);
    child.on("error", reject); child.on("close", code => { try { assert.equal(code, 71, output); resolve(); } catch (error) { reject(error); } });
  });
  const lockId = createChatOutboundFingerprint(["chat-outbound-lock-v1", tenantId, input.chatId]).slice(0,48);
  await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).update({ leaseUntil: new Date(0), dueAt: new Date(0) });
  await adminDb.collection("chat_outbound_locks").doc(lockId).update({ leaseUntil: new Date(0) });
  assert.equal((await resumeSocialReply({ tenantId, logId: input.reply.logId })).status, "pending_confirmation");
  assert.equal(calls, before); assert.equal((await adminDb.collection("qa_test_provider_calls").doc(queued.jobId).get()).exists, true);
});

test("a second webhook cannot acquire a live preparation claim", async () => {
  const input = await fixture("live-claim"), before = calls;
  const sourceId = `${tenantId}_instagram_${input.reply.eventId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0,240);
  const source = (await adminDb.collection("social_automation_logs").doc(input.reply.logId).get()).data()!;
  await adminDb.collection("social_automation_logs").doc(sourceId).set(source);
  const result = await handleMetaSocialEvent({ tenantId, channel: { id: input.reply.channelId, tenantId, type: "instagram", provider: "instagram", accessToken: "qa-token-instagram", externalAccountId: input.reply.accountId },
    event: { eventId: input.reply.eventId, eventType: "comment", channelType: "instagram", entryId: input.reply.accountId, actorId: input.reply.actorId,
      actorName: "QA", actorUsername: "qa", text: "Ola", commentId: input.reply.commentId, postId: input.reply.postId, timestamp: null, field: "comments" } });
  assert.equal(result.status, "ignored_duplicate"); assert.equal(calls, before);
});

test("same comment cannot target a new chat or replace its accepted payload", async () => {
  const input = await fixture("same-comment"), before = calls;
  const first = await deliverSocialReply(input);
  const repeated = await deliverSocialReply({ ...input, chatId: "qa-does-not-exist", reply: { ...input.reply, text: "Outro texto", mode: "private_comment" } });
  assert.equal(first.jobId, repeated.jobId); assert.equal(repeated.chatId, input.chatId); assert.equal(calls, before+1);
});

test("independent comment ledger prevents recreation after accepted job removal even for another event/chat", async () => {
  const input = await fixture("tombstone"), queued = await queue(input), before = calls;
  await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).delete();
  await assert.rejects(deliverSocialReply({ ...input, chatId: "different-chat", reply: { ...input.reply, logId: "new-log", eventId: "new-event" } }), /removida/);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).exists, false); assert.equal(calls, before);
});

test("manual retry can resume only a verified pre-provider failure using the frozen payload", async () => {
  const input = await fixture("safe-manual-retry"), queued = await queue(input), before = calls;
  await adminDb.collection("social_automations").doc(tenantId).update({ enabled: false });
  await processChatOutboundJobs({ jobId: queued.jobId });
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.status, "dead_letter"); assert.equal(calls, before);
  await adminDb.collection("social_automations").doc(tenantId).update({ enabled: true });
  const result = await retrySocialAutomationLog({ tenantId, logId: input.reply.logId, actorId: "qa", actorName: "QA" });
  assert.equal(result.status, "sent"); assert.equal(calls, before+1);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.manualReprocessCount, 1);
  assert.equal((await retrySocialAutomationLog({ tenantId, logId: input.reply.logId, actorId: "qa", actorName: "QA" })).status, "sent"); assert.equal(calls, before+1);
});

test("early read status is never downgraded by private reply acknowledgement", async () => {
  const input = await fixture("early-read", "instagram", true); earlyRead = true;
  try { assert.equal((await deliverSocialReply(input)).status, "sent"); } finally { earlyRead = false; }
  const message = (await adminDb.collection("messages").doc(socialReplyIdentity(tenantId, input.reply).messageId).get()).data()!;
  assert.equal(message.deliveryStatus, "read"); assert.equal(message.status, "read"); assert.ok(message.metaMessageId);
});

test("expired preparation token cannot accept a reply", async () => {
  const input = await fixture("expired-claim"), before = calls;
  await adminDb.collection("social_automation_logs").doc(input.reply.logId).update({ claimUntil: new Date(0) });
  await assert.rejects(deliverSocialReply(input), /Posse/); assert.equal(calls, before);
  assert.equal((await adminDb.collection("social_reply_deliveries").doc(socialReplyIdentity(tenantId, input.reply).jobId).get()).exists, false);
});

test("a completed job without the same source and ledger receipt is never reported sent", async () => {
  const input = await fixture("receipt-mismatch"), before = calls;
  assert.equal((await deliverSocialReply(input)).status, "sent");
  await adminDb.collection("social_reply_deliveries").doc(socialReplyIdentity(tenantId, input.reply).jobId).update({ externalMessageId: "other-receipt" });
  assert.equal((await resumeSocialReply({ tenantId, logId: input.reply.logId })).status, "pending_confirmation"); assert.equal(calls, before+1);
});

test("general comment automation also freezes its accepted response without a rule", async () => {
  const input = await fixture("general"); input.reply.ruleId = ""; input.reply.ruleFingerprint = "";
  await adminDb.collection("social_automations").doc(tenantId).update({ commentRules: [] });
  assert.equal((await deliverSocialReply(input)).status, "sent");
});
