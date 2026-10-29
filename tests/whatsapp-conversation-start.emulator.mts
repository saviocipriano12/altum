import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import type { TenantMembership } from "../lib/server/tenant.ts";
import type { WhatsAppChannelConfig } from "../app/lib/server/whatsapp-channel.ts";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { startTenantWhatsAppConversation: start } = await import("../lib/server/whatsapp-conversation-start.ts");
const { whatsappChatIdentityId, resolveCanonicalWhatsAppChat } = await import("../lib/server/whatsapp-chat-identity.ts");
const tenantId = `qa_start_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const user = { uid: "qa-start-owner", name: "Operador ficticio" };
const membership: TenantMembership = { id: "qa-start-membership", tenantId, userId: user.uid, role: "client_owner", status: "active", isDefault: true, capabilities: ["respond_inbox"] };
const channel: WhatsAppChannelConfig = { id: `channel_${tenantId}`, tenantId, source: "tenant_channel", provider: "evolution",
  phoneNumberId: "qa-number-only", accessToken: "qa-not-a-real-token", channelScope: "shared" };
const leadId = `lead_${tenantId}`;
const phone = "5511988880001";
const input = { tenantId, user, membership, channel };
before(async () => {
  await adminDb.collection("leads").doc(leadId).set({ tenantId, telefone: phone, nome: "Lead ficticio", ownerId: user.uid });
  await adminDb.collection("tenant_channels").doc(channel.id).set({ tenantId, channelScope: "shared", type: "whatsapp", status: "active" });
});
after(async () => {
  const leads = await adminDb.collection("leads").where("tenantId", "==", tenantId).get();
  for (const lead of leads.docs) {
    const events = await lead.ref.collection("events").get();
    await Promise.all(events.docs.map((event) => event.ref.delete()));
  }
  for (const collection of ["chats", "chat_identities", "leads", "messages", "chat_outbound_jobs", "chat_outbound_locks", "chat_state", "tenant_channels", "tenant_settings", "crm_observation_jobs", "crm_conversation_observations", "lead_tasks", "ai_logs", "audit_logs", "whatsapp_delivery_events"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("20 starts of the same lead create one canonical chat and one durable outbound operation", async () => {
  const settled = await Promise.allSettled(Array.from({ length: 20 }, () => start({ ...input, body: { leadId, text: "Ola QA", clientRequestId: "start-concurrent-0001" } })));
  const failures = settled.flatMap((result) => result.status === "rejected" ? [{
    stage: result.reason?.whatsappStartStage || "unknown", code: result.reason?.code,
    message: result.reason instanceof Error ? result.reason.message : "Unknown failure",
  }] : []);
  assert.equal(failures.length, 0, JSON.stringify(failures));
  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  assert.equal(new Set(results.map((result) => result.chatId)).size, 1);
  assert.equal(new Set(results.map((result) => "jobId" in result ? result.jobId : null)).size, 1);
  assert.equal(results.every((result) => result.requiresTemplate === false), true);
  for (const collection of ["chats", "messages", "chat_outbound_jobs"]) {
    assert.equal((await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).size, 1);
  }
  const job = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).docs[0].data();
  assert.equal(job.status, "ready"); assert.equal(job.attempts, 0);
});
test("lost acknowledgement replay returns the same job and changed text conflicts", async () => {
  await start({ ...input, body: { leadId, text: "Ola QA", clientRequestId: "start-concurrent-0001" } });
  const result = await start({ ...input, body: { leadId, text: "Ola QA", clientRequestId: "start-concurrent-0001" } });
  assert.equal("replayed" in result && result.replayed, true);
  await assert.rejects(start({ ...input, body: { leadId, text: "Outro texto", clientRequestId: "start-concurrent-0001" } }), /outro conteudo/);
});
test("Meta preparation creates no text job, and a replay after opening the service window queues once", async () => {
  const meta = { ...channel, id: `meta_${tenantId}`, provider: "meta_whatsapp" };
  await adminDb.collection("tenant_channels").doc(meta.id).set({ ...meta, type: "whatsapp", status: "active" });
  const body = { leadId, text: "Rascunho que exige template", clientRequestId: "start-meta-0001" };
  const prepared = await start({ ...input, channel: meta, body });
  assert.notEqual(prepared.chatId, whatsappChatIdentityId({ tenantId, channelId: channel.id, phone }));
  assert.equal(prepared.requiresTemplate, true); assert.equal("jobId" in prepared, false);
  assert.equal((await adminDb.collection("messages").where("chatId", "==", prepared.chatId).get()).size, 0);
  await adminDb.collection("chats").doc(prepared.chatId).set({ requiresTemplate: false, lastClientMessageAt: new Date() }, { merge: true });
  const queued = await start({ ...input, channel: meta, body });
  assert.equal(queued.requiresTemplate, false); assert.ok("jobId" in queued);
  await adminDb.collection("chats").doc(prepared.chatId).set({ requiresTemplate: true }, { merge: true });
  const replay = await start({ ...input, channel: meta, body });
  assert.equal(replay.requiresTemplate, false);
  assert.equal("jobId" in replay && replay.jobId, "jobId" in queued && queued.jobId);
});
test("legacy phone-only input cannot enqueue into another seller's chat", async () => {
  const agent = { ...membership, role: "client_agent" as const };
  const chatId = whatsappChatIdentityId({ tenantId, channelId: channel.id, phone });
  await adminDb.collection("chats").doc(chatId).set({ ownerId: "another-seller", assignedTo: "another-seller" }, { merge: true });
  const beforeCount = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count;
  await assert.rejects(start({ ...input, membership: agent, body: { to: phone, text: "Nao permitido", clientRequestId: "start-denied-0001" } }), /outro vendedor/);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count, beforeCount);
});
test("channel mismatch, foreign tenant and invalid IDs are rejected before dispatch", async () => {
  const chatId = whatsappChatIdentityId({ tenantId, channelId: channel.id, phone });
  await assert.rejects(start({ ...input, channel: { ...channel, id: "other-channel" }, body: { chatId, text: "QA", clientRequestId: "start-mismatch-0001" } }), /outro canal/);
  await assert.rejects(start({ ...input, channel: { ...channel, tenantId: "other-tenant" }, body: { to: phone, text: "QA", clientRequestId: "start-tenant-0001" } }), /fora desta empresa/);
  await assert.rejects(start({ ...input, body: { to: phone, text: "QA", clientRequestId: "!" } }), /Identificacao/);
});
test("corrupted canonical mapping never targets a foreign tenant or another channel", async () => {
  const otherPhone = "5511988880002";
  const identity = whatsappChatIdentityId({ tenantId, channelId: channel.id, phone: otherPhone });
  const otherChat = `corrupt_${tenantId}`;
  await adminDb.collection("chats").doc(otherChat).set({ tenantId, channelId: "another-channel", contactPhone: otherPhone, ownerId: user.uid });
  await adminDb.collection("chat_identities").doc(identity).set({ tenantId, chatId: otherChat });
  await assert.rejects(start({ ...input, body: { to: otherPhone, text: "QA", clientRequestId: "start-corrupt-0001" } }), /outra empresa, canal ou contato/);
});

test("legacy inbound resolution stays compatible without guessing a channel for an outbound start", async () => {
  const legacyPhone = "5511988880003", legacyId = `legacy_${tenantId}`;
  await adminDb.collection("chats").doc(legacyId).set({ tenantId, contactPhone: legacyPhone, ownerId: user.uid });
  const incoming = await resolveCanonicalWhatsAppChat({ tenantId, channelId: "incoming-channel", phone: legacyPhone,
    createData: { tenantId, contactPhone: legacyPhone, channelId: "incoming-channel" } });
  assert.equal(incoming.chatRef.id, legacyId);
  const outgoing = await start({ ...input, body: { to: legacyPhone, text: "Canal explicito QA", clientRequestId: "start-exact-channel-0001" } });
  assert.notEqual(outgoing.chatId, legacyId);
  assert.equal((await adminDb.collection("chats").doc(legacyId).get()).data()?.channelId, undefined);
});

test("personal channels of another seller and lead/phone mismatches do not create jobs", async () => {
  const beforeCount = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count;
  await assert.rejects(start({ ...input, membership: { ...membership, role: "client_agent" },
    channel: { ...channel, channelScope: "personal", ownerUserId: "other-seller" },
    body: { to: phone, text: "Nao permitido", clientRequestId: "start-personal-denied-0001" } }), /outro vendedor/);
  await assert.rejects(start({ ...input, body: { leadId, to: "5511988880099", text: "Outro telefone", clientRequestId: "start-phone-mismatch-0001" } }), /difere do cliente/);
  await assert.rejects(start({ ...input, body: { to: "123456@g.us", text: "Grupo", clientRequestId: "start-group-denied-0001" } }), /grupo/);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count, beforeCount);
});

test("a lead phone changed after an uncertain start cannot create a second outbound operation", async () => {
  const beforeCount = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count;
  const beforeChats = (await adminDb.collection("chats").where("tenantId", "==", tenantId).count().get()).data().count;
  await adminDb.collection("leads").doc(leadId).set({ telefone: "5511988880098" }, { merge: true });
  const replay = await start({ ...input, body: { leadId, text: "Ola QA", clientRequestId: "start-concurrent-0001" } });
  assert.equal("replayed" in replay && replay.replayed, true);
  assert.equal(replay.chatId, whatsappChatIdentityId({ tenantId, channelId: channel.id, phone }));
  await assert.rejects(start({ ...input, body: { leadId, to: "5511988880098", text: "Ola QA", clientRequestId: "start-concurrent-0001" } }), /outro conteudo/);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count, beforeCount);
  assert.equal((await adminDb.collection("chats").where("tenantId", "==", tenantId).count().get()).data().count, beforeChats);
});

async function verifyLeadStartDispatch(earlyStatus?: "read" | "delivered") {
  const externalMessageId = `wamid.qa-simulated-start-${earlyStatus || "sent"}`;
  const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
  const { crmObservationJobId } = await import("../lib/server/crm/conversation-observation-queue.ts");
  const meta = { ...channel, id: `dispatch_${earlyStatus || "sent"}_${tenantId}`, provider: "meta_whatsapp", phoneNumberId: "qa-dispatch-number" };
  const dispatchLeadId = `dispatch_lead_${earlyStatus || "sent"}_${tenantId}`;
  await Promise.all([
    adminDb.collection("tenant_channels").doc(meta.id).set({ ...meta, type: "whatsapp", status: "active" }),
    adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId }),
    adminDb.collection("leads").doc(dispatchLeadId).set({ tenantId, nome: "Lead QA dispatch", telefone: "5511000000097", ownerId: user.uid }),
  ]);
  const body = { leadId: dispatchLeadId, text: "Enviei a proposta comercial para voce", clientRequestId: "start-dispatch-crm-0001" };
  const prepared = await start({ ...input, channel: meta, body });
  assert.equal(prepared.requiresTemplate, true);
  await adminDb.collection("chats").doc(prepared.chatId).update({ requiresTemplate: false, lastClientMessageAt: new Date() });
  const queued = await start({ ...input, channel: meta, body });
  assert.ok("jobId" in queued);
  if (!("jobId" in queued)) throw new Error("Missing job");
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async (url, options) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (target.hostname === "127.0.0.1" || target.hostname === "localhost") return originalFetch(url, options);
    // Never forward external traffic, including on failed assertions.
    assert.equal(target.hostname, "graph.facebook.com");
    assert.match(target.pathname, /^\/v\d+\.\d+\/qa-dispatch-number\/messages$/);
    assert.equal(options?.method, "POST");
    assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${meta.accessToken}`);
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.to, "5511000000097");
    assert.equal(payload.type, "text");
    assert.equal(payload.text.body, body.text);
    providerCalls += 1;
    if (earlyStatus) await adminDb.collection("messages").doc(queued.messageId).update({
      status: earlyStatus, deliveryStatus: earlyStatus, metaMessageId: externalMessageId,
      deliveryAt: new Date(1234567890000),
    });
    return Response.json({ messaging_product: "whatsapp", messages: [{ id: externalMessageId }] });
  };
  try {
    const result = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
    assert.equal(result.results[0]?.status, "sent", JSON.stringify(result.results));
    const [job, message, crmJob, receipt, lead] = await Promise.all([
      adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get(),
      adminDb.collection("messages").doc(queued.messageId).get(),
      adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(tenantId, queued.messageId)).get(),
      adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", queued.messageId).get().then(snapshot => snapshot.docs[0]),
      adminDb.collection("leads").doc(dispatchLeadId).get(),
    ]);
    assert.equal(job.data()?.status, "completed");
    assert.equal(message.data()?.status, earlyStatus || "sent");
    assert.equal(message.data()?.deliveryStatus, earlyStatus || "sent");
    if (earlyStatus) assert.equal(message.data()?.deliveryAt.toMillis(), 1234567890000);
    assert.equal(message.data()?.deliveryError, "");
    assert.equal(message.data()?.deliveryErrorCode, "");
    assert.equal(message.data()?.metaMessageId, externalMessageId);
    assert.equal(crmJob.data()?.status, "completed");
    assert.equal(crmJob.data()?.source, "human_outbound");
    assert.equal(receipt.data()?.status, "completed");
    assert.equal(lead.data()?.aiLastConversationMessageId, queued.messageId);
    const observedEvents = await adminDb.collection("leads").doc(dispatchLeadId).collection("events").where("evidenceMessageId", "==", queued.messageId).where("type", "==", "crm_conversation_observed").get();
    assert.equal(observedEvents.size, 1);
    const historySize = (await adminDb.collection("leads").doc(dispatchLeadId).collection("events").get()).size;
    const replay = await start({ ...input, channel: meta, body });
    assert.equal("jobId" in replay && replay.jobId, queued.jobId);
    const repeatedWorker = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
    assert.equal(repeatedWorker.results[0]?.status, "skipped");
    assert.equal(providerCalls, 1);
    assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", queued.chatId).get()).size, 1);
    assert.equal((await adminDb.collection("leads").doc(dispatchLeadId).collection("events").get()).size, historySize);
  } finally { globalThis.fetch = originalFetch; }
}

