import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import { randomUUID } from "node:crypto";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  const host = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).hostname;
  assert.ok(["127.0.0.1", "localhost"].includes(host), "Fixture must not access external services");
  return originalFetch(url, options);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { trackProposalOutcome } = await import("../lib/server/ai/learning-outcomes.ts");
const tenants: string[] = [];
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["ai_learning_events", "ai_learning_outcomes", "ai_tenant_learning_daily", "ai_learning_signals", "ai_tenant_learning_signal_daily", "ai_tenant_learning_recommendations"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) { assert.ok(tenantId.startsWith("qa_outcome_recovery_")); await row.ref.delete(); }
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_outcome_recovery_${randomUUID()}`; tenants.push(tenantId);
  const leadId = `${tenantId}_lead`, budgetId = `${tenantId}_proposal`;
  const event = adminDb.collection("ai_learning_events").doc(`${tenantId}_event`);
  await event.set({ tenantId, leadId, recommendedOffer: "Produto Shopify ficticio", nextAction: "enviar proposta", createdAt: new Date() });
  return { tenantId, leadId, budgetId, status: "Enviado", event };
}
test("outcome recovers signals after a committed outcome loses its acknowledgement", async () => {
  const input = await fixture();
  const original = adminDb.runTransaction.bind(adminDb);
  let injected = false;
  const fault = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (!injected) { injected = true; throw new Error("QA_OUTCOME_ACK_LOST"); }
    return result;
  });
  await assert.rejects(trackProposalOutcome(input), /QA_OUTCOME_ACK_LOST/); fault.mock.restore();
  assert.equal((await adminDb.collection("ai_learning_outcomes").where("tenantId", "==", input.tenantId).get()).size, 1);
  assert.equal((await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get()).size, 0);
  await trackProposalOutcome(input);
  const signals = await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get();
  assert.equal(signals.size, 3, "Recover closing, offer and next action from the same committed observation");
  await trackProposalOutcome(input);
  assert.equal((await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get()).size, 3);
});
test("outcome retry cannot substitute a later AI observation for the committed evidence", async () => {
  const input = await fixture(), original = adminDb.runTransaction.bind(adminDb);
  let injected = false;
  const fault = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (!injected) { injected = true; throw new Error("QA_OUTCOME_ACK_LOST"); }
    return result;
  });
  await assert.rejects(trackProposalOutcome(input), /QA_OUTCOME_ACK_LOST/); fault.mock.restore();
  await input.event.update({ recommendedOffer: "Oferta substituida", nextAction: "outra acao" });
  await trackProposalOutcome(input);
  const signals = await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get();
  assert.equal(signals.size, 3);
  assert.ok(signals.docs.some(doc => doc.data().targetId === "produto_shopify_ficticio"));
  assert.ok(signals.docs.every(doc => doc.data().targetId !== "oferta_substituida"));
  const recommendations = await adminDb.collection("ai_tenant_learning_recommendations").where("tenantId", "==", input.tenantId).get();
  assert.ok(recommendations.docs.every(doc => doc.data().status !== "approved"));
});
test("fresh and concurrent repeated outcomes preserve one observation and one set of signals", async () => {
  const input = await fixture();
  await Promise.all([trackProposalOutcome(input), trackProposalOutcome(input)]);
  const outcomes = await adminDb.collection("ai_learning_outcomes").where("tenantId", "==", input.tenantId).get();
  assert.equal(outcomes.size, 1); assert.equal(outcomes.docs[0].data().signalStatus, "done");
  assert.equal((await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get()).size, 3);
  const daily = await adminDb.collection("ai_tenant_learning_signal_daily").where("tenantId", "==", input.tenantId).get();
  assert.equal(daily.size, 1); assert.equal(daily.docs[0].data().totalSignals, 3);
});
test("partial signal commit is recovered without double counting or rewriting the observation", async () => {
  const input = await fixture(), original = adminDb.runTransaction.bind(adminDb);
  let transactions = 0;
  const fault = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (++transactions === 2) throw new Error("QA_SIGNAL_ACK_LOST");
    return result;
  });
  await assert.rejects(trackProposalOutcome(input), /QA_SIGNAL_ACK_LOST/); fault.mock.restore();
  const before = await adminDb.collection("ai_learning_outcomes").where("tenantId", "==", input.tenantId).get();
  assert.equal(before.docs[0].data().signalStatus, "pending");
  assert.equal((await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get()).size, 1);
  await trackProposalOutcome(input);
  const after = await before.docs[0].ref.get();
  assert.ok(after.data()?.createdAt.isEqual(before.docs[0].data().createdAt));
  assert.equal(after.data()?.signalStatus, "done");
  const daily = await adminDb.collection("ai_tenant_learning_signal_daily").where("tenantId", "==", input.tenantId).get();
  assert.equal(daily.docs[0].data().totalSignals, 3);
});
test("legacy outcome without a committed signal plan is not retrospectively learned", async () => {
  const input = await fixture(); await trackProposalOutcome(input);
  const outcomes = await adminDb.collection("ai_learning_outcomes").where("tenantId", "==", input.tenantId).get();
  const { FieldValue } = await import("firebase-admin/firestore");
  await outcomes.docs[0].ref.update({ signalPlanVersion: FieldValue.delete(), signalTargets: FieldValue.delete(), signalStatus: FieldValue.delete() });
  const signals = await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get();
  for (const signal of signals.docs) await signal.ref.delete();
  await trackProposalOutcome(input);
  assert.equal((await adminDb.collection("ai_learning_signals").where("tenantId", "==", input.tenantId).get()).size, 0);
  assert.equal((await outcomes.docs[0].ref.get()).data()?.signalPlanVersion, undefined);
});
