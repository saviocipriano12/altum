import test, {after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb} = await import("../app/lib/server/firebase-admin.ts");
const {createConversationCommercialDraft: create} = await import("../lib/server/crm/agent-commercial-draft.ts");
const {recordCommercialAgentAction: review} = await import("../lib/server/commercial-agent-actions.ts");
const {getUnambiguousConversationLead: target} = await import("../lib/server/crm/conversation-commercial-context.ts");
const {AgentCommercialContextChanged} = await import("../lib/server/crm/agent-commercial-task.ts");
const tenantId = `qa_agent_drafts_${Date.now()}`; let sequence = 0;
after(async () => {
  mock.restoreAll();
  for (const name of ["leads", "chats", "messages", "orcamentos", "appointments", "commercial_agent_actions", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_tasks"]) {
    for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture(kind: "proposal" | "appointment" = "proposal") {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(`${id}_message`);
  await lead.set({tenantId, nome: "Cliente atual", ownerId: "seller_a", owner: "Vendedor A"}); await chat.set({tenantId, leadId: lead.id, channel: "whatsapp"});
  await message.set({tenantId, chatId: chat.id, leadId: lead.id, text: "Quero avaliar a proposta"});
  const t = await target({tenantId, chatId: chat.id}); assert.ok(t.ok);
  const fence = {tenantId, chatId: chat.id, leadId: lead.id, leadGeneration: t.generation, chatGeneration: t.chatGeneration, contactId: t.contactId, contactGeneration: t.contactGeneration, messageId: message.id, messageVersion: (await message.get()).updateTime!};
  const input = {tenantId, leadId: lead.id, conversationFence: fence, kind, title: "Instalação para escritório", summary: "Cliente quer avaliar instalação",
    ...(kind === "appointment" ? {slot: {startAt: "2026-11-10T14:00:00.000Z", endAt: "2026-11-10T15:00:00.000Z"}} : {})};
  const rows = (collection: string) => adminDb.collection(collection).where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get();
  return {lead, chat, message, input, rows, collection: kind === "proposal" ? "orcamentos" : "appointments"};
}
test("draft, human review, neutral outcome and audit share one commit with current ownership", async () => {
  for (const kind of ["proposal", "appointment"] as const) {
    const f = await fixture(kind); await f.lead.update({ownerId: "seller_b", owner: "Vendedor B"});
    const id = await create(f.input), draft = (await f.rows(f.collection)).docs[0].data(), action = (await f.rows("commercial_agent_actions")).docs[0].data(), outcome = (await f.rows("ai_learning_outcomes")).docs[0].data();
    assert.equal(draft.leadName, "Cliente atual"); assert.equal(draft.sourceMessageId, f.message.id);
    assert.equal(action.referenceId, id); assert.equal(action.status, "pending_approval");
    assert.deepEqual(outcome.signalTargets, []); assert.equal(outcome.signalStatus, "done");
    assert.equal((await f.lead.collection("events").get()).size, 1);
    if (kind === "proposal") {assert.equal(draft.status, "Rascunho"); assert.equal(draft.valorTotal, null); assert.equal(draft.ownerId, "seller_b");}
    else {assert.equal(draft.status, "draft"); assert.equal(draft.ownerUserId, "seller_b"); assert.equal(draft.requiresCustomerConfirmation, true);}
  }
});
test("concurrent retries create a single draft, review and neutral counter occurrence", async () => {
  const f = await fixture(), ids = await Promise.all([create(f.input), create(f.input), create(f.input)]);
  assert.equal(new Set(ids).size, 1);
  for (const collection of [f.collection, "commercial_agent_actions", "ai_learning_outcomes"]) assert.equal((await f.rows(collection)).size, 1);
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("human draft edits and review decisions survive a later retry", async () => {
  const f = await fixture(); await create(f.input);
  const draft = (await f.rows(f.collection)).docs[0], action = (await f.rows("commercial_agent_actions")).docs[0];
  await draft.ref.update({titulo: "Proposta corrigida pelo vendedor", status: "Enviada", valorTotal: 2500});
  await action.ref.update({status: "approved", title: "Revisão humana concluída"});
  const before = await draft.ref.get(); await create({...f.input, title: "Título antigo da IA"});
  assert.ok((await draft.ref.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await action.ref.get()).data()?.status, "approved");
});
test("changed source or recreated lead creates no draft, review, outcome or audit", async () => {
  for (const change of ["message", "lead"]) {
    const f = await fixture();
    if (change === "message") await f.message.update({text: "Não quero uma proposta"});
    else {const row = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(row);}
    await assert.rejects(create(f.input), AgentCommercialContextChanged);
    for (const collection of [f.collection, "commercial_agent_actions", "ai_learning_outcomes"]) assert.equal((await f.rows(collection)).size, 0);
    assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
test("review write failure rolls back draft, neutral outcome and audit", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith("commercial_agent_actions/agent_review_")) throw new Error("QA_DRAFT_REVIEW_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(create(f.input), /QA_DRAFT_REVIEW_FAILURE/);} finally {hook.mock.restore();}
  for (const collection of [f.collection, "commercial_agent_actions", "ai_learning_outcomes"]) assert.equal((await f.rows(collection)).size, 0);
  assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("standalone review validates source and reference, then preserves a human decision", async () => {
  const f = await fixture(); const id = await create(f.input);
  const input = {tenantId, leadId: f.lead.id, chatId: f.chat.id, conversationFence: f.input.conversationFence,
    type: "review_proposal" as const, title: "Revisar proposta", referenceCollection: f.collection, referenceId: id, dedupeKey: `proposal:${id}`};
  const first = await review(input), ref = adminDb.collection("commercial_agent_actions").doc(first.id);
  await ref.update({status: "rejected", detail: "Decisão humana"}); const before = await ref.get();
  assert.equal((await review(input)).status, "rejected"); assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  await f.message.update({text: "Outro contexto"}); await assert.rejects(review(input), AgentCommercialContextChanged);
});
test("review cannot adopt another lead's draft or an unsupported reference collection", async () => {
  const f = await fixture(), other = await fixture(); const id = await create(other.input);
  const input = {tenantId, leadId: f.lead.id, chatId: f.chat.id, conversationFence: f.input.conversationFence,
    type: "review_proposal" as const, title: "Revisar proposta", referenceCollection: f.collection, referenceId: id, dedupeKey: `proposal:${id}`};
  await assert.rejects(review(input), AgentCommercialContextChanged);
  await assert.rejects(review({...input, referenceCollection: "users"}), /REFERENCE_INVALID/);
  assert.equal((await f.rows("commercial_agent_actions")).size, 0);
});
test("retry never restores a draft or review removed after its original acceptance", async () => {
  const f = await fixture(); await create(f.input);
  const draft = (await f.rows(f.collection)).docs[0], action = (await f.rows("commercial_agent_actions")).docs[0];
  await action.ref.delete();
  await assert.rejects(review({tenantId, leadId: f.lead.id, chatId: f.chat.id, conversationFence: f.input.conversationFence,
    type: "review_proposal", title: "Revisar", referenceCollection: f.collection, referenceId: draft.id, dedupeKey: `proposal:${draft.id}`}), /REMOVED_AFTER_ACCEPTANCE/);
  assert.equal((await f.rows("commercial_agent_actions")).size, 0);
  await draft.ref.delete(); await assert.rejects(create(f.input), AgentCommercialContextChanged);
  assert.equal((await f.rows(f.collection)).size, 0);
});
test("an AI appointment without a provided range stays undated until human scheduling", async () => {
  const f = await fixture("appointment"), {slot, ...input} = f.input; void slot;
  await create(input); const draft = (await f.rows(f.collection)).docs[0].data();
  assert.equal(draft.startAt, null); assert.equal(draft.endAt, null); assert.equal(draft.status, "draft");
  assert.equal(draft.slotSource, null); assert.equal(draft.requiresCustomerConfirmation, true);
});
