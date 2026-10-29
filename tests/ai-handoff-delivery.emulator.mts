import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { pauseForAiHandoff, deliverAiHandoffAcknowledgement, deliverAiHandoffAlert, HandoffAlertPendingError, HandoffPauseConflictError } = await import("../lib/server/ai/handoff-delivery.ts");
const { deliverAiConversationText } = await import("../lib/server/ai/text-delivery.ts");
const { processChatOutboundJobs, queueTenantHandoffAcknowledgement } = await import("../lib/server/chat-outbound.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenantId = `qa_handoff_${Date.now()}`, whatsappChannelId = `${tenantId}_whatsapp`;
const originalFetch = globalThis.fetch;
let alerts = 0, acknowledgements = 0, loseAlert = false, loseAck = false, omitAckId = false;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com");
  const payload = JSON.parse(String(options?.body));
  if (target.pathname.endsWith("/qa-handoff-number/messages")) {
    assert.equal(payload.type, "text");
    if (payload.to === "5511000000071" || payload.to === "5511000000072") {
      const working = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
      const job = working.docs.find(row => row.data().kind === "handoff_alert" && row.data().recipientPhone === payload.to);
      assert.ok(job?.data().providerAttemptStartedAt); assert.equal(job.data().messageId, null);
      alerts++; if (loseAlert && payload.to === "5511000000071") throw new Error("simulated lost internal alert acknowledgement");
    } else { assert.equal(payload.to, "5511000000070"); acknowledgements++; if (loseAck) throw new Error("simulated lost lead acknowledgement"); }
    return Response.json({ messages: omitAckId && payload.to === "5511000000070" ? [] : [{ id: `wamid.qa-handoff-${alerts}-${acknowledgements}` }] });
  }
  assert.match(target.pathname, /\/me\/messages$/); assert.equal(payload.recipient.id, "qa-lead-recipient");
  acknowledgements++; if (loseAck) throw new Error("simulated lost social handoff acknowledgement");
  return Response.json({ message_id: `mid.qa-handoff-${acknowledgements}` });
};
await adminDb.collection("tenant_channels").doc(whatsappChannelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-handoff-number", accessToken: "qa-only" });
async function fixture(name: string, channel: "whatsapp" | "instagram" | "messenger" | "site_chat" = "whatsapp") {
  const chatId = `${tenantId}_${name}`, channelId = channel === "whatsapp" ? whatsappChannelId : `${tenantId}_${channel}`;
  if (["instagram", "messenger"].includes(channel)) await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: channel, status: "active", accessToken: `qa-${channel}`, externalAccountId: `qa-account-${channel}` });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel, channelId, channelExternalAccountId: `qa-account-${channel}`,
    contactExternalId: "qa-lead-recipient", contactPhone: "5511000000070", lastClientMessageAt: new Date(), lastMessage: "Original", assignedTo: "qa-human-owner" });
  const stateRef = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));
  await stateRef.set({ tenantId, chatId, aiEnabled: true, humanOwnerUserId: null });
  await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)).set({ tenantId, chatId, latestMessageId: "qa-source-001" });
  return { tenantId, chatId, sourceMessageId: "qa-source-001", text: "Registrei seu pedido para atendimento humano.", agentName: "Assistente QA", stateRef };
}
const pending = /entrega ainda nao foi confirmada/;
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "tenant_channels", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get(); await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  await adminDb.terminate();
});
test("one scoped acknowledgement is permitted under its own handoff pause, without unpausing or duplicating the system notice", async () => {
  const input = await fixture("owned"); const authorization = await pauseForAiHandoff(input); assert.ok(authorization);
  assert.deepEqual(await pauseForAiHandoff(input), authorization);
  const before = acknowledgements;
  const first = await deliverAiHandoffAcknowledgement({ ...input, authorization });
  assert.equal((await deliverAiHandoffAcknowledgement({ ...input, authorization })).messageId, first.messageId); assert.equal(acknowledgements, before + 1);
  const state = (await input.stateRef.get()).data()!; assert.equal(state.aiEnabled, false); assert.equal(state.humanOwnerUserId, "qa-human-owner");
  assert.equal(state.handoffPauseToken, authorization.token); assert.equal(state.pausedUntil.toMillis(), authorization.pausedUntilMs);
  const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.size, 2); assert.equal(messages.docs.filter(row => row.data().sender === "system").length, 1);
  assert.equal((await adminDb.collection("chats").doc(input.chatId).get()).data()?.lastMessage, input.text);
  await assert.rejects(deliverAiConversationText({ ...input, slot: "primary", text: "Resposta normal bloqueada" }), pending);
  await assert.rejects(deliverAiConversationText({ ...input, slot: "primary", handoffAckAuthorization: authorization }), /restrita/);
});
test("human takeover/resume, changed owner/deadline or newer source revoke an acknowledgement queued behind another operation", async () => {
  for (const mode of ["takeover", "resume", "owner", "deadline", "source"] as const) {
    const input = await fixture(mode), authorization = await pauseForAiHandoff(input); assert.ok(authorization); const before = acknowledgements;
    const predecessorId = `${input.chatId}_predecessor`;
    await adminDb.collection("chat_outbound_jobs").doc(predecessorId).set({ tenantId, chatId: input.chatId, status: "ready" });
    await adminDb.collection("chats").doc(input.chatId).update({ outboundTailJobId: predecessorId });
    await assert.rejects(deliverAiHandoffAcknowledgement({ ...input, authorization }), pending);
    const rows = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    const ack = rows.docs.find(row => row.id !== predecessorId)!;
    if (mode === "takeover") await input.stateRef.update({ updatedBy: "qa-human", pauseReason: "human_takeover" });
    if (mode === "resume") await input.stateRef.update({ updatedBy: "qa-human", aiEnabled: true, pausedUntil: null, pauseReason: null });
    if (mode === "owner") await input.stateRef.update({ humanOwnerUserId: "qa-other-human" });
    if (mode === "deadline") await input.stateRef.update({ pausedUntil: new Date(authorization.pausedUntilMs + 60000) });
    if (mode === "source") await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, input.chatId)).update({ latestMessageId: "qa-source-newer" });
    assert.equal(await pauseForAiHandoff(input), null, mode);
    await adminDb.collection("chat_outbound_jobs").doc(predecessorId).update({ status: "completed" });
    assert.equal((await processChatOutboundJobs({ jobId: ack.id })).results[0]?.status, "dead_letter"); assert.equal(acknowledgements, before);
  }
});
test("preexisting manual pause is never replaced to force a handoff acknowledgement", async () => {
  const input = await fixture("manual"); await input.stateRef.update({ aiEnabled: false, pauseReason: "manual_pause", updatedBy: "qa-human", pausedUntil: new Date(Date.now() + 60000) });
  const before = (await input.stateRef.get()).data(); assert.equal(await pauseForAiHandoff(input), null); assert.deepEqual((await input.stateRef.get()).data(), before);
  await assert.rejects(queueTenantHandoffAcknowledgement(input), HandoffPauseConflictError);
  assert.deepEqual((await input.stateRef.get()).data(), before);
});
test("production handoff accepts pause, message and task atomically and concurrent callers reuse the winning authorization", async () => {
  const input = await fixture("atomic"), before = acknowledgements;
  const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => deliverAiHandoffAcknowledgement({ ...input, authorizePause: true })));
  assert.ok(attempts.some(row => row.status === "fulfilled"));
  for (const row of attempts) if (row.status === "rejected") assert.match(String(row.reason?.message), pending);
  const sent = await deliverAiHandoffAcknowledgement({ ...input, authorizePause: true }); assert.equal(acknowledgements, before + 1);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(sent.jobId).get()).data()!, state = (await input.stateRef.get()).data()!;
  assert.equal(state.aiEnabled, false); assert.deepEqual(state.handoffAckAuthorization, job.handoffAckAuthorization);
  assert.equal(state.handoffPauseToken, job.handoffAckAuthorization.token);
  await assert.rejects(deliverAiHandoffAcknowledgement({ ...input, authorizePause: true, text: "Changed" }), /outro conteudo/);
});
test("an uncommitted handoff batch leaves neither a paused assistant nor a phantom acknowledgement", async () => {
  const input = await fixture("atomic_failure"), original = adminDb.batch.bind(adminDb);
  const hook = mock.method(adminDb, "batch", () => { const batch = original(); batch.commit = async () => { throw new Error("simulated uncommitted handoff batch"); }; return batch; });
  try { await assert.rejects(queueTenantHandoffAcknowledgement(input), /uncommitted/); } finally { hook.mock.restore(); }
  assert.equal((await input.stateRef.get()).data()?.aiEnabled, true);
  assert.equal((await input.stateRef.get()).data()?.handoffPauseToken, undefined);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  await deliverAiHandoffAcknowledgement({ ...input, authorizePause: true });
});
test("human pause racing the atomic commit invalidates the whole acknowledgement and preserves manual control", async () => {
  const input = await fixture("atomic_manual_race"), original = adminDb.batch.bind(adminDb); let intervened = false; const failures: number[] = [];
  const hook = mock.method(adminDb, "batch", () => {
    const batch = original(), commit = batch.commit.bind(batch);
    batch.commit = async () => {
      if (!intervened) { intervened = true; await input.stateRef.update({ aiEnabled: false, pauseReason: "manual_pause", updatedBy: "qa-human" }); }
      try { return await commit(); } catch (error) { failures.push(Number((error as { code?: number }).code)); throw error; }
    }; return batch;
  });
  try { await assert.rejects(queueTenantHandoffAcknowledgement(input), HandoffPauseConflictError); } finally { hook.mock.restore(); }
  assert.ok(failures.includes(9), "the actual Firestore version precondition must reject the batch");
  assert.equal((await input.stateRef.get()).data()?.updatedBy, "qa-human");
  assert.equal((await input.stateRef.get()).data()?.handoffPauseToken, undefined);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
});
test("Instagram, Messenger and site handoff confirmations retain the existing channel and a single message", async () => {
  for (const channel of ["instagram", "messenger", "site_chat"] as const) {
    const input = await fixture(channel, channel), authorization = await pauseForAiHandoff(input); assert.ok(authorization);
    const before = acknowledgements, first = await deliverAiHandoffAcknowledgement({ ...input, authorization });
    await deliverAiHandoffAcknowledgement({ ...input, authorization }); assert.equal(acknowledgements, before + (channel === "site_chat" ? 0 : 1));
    assert.equal((await adminDb.collection("messages").doc(first.messageId).get()).data()?.channel, channel);
  }
});
test("responsible alerts are durable and independent, never creating lead messages, CRM observations or a customer outbound dependency", async () => {
  const input = await fixture("alerts"); const before = alerts;
  const request = { ...input, text: "Resumo interno QA", channelId: whatsappChannelId, phoneNumberId: "qa-handoff-number", recipientPhone: "5511000000071" };
  const first = await deliverAiHandoffAlert(request); assert.equal((await deliverAiHandoffAlert(request)).jobId, first.jobId); assert.equal(alerts, before + 1);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  assert.equal((await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  const chat = (await adminDb.collection("chats").doc(input.chatId).get()).data()!; assert.equal(chat.lastMessage, "Original"); assert.equal(chat.outboundTailJobId, undefined); assert.equal(chat.outboundSequence, undefined);
  assert.equal((await input.stateRef.get()).data()?.aiEnabled, true);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(first.jobId).get()).data()?.messageId, null);
});
test("uncertain alert does not resend or block the customer acknowledgement; other recipients remain independent", async () => {
  const input = await fixture("unknown_alert"), before = alerts;
  const request = { ...input, text: "Resumo interno QA", channelId: whatsappChannelId, phoneNumberId: "qa-handoff-number", recipientPhone: "5511000000071" };
  loseAlert = true;
  try {
    await assert.rejects(deliverAiHandoffAlert(request), HandoffAlertPendingError); await assert.rejects(deliverAiHandoffAlert(request), HandoffAlertPendingError);
    assert.equal(alerts, before + 1); await deliverAiHandoffAlert({ ...request, recipientPhone: "5511000000072" }); assert.equal(alerts, before + 2);
    const authorization = await pauseForAiHandoff(input); assert.ok(authorization);
    await deliverAiHandoffAcknowledgement({ ...input, authorization });
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.docs.filter(row => row.data().status === "reconciliation_required").length, 1);
    assert.equal(jobs.docs.filter(row => row.data().status === "completed").length, 2);
  } finally { loseAlert = false; }
});
test("lost customer acknowledgement never creates another message or a false completed system notice", async () => {
  const input = await fixture("unknown_ack"), authorization = await pauseForAiHandoff(input), before = acknowledgements; assert.ok(authorization); loseAck = true;
  try {
    await assert.rejects(deliverAiHandoffAcknowledgement({ ...input, authorization }), pending); await assert.rejects(deliverAiHandoffAcknowledgement({ ...input, authorization }), pending);
    assert.equal(acknowledgements, before + 1);
    const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(messages.size, 1); assert.equal(messages.docs[0].data().status, "pending_confirmation");
  } finally { loseAck = false; }
});
test("success without customer message ID is not a completed acknowledgement and cannot be resent", async () => {
  const input = await fixture("missing_id"), before = acknowledgements; omitAckId = true;
  try {
    await assert.rejects(deliverAiHandoffAcknowledgement({ ...input, authorizePause: true }), pending);
    await assert.rejects(deliverAiHandoffAcknowledgement({ ...input, authorizePause: true }), pending);
    assert.equal(acknowledgements, before + 1);
  } finally { omitAckId = false; }
});
test("handoff source contract no longer invokes providers directly and distinguishes unconfirmed alerts", async () => {
  const source = await readFile("lib/server/ai/agent.ts", "utf8"), branch = source.slice(source.indexOf('if (choice.decision === "handoff"'), source.indexOf("const voiceReplyDecision"));
  assert.match(branch, /deliverAiHandoffAlert/); assert.match(branch, /authorizePause: handoffNotifySuccessCount > 0 \|\| handoffTaskRecorded/); assert.match(branch, /deliverAiHandoffAcknowledgement/);
  assert.match(branch, /HandoffAlertPendingError/); assert.match(branch, /pending_confirmation/);
  assert.doesNotMatch(source, /getWhatsAppMessagingProvider|sendMetaConversationText|sendMetaConversationMedia/);
});
