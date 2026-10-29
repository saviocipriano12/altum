import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DocumentReference, Transaction } from "firebase-admin/firestore";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { processWaitingReplyAutomations: consume } = await import("../lib/server/automations.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const name of ["leads", "chats", "automations", "jobs", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "pipeline", "ai_logs", "audit_logs"]) for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_waiting_recovery_${randomUUID()}`; tenants.push(tenantId);
  const lead = adminDb.collection("leads").doc(`${tenantId}_lead`), chat = adminDb.collection("chats").doc(`${tenantId}_chat`), automation = adminDb.collection("automations").doc(`${tenantId}_rule`);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await lead.set({ tenantId, nome: "Cliente Shopify fictício", pipelineStage: "captado", ownerId: "qa_seller" });
  await chat.set({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", lastClientMessageAt: new Date(Date.now() - 7200_000) });
  await automation.set({ tenantId, name: "Retorno de espera", enabled: true, status: "active", trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 }, actions: [{ type: "create_task", title: "Retornar cliente", sequenceOrder: 1 }, { type: "add_note", text: "Espera ainda pendente", sequenceOrder: 2 }] });
  return { tenantId, lead, chat, automation, tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get(), notes: () => adminDb.collection("lead_notes").where("tenantId", "==", tenantId).get() };
}
async function interrupt(f: Awaited<ReturnType<typeof fixture>>) {
  let injected = false;
  const originalDocument = DocumentReference.prototype.create, originalTransaction = Transaction.prototype.create;
  const fail = (ref: { parent: { id: string } }) => { if (!injected && ref.parent.id === "lead_notes") { injected = true; throw new Error("QA_WAITING_NOTE_INTERRUPTED"); } };
  const direct = mock.method(DocumentReference.prototype, "create", function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalDocument>) { fail(this); return originalDocument.apply(this, args); });
  const atomic = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof originalTransaction>) { fail(args[0]); return originalTransaction.apply(this, args); });
  try { await consume({ tenantId: f.tenantId }); } finally { direct.mock.restore(); atomic.mock.restore(); }
  assert.equal(injected, true); assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 0);
}
test("waiting timer resumes its remaining note after a committed task and preserves human editing", async () => {
  const f = await fixture(); await interrupt(f);
  const task = (await f.tasks()).docs[0]; await task.ref.update({ title: "Retorno editado pelo vendedor", status: "done" });
  await consume({ tenantId: f.tenantId });
  assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 1, "The remaining note must not disappear after partial execution");
  assert.equal((await task.ref.get()).data()?.title, "Retorno editado pelo vendedor"); assert.equal((await task.ref.get()).data()?.status, "done");
  await consume({ tenantId: f.tenantId }); assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 1);
});
for (const change of ["reply", "new_client", "lead_generation", "chat_generation", "config", "module"] as const) test(`waiting recovery refuses changed ${change}`, async () => {
  const f = await fixture(); await interrupt(f);
  const root = (await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_waiting_reply_runtime").get()).docs[0];
  assert.equal(root.data().status, "ready"); const task = (await f.tasks()).docs[0];
  if (change === "reply") await f.chat.update({ lastAgentMessageAt: new Date() });
  if (change === "new_client") await f.chat.update({ lastClientMessageAt: new Date() });
  if (change === "lead_generation") { const row = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(row); }
  if (change === "chat_generation") { const row = (await f.chat.get()).data()!; await f.chat.delete(); await f.chat.set(row); }
  if (change === "config") await f.automation.update({ actions: [{ type: "add_note", text: "Outra regra" }] });
  if (change === "module") await adminDb.collection("tenant_entitlements").doc(f.tenantId).update({ modules: { crm: false } });
  const { processPendingWaitingReplyOccurrences } = await import("../lib/server/crm/waiting-reply-occurrence.ts");
  await processPendingWaitingReplyOccurrences({ tenantId: f.tenantId });
  assert.equal((await root.ref.get()).data()?.status, "reconciliation_required"); assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 0);
  assert.equal((await task.ref.get()).data()?.title, "Retornar cliente");
});
test("the real periodic worker recovers waiting receipts without another watchdog admission", async () => {
  const f = await fixture(); await interrupt(f);
  const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
  const result = await processPendingAutomationActions({ tenantId: f.tenantId }); assert.equal(result.waitingRecovery.completed, 1);
  assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 1);
});
