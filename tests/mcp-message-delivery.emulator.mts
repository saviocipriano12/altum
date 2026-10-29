import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deliverApprovedMcpMessage, McpMessageDeliveryPendingError, McpMessageDeliveryBlockedError } = await import("../lib/server/mcp/message-delivery.ts");
const { mcpMessageFingerprint, mcpMessageRequestId } = await import("../lib/server/mcp/message-approval.ts");
const { queueTenantChatText, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenantId = `qa_mcp_messages_${Date.now()}`, channelId = `${tenantId}_channel`;
let calls = 0, unknown = false, omitId = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, init);
  assert.equal(target.hostname, "graph.facebook.com");
  assert.match(target.pathname, /\/(?:qa-mcp-number|me)\/messages$/);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.equal(jobs.size, 1); const job = jobs.docs[0].data(); assert.ok(job.providerAttemptStartedAt);
  const draft = (await adminDb.collection("mcp_action_drafts").doc(job.mcpApproval.draftId).get()).data()!;
  assert.equal(draft.status, "applying"); assert.equal(draft.messageDelivery.jobId, jobs.docs[0].id);
  const payload = JSON.parse(String(init?.body));
  if (target.pathname.endsWith("/me/messages")) { assert.equal(payload.recipient.id, "qa-mcp-social-recipient"); assert.equal(typeof payload.message.text, "string"); }
  else assert.ok(["text", "template"].includes(payload.type));
  calls++; if (unknown) throw new Error("simulated lost MCP message acknowledgement");
  return target.pathname.endsWith("/me/messages") ? Response.json(omitId ? {} : { message_id: `mid.qa-mcp-${calls}` })
    : Response.json({ messages: omitId ? [] : [{ id: `wamid.qa-mcp-${calls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-mcp-number", accessToken: "qa-only" });
async function fixture(name: string, template = false, local = false) {
  const chatId = `${tenantId}_${name}_chat`, draftId = `${tenantId}_${name}_draft`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: local ? "site_chat" : "whatsapp", channelId,
    leadId: "qa-lead", contactPhone: "5511000000083", lastClientMessageAt: new Date() });
  const draft = { tenantId, type: template ? "start_whatsapp_conversation" : "send_or_reply_conversation", status: "approved_pending_apply",
    proposedChange: template ? { leadId: "qa-lead", channelId, templateName: "qa_welcome", templateLanguage: "pt_BR", templateParams: ["Cliente QA"], displayText: "Bem-vindo, Cliente QA" }
      : { conversationId: chatId, text: "Mensagem aprovada QA" } };
  await adminDb.collection("mcp_action_drafts").doc(draftId).set(draft);
  return { tenantId, draftId, chatId, approvedFingerprint: mcpMessageFingerprint(draft), actor: { id: "qa-approver", name: "Gestor QA" } };
}
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["mcp_action_drafts", "messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "tenant_channels", "crm_observation_jobs", "audit_logs", "qa_test_provider_calls"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  await adminDb.terminate();
});

for (const template of [false, true]) test(`approved message and draft are atomically accepted, replay returns one receipt/audit (template=${template})`, async () => {
  const input = await fixture(`accepted-${template}`, template), before = calls;
  await Promise.allSettled(Array.from({ length: 5 }, () => deliverApprovedMcpMessage(input)));
  const result = await deliverApprovedMcpMessage(input);
  assert.equal(calls, before + 1);
  assert.deepEqual(await deliverApprovedMcpMessage(input), result);
  const draft = (await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()!;
  assert.equal(draft.status, "applied"); assert.equal(draft.application.localMessageId, result.localMessageId);
  const audit = await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).where("draftId", "==", input.draftId).get(); assert.equal(audit.size, 1);
  const message = (await adminDb.collection("messages").doc(String(result.localMessageId)).get()).data()!;
  assert.equal(message.text, template ? "Bem-vindo, Cliente QA" : "Mensagem aprovada QA");
});

for (const missing of [false, true]) test(`unknown MCP delivery remains applying and is not resent (missing ID=${missing})`, async () => {
  const input = await fixture(`unknown-${missing}`), before = calls; unknown = !missing; omitId = missing;
  try {
    await assert.rejects(deliverApprovedMcpMessage(input), McpMessageDeliveryPendingError);
    await assert.rejects(deliverApprovedMcpMessage(input), McpMessageDeliveryPendingError);
    assert.equal(calls, before + 1);
    const draft = (await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()!;
    assert.equal(draft.status, "applying"); assert.equal(draft.appliedAt, undefined);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(draft.messageDelivery.jobId).get()).data()?.status, "reconciliation_required");
  } finally { unknown = false; omitId = false; }
});

for (const status of ["pending_review", "rejected", "applying", "apply_failed_requires_review"]) test(`draft ${status} without a durable receipt cannot send`, async () => {
  const input = await fixture(`blocked-${status}`), before = calls;
  await adminDb.collection("mcp_action_drafts").doc(input.draftId).update({ status });
  await assert.rejects(deliverApprovedMcpMessage(input), /Aprove/); assert.equal(calls, before);
});

test("foreign scope and text different from approval never enqueue", async () => {
  const input = await fixture("foreign"); const before = calls;
  await assert.rejects(deliverApprovedMcpMessage({ ...input, tenantId: `${tenantId}_foreign` }), /fora do tenant/);
  await assert.rejects(queueTenantChatText({ tenantId, chatId: input.chatId, text: "Texto nao aprovado", actor: input.actor, clientRequestId: mcpMessageRequestId(tenantId, input.draftId),
    mcpApproval: { draftId: input.draftId, fingerprint: input.approvedFingerprint } }), /difere/);
  assert.equal(calls, before); assert.equal((await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()?.status, "approved_pending_apply");
});

for (const change of ["revoke", "proposal", "destination"] as const) test(`queued approval is blocked before delivery after ${change}`, async () => {
  const input = await fixture(`change-${change}`), before = calls;
  const accepted = await queueTenantChatText({ tenantId, chatId: input.chatId, text: "Mensagem aprovada QA", actor: input.actor, clientRequestId: mcpMessageRequestId(tenantId, input.draftId),
    mcpApproval: { draftId: input.draftId, fingerprint: input.approvedFingerprint } });
  if (change === "revoke") await adminDb.collection("mcp_action_drafts").doc(input.draftId).update({ status: "rejected" });
  if (change === "proposal") await adminDb.collection("mcp_action_drafts").doc(input.draftId).update({ "proposedChange.text": "Novo conteudo sem aceite" });
  if (change === "destination") await adminDb.collection("chats").doc(input.chatId).update({ contactPhone: "5511000000099" });
  await processChatOutboundJobs({ jobId: accepted.jobId }); assert.equal(calls, before);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.status, "dead_letter");
  if (change === "destination") await assert.rejects(deliverApprovedMcpMessage(input), McpMessageDeliveryBlockedError);
});

test("site approval uses the same persistent receipt without external sends", async () => {
  const input = await fixture("site", false, true), before = calls;
  const result = await deliverApprovedMcpMessage(input);
  assert.equal(result.channel, "site_chat"); assert.equal(result.messageId, null); assert.equal(calls, before);
  assert.deepEqual(await deliverApprovedMcpMessage(input), result);
});

test("MCP route preserves authorization and uses canonical start plus durable messages", async () => {
  const source = await readFile("app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts", "utf8");
  assert.match(source, /assertTenantCapability\(membership, "respond_inbox"\)/);
  assert.match(source, /await resolveCanonicalWhatsAppChat/); assert.match(source, /await deliverApprovedMcpMessage/);
  assert.doesNotMatch(source, /await sendTenantChatText|await sendTenantChatTemplate/);
  assert.match(source, /const safeDraftId = draftId.trim\(\)/);
  assert.doesNotMatch(source, /clean\(draftId, 180\)/);
});

for (const channel of ["instagram", "messenger"] as const) test(`approved ${channel} reply keeps one scoped message and one external delivery`, async () => {
  const input = await fixture(`social-${channel}`), before = calls, socialChannelId = `${tenantId}_${channel}`;
  await adminDb.collection("tenant_channels").doc(socialChannelId).set({ tenantId, type: channel, status: "active", accessToken: "qa-social-only", externalAccountId: `qa-mcp-account-${channel}` });
  await adminDb.collection("chats").doc(input.chatId).update({ channel, channelId: socialChannelId, channelExternalAccountId: `qa-mcp-account-${channel}`, contactExternalId: "qa-mcp-social-recipient" });
  const result = await deliverApprovedMcpMessage(input); assert.equal(result.channel, channel);
  assert.deepEqual(await deliverApprovedMcpMessage(input), result); assert.equal(calls, before + 1);
});

for (const mode of ["lost_ack", "revoked", "not_committed"] as const) test(`atomic approval/message/job commit survives ${mode}`, async () => {
  const input = await fixture(`commit-${mode}`), before = calls;
  const original = adminDb.batch.bind(adminDb); let intercepted = false;
  const hook = mock.method(adminDb, "batch", () => {
    const batch = original(), commit = batch.commit.bind(batch);
    if (!intercepted) {
      intercepted = true;
      batch.commit = async () => {
        if (mode === "revoked") await adminDb.collection("mcp_action_drafts").doc(input.draftId).update({ status: "rejected" });
        if (mode === "not_committed") throw Object.assign(new Error("uncommitted batch"), { code: 14 });
        const result = await commit();
        if (mode === "lost_ack") throw Object.assign(new Error("lost commit acknowledgement"), { code: 14 });
        return result;
      };
    }
    return batch;
  });
  try {
    if (mode === "lost_ack") { await deliverApprovedMcpMessage(input); assert.equal(calls, before + 1); }
    else {
      await assert.rejects(deliverApprovedMcpMessage(input)); assert.equal(calls, before);
      const draft = (await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()!;
      assert.equal(draft.messageDelivery, undefined); assert.equal(draft.status, mode === "revoked" ? "rejected" : "approved_pending_apply");
      const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get(); assert.equal(messages.size, 0);
    }
  } finally { hook.mock.restore(); }
  if (mode === "not_committed") { await deliverApprovedMcpMessage(input); assert.equal(calls, before + 1); }
});

test("approval revoked after preflight is rechecked inside the delivery fence transaction", async () => {
  const input = await fixture("fence-race"), before = calls;
  const accepted = await queueTenantChatText({ tenantId, chatId: input.chatId, text: "Mensagem aprovada QA", actor: input.actor,
    clientRequestId: mcpMessageRequestId(tenantId, input.draftId), mcpApproval: { draftId: input.draftId, fingerprint: input.approvedFingerprint } });
  const original = adminDb.runTransaction.bind(adminDb); let number = 0, intervened = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const fence = ++number === 2;
    // Revoke after all preflight reads, but before the fence transaction reads.
    // Updating after a pessimistic read while awaiting that update deadlocks the
    // simulation itself; this race specifically proves the transactional recheck.
    if (fence && !intervened) { intervened = true; await adminDb.collection("mcp_action_drafts").doc(input.draftId).update({ status: "rejected" }); }
    return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await processChatOutboundJobs({ jobId: accepted.jobId }); } finally { hook.mock.restore(); }
  assert.equal(intervened, true); assert.equal(calls, before);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.providerAttemptStartedAt, undefined); assert.equal(job.status, "dead_letter");
});

test("lost receipt commit acknowledgement returns the same applied record on retry", async () => {
  const input = await fixture("receipt-ack"), before = calls;
  const original = adminDb.runTransaction.bind(adminDb); let lost = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const result = await original(callback);
    if (!lost && result && typeof result === "object" && "localMessageId" in result) { lost = true; throw new Error("lost receipt commit"); }
    return result;
  }) as typeof adminDb.runTransaction);
  try { await assert.rejects(deliverApprovedMcpMessage(input), /lost receipt/); } finally { hook.mock.restore(); }
  assert.ok(lost); await deliverApprovedMcpMessage(input); assert.equal(calls, before + 1);
  const audits = await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).where("draftId", "==", input.draftId).get(); assert.equal(audits.size, 1);
});

test("process crash after approved send cannot create another delivery or mark the draft applied", async () => {
  const input = await fixture("process-crash"), before = calls;
  const crashChannelId = `${tenantId}_crash_channel`;
  await adminDb.collection("tenant_channels").doc(crashChannelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-crash-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(input.chatId).update({ channelId: crashChannelId });
  const accepted = await queueTenantChatText({ tenantId, chatId: input.chatId, text: "Mensagem aprovada QA", actor: input.actor,
    clientRequestId: mcpMessageRequestId(tenantId, input.draftId), mcpApproval: { draftId: input.draftId, fingerprint: input.approvedFingerprint } });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/chat-outbound-crash-worker.mts", accepted.jobId], { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", c => output += c); child.stderr.on("data", c => output += c);
    child.on("error", reject); child.on("close", code => { try { assert.equal(code, 71, output); resolve(); } catch (error) { reject(error); } });
  });
  const lockId = createHash("sha256").update(JSON.stringify(["chat-outbound-lock-v1", tenantId, input.chatId])).digest("hex").slice(0, 48);
  await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).update({ leaseUntil: new Date(0), dueAt: new Date(0) });
  await adminDb.collection("chat_outbound_locks").doc(lockId).update({ leaseUntil: new Date(0) });
  await assert.rejects(deliverApprovedMcpMessage(input), McpMessageDeliveryPendingError);
  assert.equal(calls, before); assert.equal((await adminDb.collection("qa_test_provider_calls").doc(accepted.jobId).get()).exists, true);
  assert.equal((await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()?.status, "applying");
});
