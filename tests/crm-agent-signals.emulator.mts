import test, {after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb} = await import("../app/lib/server/firebase-admin.ts");
const {commitConversationAgentSignal: save} = await import("../lib/server/crm/agent-commercial-signal.ts");
const {getUnambiguousConversationLead: target} = await import("../lib/server/crm/conversation-commercial-context.ts");
const {AgentCommercialContextChanged} = await import("../lib/server/crm/agent-commercial-task.ts");
const tenantId = `qa_agent_signals_${Date.now()}`; let sequence = 0;
after(async () => {
  mock.restoreAll();
  for (const name of ["leads", "chats", "messages", "lead_notes", "ai_internal_notifications"]) {
    for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture(longId = false) {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(longId ? `${id}_message`.padEnd(240, "x") : `${id}_message`);
  await lead.set({tenantId, nome: "Pessoa fictícia"}); await chat.set({tenantId, leadId: lead.id, channel: "whatsapp"});
  await message.set({tenantId, chatId: chat.id, leadId: lead.id, text: "Preciso avaliar o preço"});
  const t = await target({tenantId, chatId: chat.id}); assert.ok(t.ok);
  const fence = {tenantId, leadId: lead.id, chatId: chat.id, leadGeneration: t.generation, chatGeneration: t.chatGeneration, contactId: t.contactId, contactGeneration: t.contactGeneration, messageId: message.id, messageVersion: (await message.get()).updateTime!};
  const input = {tenantId, leadId: lead.id, chatId: chat.id, conversationFence: fence,
    event: {type: "ai_objection_detected", title: "Possível objeção", detail: "Preço para revisar"},
    note: "Interpretação da IA: possível dúvida sobre preço",
    notification: {type: "objection", severity: "warning" as const, title: "Revisar contexto", detail: "Preço para revisar"}};
  const notes = () => adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get();
  const notifications = () => adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get();
  return {lead, chat, message, input, notes, notifications};
}
test("signal stores one atomic interpretation with complete message evidence", async () => {
  const f = await fixture(true); assert.equal(await save(f.input), true);
  const note = (await f.notes()).docs[0].data(), event = (await f.lead.collection("events").get()).docs[0].data(), notification = (await f.notifications()).docs[0].data();
  for (const row of [note, event, notification]) {assert.equal(row.evidenceKind, "ai_interpretation"); assert.equal(row.sourceMessageId, f.message.id); assert.equal(row.sourceMessageId.length, 240);}
  assert.equal(note.signalFingerprint, event.signalFingerprint); assert.equal(event.signalFingerprint, notification.signalFingerprint);
});
test("concurrent retries create exactly one note, event and notification", async () => {
  const f = await fixture(), results = await Promise.all([save(f.input), save(f.input), save(f.input)]);
  assert.equal(results.filter(Boolean).length, 1); assert.equal((await f.notes()).size, 1); assert.equal((await f.notifications()).size, 1);
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("notification failure rolls back both the note and event", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith("ai_internal_notifications/agent_signal_")) throw new Error("QA_SIGNAL_NOTIFICATION_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(save(f.input), /QA_SIGNAL_NOTIFICATION_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.notes()).size, 0); assert.equal((await f.notifications()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
});
test("edited source, deleted parent and recreated conversation reject all signal records", async () => {
  for (const change of ["message", "lead", "chat"]) {
    const f = await fixture();
    if (change === "message") await f.message.update({text: "Não tenho dúvidas sobre o preço"});
    if (change === "lead") await f.lead.delete();
    if (change === "chat") {const row = (await f.chat.get()).data()!; await f.chat.delete(); await f.chat.set(row);}
    await assert.rejects(save(f.input), AgentCommercialContextChanged);
    assert.equal((await f.notes()).size, 0); assert.equal((await f.notifications()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
test("replay preserves human edits and dismissed or deleted notifications", async () => {
  const f = await fixture(); await save(f.input);
  const note = (await f.notes()).docs[0], notification = (await f.notifications()).docs[0];
  await note.ref.update({text: "Correção humana"}); await notification.ref.update({status: "resolved"});
  assert.equal(await save(f.input), false); assert.equal((await note.ref.get()).data()?.text, "Correção humana");
  assert.equal((await notification.ref.get()).data()?.status, "resolved");
  await notification.ref.delete(); assert.equal(await save(f.input), false); assert.equal((await f.notifications()).size, 0);
});
test("changed payload for an accepted occurrence is refused without overwriting history", async () => {
  const f = await fixture(); await save(f.input); const before = (await f.notes()).docs[0];
  await assert.rejects(save({...f.input, note: "Outra interpretação para a mesma ocorrência"}), /RECEIPT_CONFLICT/);
  assert.ok((await before.ref.get()).updateTime!.isEqual(before.updateTime!));
});
test("a newly captured source revision can register its correction while retaining the previous history", async () => {
  const f = await fixture(); await save(f.input);
  await f.message.update({text: "Corrigindo: o preço está bom, minha dúvida é sobre o prazo"});
  const revision = (await f.message.get()).updateTime!;
  assert.equal(await save({...f.input, conversationFence: {...f.input.conversationFence, messageVersion: revision}, note: "Interpretação revista: dúvida sobre prazo"}), true);
  assert.equal((await f.notes()).size, 2); assert.equal((await f.lead.collection("events").get()).size, 2);
});
