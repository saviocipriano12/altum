import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb} = await import("../app/lib/server/firebase-admin.ts");
const {getUnambiguousConversationLead} = await import("../lib/server/crm/conversation-commercial-context.ts");
const {ensureConversationAgentTask: ensure, AgentCommercialContextChanged} = await import("../lib/server/crm/agent-commercial-task.ts");
const {executeAltumAgentActions: execute} = await import("../lib/server/ai/agent.ts");
const {AI_ACTION_TOOL_CONTRACTS} = await import("../lib/server/ai/action-plan.ts");
const tenantId = `qa_agent_tasks_${Date.now()}`; let sequence = 0;
after(async () => {
  mock.restoreAll();
  for (const collection of ["leads", "contacts", "chats", "messages", "lead_tasks", "ai_action_executions", "ai_action_approvals", "ai_internal_notifications", "orcamentos", "appointments", "commercial_agent_actions", "ai_learning_outcomes", "ai_tenant_learning_daily", "jobs", "lead_notes"]) {
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(`${id}_message`), contact = adminDb.collection("contacts").doc(`${id}_contact`);
  await lead.set({tenantId, contactId: contact.id, ownerId: "seller_a", owner: "Vendedor A"});
  await contact.set({tenantId, leadIds: [lead.id]}); await chat.set({tenantId, leadId: lead.id, channel: "whatsapp"});
  await message.set({tenantId, chatId: chat.id, leadId: lead.id, text: "Quero conversar sobre o orçamento"});
  const target = await getUnambiguousConversationLead({tenantId, chatId: chat.id}); assert.ok(target.ok);
  const fence = {tenantId, chatId: chat.id, leadId: lead.id, leadGeneration: target.generation, chatGeneration: target.chatGeneration, contactId: target.contactId, contactGeneration: target.contactGeneration, messageId: message.id, messageVersion: (await message.get()).updateTime!};
  const input = {tenantId, leadId: lead.id, conversationFence: fence, title: "Retornar orçamento solicitado", type: "follow_up", priority: "medium", reasonCode: "budget_requested", taskKey: "budget_return"};
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get();
  return {lead, chat, message, contact, input, tasks};
}
test("agent task uses current seller, optional deadline, source and atomic audit", async () => {
  const f = await fixture(); await f.lead.update({ownerId: "seller_b", owner: "Vendedor B"});
  const id = await ensure(f.input); assert.ok(id);
  const row = (await f.tasks()).docs[0].data();
  assert.equal(row.ownerUserId, "seller_b"); assert.equal(row.ownerName, "Vendedor B"); assert.equal(row.dueAt, null);
  assert.equal(row.version, 1); assert.equal(row.sourceMessageId, f.message.id);
  assert.deepEqual(row.crmTaskIndex, { version: 1, state: "pending", openRank: 0, dueOrder: Number.MAX_SAFE_INTEGER, issue: null });
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("concurrent retries create one task and preserve later human completion", async () => {
  const f = await fixture(), ids = await Promise.all([ensure(f.input), ensure(f.input), ensure(f.input)]);
  assert.equal(ids.filter(Boolean).length, 1); const task = (await f.tasks()).docs[0];
  await task.ref.update({title: "Título editado pelo vendedor", status: "done", version: 2});
  assert.equal(await ensure(f.input), null);
  assert.equal((await f.tasks()).size, 1); assert.equal((await task.ref.get()).data()?.title, "Título editado pelo vendedor");
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("changed source, recreated lead and ambiguous purchases reject tasks without audit", async () => {
  for (const change of ["message", "lead", "purchase"]) {
    const f = await fixture();
    if (change === "message") await f.message.update({text: "Não quero orçamento"});
    if (change === "lead") {const row = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(row);}
    if (change === "purchase") await f.contact.update({leadIds: [f.lead.id, `${f.lead.id}_new_purchase`]});
    await assert.rejects(ensure(f.input), AgentCommercialContextChanged);
    assert.equal((await f.tasks()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
test("pending task deduplication covers records beyond the former limit of 30", async () => {
  const f = await fixture(), batch = adminDb.batch();
  for (let index = 0; index < 35; index++) batch.set(adminDb.collection("lead_tasks").doc(`${f.lead.id}_${String(index).padStart(2, "0")}`), {tenantId, leadId: f.lead.id, status: "pending", reasonCode: index === 34 ? f.input.reasonCode : `other_${index}`});
  await batch.commit(); assert.equal(await ensure(f.input), null); assert.equal((await f.tasks()).size, 35);
});
test("audit failure rolls back task creation", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.includes("/events/task_created_agent_task_")) throw new Error("QA_AGENT_TASK_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(ensure(f.input), /QA_AGENT_TASK_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.tasks()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("missing and mismatched commercial context is refused", async () => {
  const f = await fixture();
  await assert.rejects(ensure({...f.input, conversationFence: undefined}), AgentCommercialContextChanged);
  await assert.rejects(ensure({...f.input, leadId: `${f.lead.id}_other`}), AgentCommercialContextChanged);
  assert.equal((await f.tasks()).size, 0);
});
function handoffInput(f: Awaited<ReturnType<typeof fixture>>): Parameters<typeof execute>[0] {
  const fence = f.input.conversationFence;
  return {
    tenantId, chatId: f.chat.id, leadId: f.lead.id, conversationFence: fence,
    plan: {decision: "handoff", reason: "Cliente pediu atendimento humano", confidence: 1, stateBefore: "discovery", stateAfter: "handoff", responseGoal: "handoff", intent: "human_requested"},
    actionPlan: {schemaVersion: "ai-action-plan-v1", tenantId, chatId: f.chat.id, leadId: f.lead.id, messageId: f.message.id,
      autonomyMode: "copilot", objective: "handoff", factsUsed: [], gaps: [], executionMode: "execute_ready", fingerprint: f.message.id,
      steps: [{id: "handoff", kind: "create_handoff_task", tool: "human_handoff", risk: "low", authorization: "ready", authorizationReason: "human_requested", idempotencyKey: f.message.id, preconditions: [], expectedEvidence: ["task"], compensation: "cancel_task", toolContract: AI_ACTION_TOOL_CONTRACTS.create_handoff_task}]},
    runtimeState: null, inboundText: "Quero falar com uma pessoa", businessProfileId: "generic", autonomyMode: "copilot",
  };
}

test("real profile writer preserves manual buyer budget and provenance while updating another fact", async () => {
  for (const manualBudget of ["3000 reais", ""]) {
    const f = await fixture(), input = handoffInput(f);
    await f.lead.update({ customFields: { orcamento: manualBudget }, aiFieldEvidence: {
      "custom.orcamento": { source: "manual", value: manualBudget, actorId: "seller_a" },
    } });
    input.autonomyMode = "autonomous"; input.actionPlan.autonomyMode = "autonomous";
    input.actionPlan.steps = [{ ...input.actionPlan.steps[0], id: "profile", kind: "update_crm_context", tool: "crm_write", toolContract: AI_ACTION_TOOL_CONTRACTS.update_crm_context }];
    input.extractedFields = { budgetBand: "9000 reais", businessType: "loja de roupas", diagnosis: "Planejar investimento de 9000 reais" };
    await execute(input);
    const row = (await f.lead.get()).data()!;
    assert.equal(row.customFields.nicho, "loja de roupas", "The real profile action must actually run");
    assert.equal(row.customFields.orcamento, manualBudget);
    assert.equal(row.aiBudgetBand, manualBudget || null);
    assert.equal(row.aiMemory.budgetBand, manualBudget || null);
    assert.equal(row.aiCaptureChecklist.orcamento, Boolean(manualBudget));
    assert.equal(row.aiMemory.diagnosis, null);
    assert.equal(row.aiCommercialAnalysisNeedsRefresh, true);
    assert.equal(row.aiFieldEvidence["custom.orcamento"].source, "manual");
    assert.equal(row.aiFieldEvidence["custom.orcamento"].value, manualBudget);
    assert.equal(row.aiFieldEvidence["custom.orcamento"].actorId, "seller_a");
  }
});
test("real action executor creates one accountable handoff and replays without duplication", async () => {
  const f = await fixture(), input = handoffInput(f), result = await execute(input);
  assert.ok(result.includes("handoff_to_human")); assert.equal((await f.tasks()).size, 1);
  assert.equal((await f.tasks()).docs[0].data().ownerUserId, "seller_a");
  const notifications = await adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get();
  assert.equal(notifications.size, 1); assert.equal(notifications.docs[0].data().evidenceKind, "operational_event");
  await execute(input); assert.equal((await f.tasks()).size, 1);
});
test("source changed during action claim stops the real handoff task and skips its claim", async () => {
  const f = await fixture(), input = handoffInput(f), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  let injected = false;
  const hook = mock.method(Transaction.prototype, "get", async function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    const result = await original.apply(this, args);
    const target = args[0] as unknown as {path?: string};
    if (!injected && target.path?.startsWith("ai_action_executions/")) {
      injected = true; await f.message.update({text: "Corrigindo: não preciso de atendimento"});
    }
    return result;
  });
  try {
    assert.deepEqual(await execute(input), ["crm_actions_skipped_context_changed"]); assert.equal(injected, true);
  } finally {hook.mock.restore();}
  assert.equal((await f.tasks()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
  const claims = await adminDb.collection("ai_action_executions").where("tenantId", "==", tenantId).where("chatId", "==", f.chat.id).get();
  assert.equal(claims.size, 1); assert.equal(claims.docs[0].data().status, "skipped_precondition");
  assert.equal((await adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).where("chatId", "==", f.chat.id).get()).size, 0);
});
test("real profile action cannot save a result after its source changes during derivation", async () => {
  const f = await fixture(), input = handoffInput(f), before = await f.lead.get();
  input.autonomyMode = "autonomous";
  input.plan = {decision: "ask_more", reason: "Coletar necessidade", confidence: 0.9, stateBefore: "discovery", stateAfter: "discovery", responseGoal: "qualify", intent: "business_info"};
  input.actionPlan.autonomyMode = "autonomous";
  input.actionPlan.steps = [{...input.actionPlan.steps[0], id: "profile", kind: "update_crm_context", tool: "crm_write", toolContract: AI_ACTION_TOOL_CONTRACTS.update_crm_context}];
  input.extractedFields = {businessType: "clinica odontologica"};
  const {DocumentReference} = await import("firebase-admin/firestore"), original = DocumentReference.prototype.get;
  let injected = false;
  const hook = mock.method(DocumentReference.prototype, "get", async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const result = await original.apply(this, args);
    if (!injected && this.path === `pipeline/${tenantId}`) {
      injected = true; await f.message.update({text: "Corrigindo: somos uma loja"});
    }
    return result;
  });
  try {
    const actions = await execute(input); assert.equal(injected, true);
    assert.ok(actions.includes("crm_update_skipped_snapshot_conflict"));
  } finally {hook.mock.restore();}
  assert.ok((await f.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.tasks()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("real recommendation action stops a dossier when the conversation changes after profile commit", async () => {
  const f = await fixture(), input = handoffInput(f);
  input.autonomyMode = "autonomous";
  input.plan = {decision: "respond", reason: "Preparar contexto para vendedor", confidence: 0.7, stateBefore: "discovery", stateAfter: "recommendation", responseGoal: "recommend", intent: "service_interest", recommendedOffer: "Instalação de aparelhos"};
  input.actionPlan.autonomyMode = "autonomous";
  input.actionPlan.steps = [{...input.actionPlan.steps[0], id: "profile", kind: "update_crm_context", tool: "crm_write", toolContract: AI_ACTION_TOOL_CONTRACTS.update_crm_context}];
  const {DocumentReference} = await import("firebase-admin/firestore"), original = DocumentReference.prototype.get;
  let leadReads = 0, injected = false;
  const hook = mock.method(DocumentReference.prototype, "get", async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const snapshot = await original.apply(this, args);
    if (this.path === f.lead.path && ++leadReads === 2) {
      injected = true; await f.message.update({text: "Mudou: preciso tratar de outro assunto"});
    }
    return snapshot;
  });
  try {
    assert.deepEqual(await execute(input), ["crm_actions_skipped_context_changed"]); assert.equal(injected, true);
  } finally {hook.mock.restore();}
  const lead = (await f.lead.get()).data()!;
  assert.ok(lead.aiLeadSummary, "Earlier valid projection remains recorded");
  assert.equal(lead.commercialDossier, undefined);
  assert.equal((await f.lead.collection("documents").get()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("real handoff does not publish stale signals after the task commit", async () => {
  const f = await fixture(), original = adminDb.runTransaction;
  let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await original.apply(this, args);
    if (!injected && typeof result === "string" && result.startsWith("agent_task_")) {
      injected = true; await f.message.update({text: "Não preciso mais de transferência"});
    }
    return result;
  });
  try {assert.deepEqual(await execute(handoffInput(f)), ["crm_actions_skipped_context_changed"]); assert.equal(injected, true);} finally {hook.mock.restore();}
  assert.equal((await f.tasks()).size, 1, "Earlier valid task remains recorded");
  const events = await f.lead.collection("events").get();
  assert.equal(events.docs.filter(doc => doc.data().type === "ai_handoff_requested").length, 0);
  assert.equal((await adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, 0);
});
function proposalInput(f: Awaited<ReturnType<typeof fixture>>): Parameters<typeof execute>[0] {
  const input = handoffInput(f);
  input.autonomyMode = "autonomous";
  input.plan = {decision: "respond", reason: "Preparar proposta para revisão", confidence: 0.9, stateBefore: "discovery", stateAfter: "discovery", responseGoal: "move_to_next_step", intent: "proposal_requested", nextAction: "preparar_proposta_comercial", recommendedOffer: "Instalação de aparelhos"};
  input.extractedFields = {businessType: "escritorio", primaryGoal: "instalar aparelhos", urgency: "esta semana", budgetBand: "2500 reais"};
  input.actionPlan.autonomyMode = "autonomous";
  input.actionPlan.steps = [
    {...input.actionPlan.steps[0], id: "profile", kind: "update_crm_context", tool: "crm_write", toolContract: AI_ACTION_TOOL_CONTRACTS.update_crm_context},
    {...input.actionPlan.steps[0], id: "proposal", kind: "prepare_proposal_draft", tool: "proposal_prepare", idempotencyKey: `${f.message.id}_proposal`, toolContract: AI_ACTION_TOOL_CONTRACTS.prepare_proposal_draft},
  ];
  return input;
}
test("real proposal action creates one draft with a pending human review and neutral outcome", async () => {
  const f = await fixture(), input = proposalInput(f), result = await execute(input);
  assert.ok(result.includes("create_proposal_draft"));
  const proposals = await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get();
  assert.equal(proposals.size, 1); assert.equal(proposals.docs[0].data().status, "Rascunho"); assert.equal(proposals.docs[0].data().valorTotal, null);
  const reviews = await adminDb.collection("commercial_agent_actions").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get();
  assert.equal(reviews.size, 1); assert.equal(reviews.docs[0].data().status, "pending_approval");
  await execute(input);
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, 1);
});
test("source changed after a valid draft commit prevents subsequent stale dossier and alerts", async () => {
  const f = await fixture(), original = adminDb.runTransaction; let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await original.apply(this, args);
    if (!injected && typeof result === "string" && result.startsWith("agent_draft_")) {
      injected = true; await f.message.update({text: "Corrigindo: não preciso mais da proposta"});
    }
    return result;
  });
  try {assert.deepEqual(await execute(proposalInput(f)), ["crm_actions_skipped_context_changed"]); assert.equal(injected, true);} finally {hook.mock.restore();}
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, 1);
  assert.equal((await f.lead.get()).data()?.commercialDossier, undefined);
  assert.equal((await adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, 0);
});
