import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Transaction } from "firebase-admin/firestore";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { processWaitingReplyAutomations: consume } = await import("../lib/server/automations.ts");
const { claimWaitingReplyRuntimeV2: oldClaim } = await import("./fixtures/waiting-runtime-v2.mts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const name of ["leads", "chats", "automations", "jobs", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "ai_logs", "audit_logs"]) for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_waiting_v2_${randomUUID()}`; tenants.push(tenantId);
  const lead = adminDb.collection("leads").doc(`${tenantId}_lead`), chat = adminDb.collection("chats").doc(`${tenantId}_chat`), automation = adminDb.collection("automations").doc(`${tenantId}_rule`), waitingAt = new Date(Date.now() - 7200_000);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await lead.set({ tenantId, nome: "Cliente Shopify fictício", pipelineStage: "captado" });
  await chat.set({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", lastClientMessageAt: waitingAt });
  await automation.set({ tenantId, name: "Espera fictícia", enabled: true, status: "active", trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 }, actions: [{ type: "create_task", title: "Retornar", sequenceOrder: 1 }, { type: "add_note", text: "Nota restante", sequenceOrder: 2 }] });
  return { tenantId, input: { tenantId, leadId: lead.id, chatId: chat.id, automationId: automation.id, waitingKey: String(waitingAt.getTime()) }, tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get(), notes: () => adminDb.collection("lead_notes").where("tenantId", "==", tenantId).get() };
}
for (const status of ["claimed", "done", "error"] as const) test(`canonical v2 ${status} remains unchanged and cannot acquire new receipts`, async () => {
  const f = await fixture(), root = await oldClaim(f.input); assert.ok(root);
  await root.update({ status }); const before = await root.get();
  await consume({ tenantId: f.tenantId });
  const { processPendingWaitingReplyOccurrences } = await import("../lib/server/crm/waiting-reply-occurrence.ts"); await processPendingWaitingReplyOccurrences({ tenantId: f.tenantId });
  assert.ok((await root.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await root.get()).data()?.stageAutomationPlans, undefined);
  assert.equal((await f.tasks()).size, 0); assert.equal((await f.notes()).size, 0);
});
test("the actual v2 claimant refuses a partial current runtime and the current worker resumes its note", async () => {
  const f = await fixture(), original = Transaction.prototype.create; let injected = false;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (!injected && args[0].parent.id === "lead_notes") { injected = true; throw new Error("QA_WAITING_V3_NOTE_INTERRUPTED"); } return original.apply(this, args);
  });
  try { await consume({ tenantId: f.tenantId }); } finally { hook.mock.restore(); }
  assert.equal(injected, true); assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 0);
  const root = (await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_waiting_reply_runtime").get()).docs[0];
  await root.ref.update({ status: "processing", leaseUntil: new Date(0), claimToken: "expired_qa_worker" }); const before = await root.ref.get();
  await assert.rejects(oldClaim(f.input), /Identidade da automacao de espera alterada/); assert.ok((await root.ref.get()).updateTime!.isEqual(before.updateTime!));
  await consume({ tenantId: f.tenantId }); assert.equal((await root.ref.get()).data()?.status, "done"); assert.equal((await f.tasks()).size, 1); assert.equal((await f.notes()).size, 1);
});