test("lead start reaches worker and CRM exactly once with a simulated Meta transport", () => verifyLeadStartDispatch());
test("worker acknowledgement cannot downgrade an early read receipt", () => verifyLeadStartDispatch("read"));
test("worker acknowledgement cannot downgrade an early delivered receipt", () => verifyLeadStartDispatch("delivered"));

test("acknowledgement preserves provider failure and refuses a foreign tenant or chat", async () => {
  const { persistChatMessageAcknowledgement: persist } = await import("../lib/server/chat-message-acknowledgement.ts");
  const ref = adminDb.collection("messages").doc(`ack_scope_${tenantId}`);
  const chatId = `ack_chat_${tenantId}`, otherChatId = `ack_other_${tenantId}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp" });
  await adminDb.collection("chats").doc(otherChatId).set({ tenantId, channel: "whatsapp" });
  const original = { tenantId, chatId, status: "failed", deliveryStatus: "failed",
    metaMessageId: "qa-provider-ack", deliveryError: "Recusa ficticia", deliveryErrorCode: "qa-code" };
  await ref.set(original);
  const acknowledgement = { tenantId, chatId, status: "sent", deliveryStatus: "sent",
    metaMessageId: "qa-provider-ack", deliveryError: "", deliveryErrorCode: "" };
  await persist(ref, acknowledgement, { merge: true });
  assert.deepEqual((await ref.get()).data(), original);
  await assert.rejects(persist(ref, { ...acknowledgement, tenantId: "other-tenant" }, { merge: true }), /empresa|conversa/);
  await assert.rejects(persist(ref, { ...acknowledgement, chatId: otherChatId }, { merge: true }), /empresa|conversa/);
  await assert.rejects(persist(ref, { ...acknowledgement, chatId: `missing_${tenantId}` }, { merge: true }), /manifesto|exclusao|conversa/);
  assert.deepEqual((await ref.get()).data(), original);
});

test("start stage diagnosis preserves the original SDK error without retrying it", async () => {
  const expected = Object.assign(new Error("QA simulated transaction lock timeout"), { code: 10 });
  const transaction = mock.method(adminDb, "runTransaction", () => Promise.reject(expected));
  try {
    await assert.rejects(start({ ...input, body: { to: "5511000000088", text: "QA diagnostic only", clientRequestId: "start-diagnostic-0001" } }),
      (error: unknown) => error === expected && expected.code === 10 && "whatsappStartStage" in expected && expected.whatsappStartStage === "canonical_chat");
    assert.equal(transaction.mock.callCount(), 1);
  } finally { transaction.mock.restore(); }
});

test("start stage diagnosis never masks a frozen SDK error", async () => {
  const expected = Object.freeze(Object.assign(new Error("QA immutable SDK failure"), { code: 10 }));
  const transaction = mock.method(adminDb, "runTransaction", () => Promise.reject(expected));
  try {
    await assert.rejects(start({ ...input, body: { to: "5511000000089", text: "QA immutable diagnostic", clientRequestId: "start-diagnostic-frozen-0001" } }),
      (error: unknown) => error === expected);
    assert.equal(transaction.mock.callCount(), 1);
  } finally { transaction.mock.restore(); }
});
