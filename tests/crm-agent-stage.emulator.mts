import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { executeAltumAgentActions: execute } = await import("../lib/server/ai/agent.ts");
const { getUnambiguousConversationLead } = await import("../lib/server/crm/conversation-commercial-context.ts");
const { conversationStageTransitionId, processConversationStageTransition } = await import("../lib/server/crm/conversation-stage-transition.ts");
const { AI_ACTION_TOOL_CONTRACTS } = await import("../lib/server/ai/action-plan.ts");
const tenantId = `qa_agent_stage_${Date.now()}`; let sequence = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const name of ["leads", "contacts", "chats", "messages", "pipeline", "tenant_settings", "tenant_entitlements", "automations", "jobs", "lead_tasks", "lead_notes", "ai_action_executions", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails", "tenant_usage_monthly", "audit_logs"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(`${id}_message`), contact = adminDb.collection("contacts").doc(`${id}_contact`);
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "entrada", label: "Entrada" }, { id: "proposta", label: "Proposta" }, { id: "ganho", label: "Ganho", isTerminal: true }] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await lead.set({ tenantId, contactId: contact.id, pipelineStage: "entrada", origem: id, ownerId: "seller_qa" });
  await contact.set({ tenantId, leadIds: [lead.id] }); await chat.set({ tenantId, leadId: lead.id, channel: "whatsapp" });
  const text = "Quero receber a proposta do produto";
  await message.set({ tenantId, chatId: chat.id, leadId: lead.id, sender: "client", text, createdAt: new Date() });
  const target = await getUnambiguousConversationLead({ tenantId, chatId: chat.id }); assert.ok(target.ok);
  const fence = { tenantId, chatId: chat.id, leadId: lead.id, leadGeneration: target.generation, chatGeneration: target.chatGeneration, contactId: target.contactId, contactGeneration: target.contactGeneration, messageId: message.id, messageVersion: (await message.get()).updateTime! };
  const input: Parameters<typeof execute>[0] = {
    tenantId, chatId: chat.id, leadId: lead.id, conversationFence: fence, inboundText: text, businessProfileId: "generic", autonomyMode: "autonomous", runtimeState: null,
    pipelineStageProposal: { id: "proposta", evidence: text, confidence: 1 },
    plan: { decision: "respond", reason: "Pedido explícito de proposta", confidence: 1, stateBefore: "discovery", stateAfter: "discovery", responseGoal: "qualify", intent: "product_interest" },
    actionPlan: { schemaVersion: "ai-action-plan-v1", tenantId, chatId: chat.id, leadId: lead.id, messageId: message.id, autonomyMode: "autonomous", objective: "qualify", factsUsed: [], gaps: [], executionMode: "execute_ready", fingerprint: message.id,
      steps: (["update_crm_context", "move_pipeline_stage"] as const).map(kind => ({ id: kind, kind, tool: "crm_write", risk: "low", authorization: "ready", authorizationReason: "allowed", idempotencyKey: `${message.id}_${kind}`, preconditions: [], expectedEvidence: ["stage"], compensation: "review", toolContract: AI_ACTION_TOOL_CONTRACTS[kind] })) },
  };
  await adminDb.collection("automations").doc(`${id}_rule`).set({ tenantId, enabled: true, status: "active", trigger: "lead_stage_changed", conditions: { sourceIn: [id] }, actions: [{ type: "create_task", title: "Conferir proposta fictícia" }] });
  return { lead, message, input, root: adminDb.collection("jobs").doc(conversationStageTransitionId(fence)), tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).where("source", "==", "tenant_automation").get() };
}
test("real agent stage commit retains its cause after a lost acknowledgement and resumes exactly once", async () => {
  const f = await fixture(), original = adminDb.runTransaction; let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!injected && result === true && (await f.lead.get()).data()?.pipelineStage === "proposta") { injected = true; throw new Error("QA_AGENT_STAGE_COMMIT_ACK_LOST"); }
    return result;
  });
  try { await assert.rejects(execute(f.input), /QA_AGENT_STAGE_COMMIT_ACK_LOST/); } finally { hook.mock.restore(); }
  assert.equal(injected, true); const root = await f.root.get(); assert.equal(root.exists, true, "Stage cause must be committed with the stage");
  assert.ok(root.createTime!.isEqual((await f.lead.get()).updateTime!)); assert.equal(root.data()?.status, "ready"); assert.equal((await f.tasks()).size, 0);
  const resumed = await processConversationStageTransition(f.root.id, tenantId), resumedRoot = (await f.root.get()).data();
  assert.equal(resumed.completed, true, JSON.stringify({ resumed, status: resumedRoot?.status, error: resumedRoot?.lastError, progress: resumedRoot?.stageHookProgress }));
  assert.equal((await f.tasks()).size, 1); await processConversationStageTransition(f.root.id, tenantId); assert.equal((await f.tasks()).size, 1);
});
test("a failure creating the real agent stage cause rolls back the lead change", async () => {
  const f = await fixture(), before = await f.lead.get(), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create; let injected = false;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path === f.root.path) { injected = true; throw new Error("QA_AGENT_STAGE_CAUSE_WRITE_FAILED"); }
    return original.apply(this, args);
  });
  try { await assert.rejects(execute(f.input), /QA_AGENT_STAGE_CAUSE_WRITE_FAILED/); } finally { hook.mock.restore(); }
  assert.equal(injected, true); assert.ok((await f.lead.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await f.root.get()).exists, false); assert.equal((await f.tasks()).size, 0);
});
test("the real agent completes its stage actions and replay retains one occurrence and task", async () => {
  const f = await fixture(), actions = await execute(f.input);
  assert.ok(actions.includes("move_pipeline_stage")); assert.ok(actions.includes("sync_crm_state"));
  assert.equal((await f.root.get()).data()?.status, "done"); assert.equal((await f.lead.get()).data()?.pipelineStage, "proposta"); assert.equal((await f.tasks()).size, 1);
  await execute(f.input); assert.equal((await f.tasks()).size, 1);
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).where("type", "==", "crm_conversation_stage_transition").get()).size, 1);
});
test("a human stage decision still blocks the real agent without admitting an occurrence", async () => {
  const f = await fixture();
  await f.lead.update({ crmFieldOwnership: { pipelineStage: { source: "manual", locked: true, actorId: "seller_qa" } } });
  const actions = await execute(f.input); assert.ok(!actions.includes("move_pipeline_stage"));
  assert.equal((await f.lead.get()).data()?.pipelineStage, "entrada"); assert.equal((await f.root.get()).exists, false); assert.equal((await f.tasks()).size, 0);
});
test("editing the evidence after the real stage commit prevents resumed effects", async () => {
  const f = await fixture(), original = adminDb.runTransaction; let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!injected && result === true && (await f.lead.get()).data()?.pipelineStage === "proposta") { injected = true; throw new Error("QA_AGENT_STAGE_SOURCE_PAUSE"); }
    return result;
  });
  try { await assert.rejects(execute(f.input), /QA_AGENT_STAGE_SOURCE_PAUSE/); } finally { hook.mock.restore(); }
  assert.equal(injected, true); assert.equal((await f.root.get()).data()?.status, "ready");
  await f.message.update({ text: "Correção: não quero proposta" });
  assert.equal((await processConversationStageTransition(f.root.id, tenantId)).processed, false);
  assert.equal((await f.root.get()).data()?.status, "reconciliation_required"); assert.equal((await f.tasks()).size, 0);
});
test("an expired own lease before effects preserves pending work and retries with live authority", async () => {
  const f = await fixture(), original = adminDb.runTransaction; let paused = false;
  const pause = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!paused && result === true && (await f.lead.get()).data()?.pipelineStage === "proposta") { paused = true; throw new Error("QA_AGENT_STAGE_LEASE_PAUSE"); }
    return result;
  });
  try { await assert.rejects(execute(f.input), /QA_AGENT_STAGE_LEASE_PAUSE/); } finally { pause.mock.restore(); }
  assert.equal(paused, true); let expired = false;
  const expire = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!expired && result && typeof result === "object" && "type" in result && "leadId" in result && result.type === "crm_conversation_stage_transition" && result.leadId === f.lead.id) {
      expired = true; await f.root.update({ leaseUntil: new Date(0) });
    }
    return result;
  });
  try { assert.equal((await processConversationStageTransition(f.root.id, tenantId)).completed, false); } finally { expire.mock.restore(); }
  assert.equal(expired, true); assert.equal((await f.tasks()).size, 0);
  assert.equal((await f.root.get()).data()?.status, "ready", "A lease alone does not revoke the business source or make pending effects uncertain");
  assert.equal((await processConversationStageTransition(f.root.id, tenantId)).completed, true); assert.equal((await f.tasks()).size, 1);
});
for (const change of ["evidence", "claim_owner"] as const) test(`expiry cannot bypass changed ${change}`, async () => {
  const f = await fixture(), original = adminDb.runTransaction; let paused = false;
  const pause = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!paused && result === true && (await f.lead.get()).data()?.pipelineStage === "proposta") { paused = true; throw new Error("QA_AGENT_STAGE_REVOKE_PAUSE"); }
    return result;
  });
  try { await assert.rejects(execute(f.input), /QA_AGENT_STAGE_REVOKE_PAUSE/); } finally { pause.mock.restore(); }
  assert.equal(paused, true); let expired = false;
  const expire = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!expired && result && typeof result === "object" && "type" in result && "leadId" in result && result.type === "crm_conversation_stage_transition" && result.leadId === f.lead.id) {
      expired = true;
      await f.root.update({ leaseUntil: new Date(0), ...(change === "claim_owner" ? { claimToken: "another_worker_qa" } : {}) });
      if (change === "evidence") await f.message.update({ text: "Correção após claim" });
    }
    return result;
  });
  try { assert.equal((await processConversationStageTransition(f.root.id, tenantId)).completed, false); } finally { expire.mock.restore(); }
  assert.equal(expired, true); assert.equal((await f.tasks()).size, 0);
  const root = (await f.root.get()).data()!;
  assert.equal(root.status, change === "evidence" ? "reconciliation_required" : "processing");
  if (change === "claim_owner") assert.equal(root.claimToken, "another_worker_qa", "Old worker must not overwrite another claim");
});
