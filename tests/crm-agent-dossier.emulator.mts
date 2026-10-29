import test, {after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb} = await import("../app/lib/server/firebase-admin.ts");
const {upsertLeadCommercialDossier: save} = await import("../lib/server/ai/lead-dossier.ts");
const {getUnambiguousConversationLead: target} = await import("../lib/server/crm/conversation-commercial-context.ts");
const {AgentCommercialContextChanged} = await import("../lib/server/crm/agent-commercial-task.ts");
const tenantId = `qa_dossier_${Date.now()}`; let sequence = 0;
after(async () => {
  mock.restoreAll();
  for (const name of ["leads", "chats", "messages", "contacts"]) {
    for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(`${id}_message`);
  await lead.set({tenantId, nome: "Cliente atual", aiLeadSummary: "Precisa instalar dois aparelhos no escritório."});
  await chat.set({tenantId, leadId: lead.id, channel: "whatsapp"});
  await message.set({tenantId, chatId: chat.id, leadId: lead.id, text: "Preciso instalar dois aparelhos"});
  const t = await target({tenantId, chatId: chat.id}); assert.ok(t.ok);
  const fence = {tenantId, chatId: chat.id, leadId: lead.id, leadGeneration: t.generation, chatGeneration: t.chatGeneration, contactId: t.contactId, contactGeneration: t.contactGeneration, messageId: message.id, messageVersion: (await message.get()).updateTime!};
  const input = {tenantId, leadId: lead.id, chatId: chat.id, sourceId: chat.id, trigger: "handoff" as const, conversationFence: fence};
  return {lead, chat, message, input};
}
test("dossier, document and evidence are atomic, replayable and use persisted identity", async () => {
  const f = await fixture();
  const result = await save({...f.input, lead: {tenantId, nome: "Nome antigo", aiLeadSummary: "Resumo antigo"}}); assert.ok(result);
  assert.equal(result.leadName, "Cliente atual"); assert.equal(result.summary, "Precisa instalar dois aparelhos no escritório.");
  assert.equal(result.appointmentId, null); assert.equal(result.sourceMessageId, f.message.id);
  assert.equal(result.score, null);
  const root = await f.lead.get(), document = await f.lead.collection("documents").doc("commercial_dossier").get();
  assert.equal(root.data()?.commercialDossier.fingerprint, document.data()?.fingerprint);
  await save(f.input);
  assert.ok((await f.lead.get()).updateTime!.isEqual(root.updateTime!));
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("missing, deleted or foreign parents never create dossier descendants", async () => {
  const f = await fixture(); await f.lead.delete();
  assert.equal(await save({...f.input, conversationFence: undefined, lead: {tenantId, nome: "Nome antigo"}}), null);
  await assert.rejects(save(f.input), AgentCommercialContextChanged);
  assert.equal((await f.lead.get()).exists, false); assert.equal((await f.lead.collection("documents").get()).size, 0);
  await f.lead.set({tenantId: `${tenantId}_foreign`});
  assert.equal(await save({...f.input, conversationFence: undefined}), null); await f.lead.delete();
});
test("changed source prevents an old dossier without updating any of its records", async () => {
  const f = await fixture(); await f.message.update({text: "Na verdade preciso de três aparelhos"});
  const before = await f.lead.get(); await assert.rejects(save(f.input), AgentCommercialContextChanged);
  assert.ok((await f.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.lead.collection("documents").get()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("a human correction during dossier derivation is preserved", async () => {
  const f = await fixture(), {DocumentReference} = await import("firebase-admin/firestore"), original = DocumentReference.prototype.get;
  let injected = false;
  const hook = mock.method(DocumentReference.prototype, "get", async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const snapshot = await original.apply(this, args);
    if (!injected && this.path === f.lead.path) {injected = true; await f.lead.update({nome: "Correção humana"});}
    return snapshot;
  });
  try {await assert.rejects(save(f.input), AgentCommercialContextChanged); assert.equal(injected, true);} finally {hook.mock.restore();}
  assert.equal((await f.lead.get()).data()?.nome, "Correção humana"); assert.equal((await f.lead.collection("documents").get()).size, 0);
});
test("audit failure rolls back both copies of the dossier", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.includes("/events/commercial_dossier_")) throw new Error("QA_DOSSIER_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(save(f.input), /QA_DOSSIER_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.lead.get()).data()?.commercialDossier, undefined); assert.equal((await f.lead.collection("documents").get()).size, 0);
});
test("concurrent identical dossier writers converge to a single revision and audit", async () => {
  const f = await fixture(); await Promise.all([save(f.input), save(f.input), save(f.input)]);
  assert.equal((await f.lead.get()).data()?.commercialDossier.version, 1); assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("absent information does not invent a score, questions or generic seller instructions", async () => {
  const f = await fixture(); await f.lead.update({aiLeadSummary: null});
  const result = await save(f.input); assert.ok(result);
  assert.equal(result.summary, ""); assert.equal(result.sellerBrief, ""); assert.equal(result.score, null);
  assert.deepEqual(result.questionsToAsk, []); assert.deepEqual(result.talkingPoints, []);
  assert.equal(result.markdown.includes("Confirmar objetivo principal"), false);
  assert.equal(result.markdown.includes("## Plano sugerido"), false);
});
test("a recreated parent never overwrites the prior generation's dossier document", async () => {
  const f = await fixture(); await save(f.input);
  const document = f.lead.collection("documents").doc("commercial_dossier"), before = await document.get();
  const row = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(row);
  await assert.rejects(save({...f.input, conversationFence: undefined}), /DOCUMENT_GENERATION_CONFLICT/);
  assert.ok((await document.get()).updateTime!.isEqual(before.updateTime!));
});
test("legacy manual dossier calls remain compatible and use current data without a conversation", async () => {
  const f = await fixture();
  const input = {tenantId, leadId: f.lead.id, trigger: "sale_won" as const, sourceId: "pipeline_stage_ganho", actorId: "qa_owner", lead: {tenantId, nome: "Snapshot antigo"}};
  const first = await save(input); assert.ok(first); assert.equal(first.leadName, "Cliente atual");
  assert.equal(first.sourceMessageId, null); assert.equal(first.appointmentId, null);
  const before = await f.lead.get(); await save(input);
  assert.ok((await f.lead.get()).updateTime!.isEqual(before.updateTime!));
});
test("an appointment draft is presented as awaiting confirmation, not a booked meeting", async () => {
  const f = await fixture(), result = await save({...f.input, trigger: "appointment_draft", appointmentId: `${f.lead.id}_draft`});
  assert.ok(result); assert.equal(result.status, "meeting_draft"); assert.equal(result.triggerLabel, "Agendamento a confirmar");
});
