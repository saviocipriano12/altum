import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { processEcommerceWebhook, processEcommerceSyncEvent, normalizeWebhookEvent } = await import("../lib/server/ecommerce.ts");
const { admitShopifyOccurrence, runShopifyOccurrence } = await import("../lib/server/commerce/shopify-occurrence.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const { getDefaultPipelineStages } = await import("../lib/pipeline.ts");
const { commitShopifyLeadProjection } = await import("../lib/server/crm/ecommerce-projection.ts");
const tenantId = `qa_ecommerce_projection_${Date.now()}`, originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("No external requests in Shopify projection QA"); };
function hash(parts: string[]) { return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32); }
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["leads", "lead_identities", "pipeline", "tenant_settings", "ecommerce_connections", "ecommerce_events", "ecommerce_orders", "ecommerce_customers",
    "ecommerce_abandoned_carts", "ecommerce_commercial_actions", "commercial_agent_actions", "lead_tasks", "jobs", "contacts", "contact_identity_aliases", "growth_events",
    "lead_conversion_trails", "pixel_dispatch_logs", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) {
      if (collection === "leads") await adminDb.recursiveDelete(row.ref); else await row.ref.delete();
    }
  }
  await adminDb.terminate();
});
async function fixture(name: string) {
  const leadId = `${tenantId}_${name}`, connectionId = `${leadId}_connection`, email = `${name}@qa.invalid`, ref = adminDb.collection("leads").doc(leadId);
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: getDefaultPipelineStages() });
  await adminDb.collection("ecommerce_connections").doc(connectionId).set({ tenantId, provider: "shopify", status: "active" });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ecommerceAutomation: { agent: { mode: "off" } } });
  await ref.set({ tenantId, nome: "Cliente ficticio", email, channel: "ecommerce", pipelineStage: "captado", stage: "captado", priority: "low", tags: ["Escolha humana"],
    ownerId: "qa-human", notes: "Nota interna", crmFieldOwnership: Object.fromEntries(["pipelineStage", "priority", "tags"].map(field => [field, { source: "manual", locked: true, actorId: "qa-human" }])) });
  const call = (topic: string, payload: Record<string, unknown>, eventId = `${name}-${topic}`) => processEcommerceWebhook({ tenantId, connectionId, provider: "shopify", payload, trusted: true,
    req: new Request("http://127.0.0.1/qa-shopify", { headers: { "x-shopify-topic": topic, "x-shopify-webhook-id": eventId } }) });
  const customer = { id: `${name}-customer`, first_name: "Cliente", email };
  return { leadId, connectionId, email, ref, call, customer, name };
}
async function assertHuman(ref: FirebaseFirestore.DocumentReference) {
  const lead = (await ref.get()).data()!;
  assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["Escolha humana"]);
  assert.equal(lead.pipelineStage, "captado"); assert.equal(lead.ownerId, "qa-human");
}
test("the actual Shopify order projection preserves human priority and tags after intake", async () => {
  const input = await fixture("order-manual");
  await input.call("orders/paid", { id: "qa-order-manual", name: "QA-ORDER", financial_status: "paid", total_price: "100", customer: input.customer,
    line_items: [{ title: "Produto ficticio", quantity: 1, price: "100" }] });
  await assertHuman(input.ref); assert.equal((await input.ref.get()).data()?.commercialState.lastEcommercePaymentStatus, "paid");
});
test("the actual Shopify abandoned-cart projection preserves human priority and tags after intake", async () => {
  const input = await fixture("cart-manual");
  await input.call("checkouts/abandoned", { id: "qa-cart-manual", customer: input.customer, total_price: "100", line_items: [{ title: "Produto ficticio", quantity: 1 }] });
  await assertHuman(input.ref); assert.equal((await input.ref.get()).data()?.commercialState.lastAbandonedCartId, "qa-cart-manual");
});
test("the actual Shopify recovered-cart projection cannot append tags to a manually owned field", async () => {
  const input = await fixture("recovered-manual"), cartId = "qa-cart-recovered";
  await adminDb.collection("ecommerce_abandoned_carts").doc(hash([tenantId, input.connectionId, cartId])).set({ tenantId, leadId: input.leadId });
  await input.call("checkouts/recovered", { id: cartId, customer: input.customer, completed_at: "2026-10-19T18:00:00Z" });
  await assertHuman(input.ref); assert.equal((await input.ref.get()).data()?.commercialState.lastRecoveredCartId, cartId);
});

test("Shopify sync replays the same snapshot but treats a changed snapshot as a new occurrence", async () => {
  const input = await fixture("sync-revision");
  const event = { topic: "orders/update", externalEventId: "sync:order:qa-sync-order", payload: { id: "qa-sync-order", name: "QA-SYNC", financial_status: "paid", total_price: "100", customer: input.customer } };
  const call = (payload = event.payload) => processEcommerceSyncEvent({ tenantId, connectionId: input.connectionId, provider: "shopify", event: { ...event, payload } });
  const first = await call(), repeated = await call(); assert.equal(first.eventId, repeated.eventId);
  const reordered = await call({ customer: input.customer, total_price: "100", financial_status: "paid", name: "QA-SYNC", id: "qa-sync-order" });
  assert.equal(reordered.eventId, first.eventId);
  const changed = await call({ ...event.payload, total_price: "120" }); assert.notEqual(changed.eventId, first.eventId);
  assert.equal((await input.ref.get()).data()?.commercialState.lastEcommerceAmount, 120); await assertHuman(input.ref);
});

async function projectionFixture(name: string, manual = true) {
  const setup = await fixture(name), sourceEventId = `${setup.leadId}_source`, externalId = `${name}-order`, eventId = `${name}-occurrence`;
  if (!manual) await setup.ref.update({ crmFieldOwnership: {}, tags: ["existente"] });
  const sourceRef = adminDb.collection("ecommerce_events").doc(sourceEventId);
  await sourceRef.set({ tenantId, connectionId: setup.connectionId, provider: "shopify", externalEventId: eventId,
    normalized: { order: { externalOrderId: externalId, paymentStatus: "paid", totalPrice: 100, customerEmail: setup.email } } });
  return { ...setup, sourceRef, input: { tenantId, connectionId: setup.connectionId, leadId: setup.leadId, sourceEventId, externalId, eventId, kind: "order" as const,
    patch: { priority: "high", tags: ["ecommerce"], commercialState: { lastEcommerceAmount: 100 } }, eventData: { type: "ecommerce_order", title: "QA" } } };
}
test("concurrent projections commit once, audit the change and record system authorship", async () => {
  const setup = await projectionFixture("concurrent", false);
  const results = await Promise.all(Array.from({ length: 5 }, () => commitShopifyLeadProjection(setup.input)));
  assert.equal(results.filter(result => !result.replayed).length, 1);
  assert.equal(new Set(results.map(result => result.eventId)).size, 1);
  const lead = (await setup.ref.get()).data()!; assert.equal(lead.priority, "high"); assert.deepEqual(lead.tags, ["existente", "ecommerce"]);
  assert.equal(lead.crmFieldOwnership.priority.source, "system_event"); assert.equal(lead.crmFieldOwnership.tags.sourceEventId, setup.sourceRef.id);
  const event = (await setup.ref.collection("events").doc(results[0].eventId).get()).data()!;
  assert.equal(event.evaluatedFields.priority.previous, "low"); assert.equal(event.evaluatedFields.priority.applied, "high");
  assert.equal(event.projectionReceipt.completionMeaning, "lead_projection_committed_not_downstream");
  assert.equal((await setup.ref.collection("events").get()).size, 1);
});

test("projection replay preserves a later human edit and leaves both receipt and lead versions unchanged", async () => {
  const setup = await projectionFixture("replay", false), first = await commitShopifyLeadProjection(setup.input);
  await setup.ref.update({ priority: "low", tags: ["Revisado depois"], commercialState: { lastEcommerceAmount: 75 },
    crmFieldOwnership: { priority: { source: "manual", locked: true }, tags: { source: "manual", locked: true } } });
  const before = await setup.ref.get(), sourceBefore = await setup.sourceRef.get(), eventRef = setup.ref.collection("events").doc(first.eventId), auditBefore = await eventRef.get();
  const replay = await commitShopifyLeadProjection(setup.input); assert.equal(replay.replayed, true);
  assert.ok((await setup.ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await setup.sourceRef.get()).updateTime!.isEqual(sourceBefore.updateTime!));
  assert.ok((await eventRef.get()).updateTime!.isEqual(auditBefore.updateTime!));
});

test("an audit commit failure rolls back projection, ownership and source receipt together", async () => {
  const setup = await projectionFixture("rollback", false), before = await setup.ref.get(), sourceBefore = await setup.sourceRef.get();
  const { Transaction } = await import("firebase-admin/firestore"), originalCreate = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (ref.path.startsWith(`${setup.ref.path}/events/`)) throw new Error("QA_PROJECTION_AUDIT_UNAVAILABLE"); return originalCreate.call(this, ref, data);
  });
  try {
    await assert.rejects(commitShopifyLeadProjection(setup.input), /QA_PROJECTION_AUDIT_UNAVAILABLE/);
    assert.ok((await setup.ref.get()).updateTime!.isEqual(before.updateTime!));
    assert.ok((await setup.sourceRef.get()).updateTime!.isEqual(sourceBefore.updateTime!));
    assert.equal((await setup.ref.collection("events").get()).size, 0);
  } finally { interceptor.mock.restore(); }
});

test("revoked connection, foreign source and mismatched order cannot authorize a projection", async () => {
  const setup = await projectionFixture("authority"), before = await setup.ref.get();
  const connection = adminDb.collection("ecommerce_connections").doc(setup.connectionId);
  await connection.update({ status: "paused" }); await assert.rejects(commitShopifyLeadProjection(setup.input), /SOURCE_REVOKED/);
  await connection.update({ status: "active" }); await setup.sourceRef.update({ tenantId: "qa-foreign" });
  try { await assert.rejects(commitShopifyLeadProjection(setup.input), /SOURCE_REVOKED/); }
  finally { await setup.sourceRef.update({ tenantId }); }
  await assert.rejects(commitShopifyLeadProjection({ ...setup.input, externalId: "another-order" }), /SOURCE_REVOKED/);
  assert.ok((await setup.ref.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await setup.ref.collection("events").get()).size, 0);
});

test("an accepted source cannot be reused for another customer or with an altered snapshot", async () => {
  const setup = await projectionFixture("frozen-source"), other = await fixture("other-destination");
  await commitShopifyLeadProjection(setup.input); const before = await other.ref.get();
  await assert.rejects(commitShopifyLeadProjection({ ...setup.input, leadId: other.leadId }), /RECEIPT_CONFLICT/);
  assert.ok((await other.ref.get()).updateTime!.isEqual(before.updateTime!));
  await setup.sourceRef.update({ "normalized.order.totalPrice": 300 });
  await assert.rejects(commitShopifyLeadProjection(setup.input), /RECEIPT_CONFLICT/);
  assert.equal((await setup.ref.get()).data()?.commercialState.lastEcommerceAmount, 100);
});

test("legacy, unknown and incomplete projection receipts require reconciliation", async () => {
  const setup = await projectionFixture("legacy-receipt");
  const auditRef = setup.ref.collection("events").doc(hash([tenantId, setup.connectionId, setup.input.eventId, "order_journey"]));
  const before = await setup.ref.get(); await auditRef.set({ title: "Registro legado sem recibo" });
  await assert.rejects(commitShopifyLeadProjection(setup.input), /RECEIPT_CONFLICT/); await auditRef.delete();
  await setup.sourceRef.update({ "crmProjectionReceipts.order": null });
  await assert.rejects(commitShopifyLeadProjection(setup.input), /RECEIPT_CONFLICT/);
  const { FieldValue } = await import("firebase-admin/firestore"); await setup.sourceRef.update({ crmProjectionReceipts: FieldValue.delete() });
  const accepted = await commitShopifyLeadProjection(setup.input); await setup.sourceRef.update({ "crmProjectionReceipts.order.protocolVersion": 99 });
  await assert.rejects(commitShopifyLeadProjection(setup.input), /RECEIPT_CONFLICT/);
  await setup.sourceRef.update({ "crmProjectionReceipts.order.protocolVersion": 1 }); await setup.ref.collection("events").doc(accepted.eventId).delete();
  await assert.rejects(commitShopifyLeadProjection(setup.input), /RECEIPT_CONFLICT/);
  assert.equal((await setup.ref.get()).data()?.priority, before.data()?.priority);
});

test("a deleted projection destination is not recreated on replay", async () => {
  const setup = await projectionFixture("deleted-destination"); await commitShopifyLeadProjection(setup.input); await setup.ref.delete();
  try { await assert.rejects(commitShopifyLeadProjection(setup.input), /DESTINATION_INVALID/); assert.equal((await setup.ref.get()).exists, false); }
  finally { await adminDb.recursiveDelete(setup.ref); }
});

test("a repeated Shopify delivery does not run intake or overwrite later human edits again", async () => {
  const input = await fixture("root-replay"), payload = { id: "qa-root-order", financial_status: "paid", total_price: "100", customer: input.customer };
  await input.call("orders/paid", payload);
  await input.ref.update({ "commercialState.lastEcommerceAmount": 75, notes: "Nota depois do aceite" });
  const before = await input.ref.get(), eventsBefore = await input.ref.collection("events").get();
  await input.call("orders/paid", payload);
  assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await input.ref.collection("events").get()).size, eventsBefore.size);
});

test("a reused webhook ID with another payload cannot rewrite its accepted source or order", async () => {
  const input = await fixture("root-source"), payload = { id: "qa-root-source", financial_status: "paid", total_price: "100", customer: input.customer };
  const first = await input.call("orders/paid", payload);
  const sourceRef = adminDb.collection("ecommerce_events").doc(first.eventId!), before = await input.ref.get();
  const orderRef = adminDb.collection("ecommerce_orders").doc(hash([tenantId, input.connectionId, payload.id])), orderBefore = await orderRef.get();
  await assert.rejects(input.call("orders/paid", { ...payload, total_price: "300" }));
  assert.equal((await sourceRef.get()).data()?.normalized.order.totalPrice, 100);
  assert.ok((await orderRef.get()).updateTime!.isEqual(orderBefore.updateTime!));
  assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
});

async function occurrenceFixture(name: string) {
  const setup = await fixture(name), externalEventId = `${name}-root`, topic = "orders/paid";
  const payload = { id: `${name}-order`, financial_status: "paid", total_price: "100", customer: setup.customer };
  const normalized = normalizeWebhookEvent("shopify", payload, new Headers({ "x-shopify-topic": topic, "x-shopify-webhook-id": externalEventId }));
  const id = hash([tenantId, setup.connectionId, externalEventId]), sourceRef = adminDb.collection("ecommerce_events").doc(id);
  return { ...setup, payload, externalEventId, topic, sourceRef, source: { id, tenantId, connectionId: setup.connectionId, topic, externalEventId, payload,
    normalized: { product: normalized.product || null, order: normalized.order || null, cart: normalized.cart || null } } };
}

test("concurrent real deliveries have one handler execution, one intake and one connection increment", async () => {
  const input = await occurrenceFixture("root-concurrent");
  const results = await Promise.all(Array.from({ length: 5 }, () => input.call(input.topic, input.payload, input.externalEventId)));
  assert.equal(results.filter(result => "completed" in result && result.completed && !result.replayed).length, 1);
  const row = (await input.sourceRef.get()).data()!; assert.equal(row.occurrence.status, "done"); assert.equal(row.occurrence.attempts, 1); assert.equal(row.deliveryCount, 5);
  assert.equal((await input.ref.collection("events").where("type", "==", "ecommerce_order").get()).size, 2);
  assert.equal((await adminDb.collection("ecommerce_connections").doc(input.connectionId).get()).data()?.orderCount, 1);
});

test("a ready occurrence is resumed once by the existing periodic consumer without another delivery", async () => {
  const input = await occurrenceFixture("root-ready"); await admitShopifyOccurrence(input.source);
  assert.equal((await input.ref.collection("events").get()).size, 0);
  const workers = await Promise.all(Array.from({ length: 3 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  assert.equal(workers.reduce((sum, result) => sum + result.shopifyRecovery.completed, 0), 1);
  const row = (await input.sourceRef.get()).data()!; assert.equal(row.occurrence.status, "done"); assert.equal(row.occurrence.attempts, 1); assert.equal(row.deliveryCount, 1);
  assert.equal((await input.ref.collection("events").where("type", "==", "ecommerce_order").get()).size, 2);
});

test("a real partial failure is quarantined and redelivery does not repeat the committed intake", async () => {
  const input = await occurrenceFixture("root-partial"), { Transaction } = await import("firebase-admin/firestore"), originalCreate = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (ref.path.startsWith(`${input.ref.path}/events/`) && data.projectionReceipt) throw new Error("QA_ROOT_PARTIAL_FAILURE"); return originalCreate.call(this, ref, data);
  });
  try { await assert.rejects(input.call(input.topic, input.payload, input.externalEventId), /QA_ROOT_PARTIAL_FAILURE/); }
  finally { interceptor.mock.restore(); }
  const before = await input.ref.get(), eventCount = (await input.ref.collection("events").get()).size;
  assert.equal((await input.ref.collection("events").where("type", "==", "ecommerce_order").get()).size, 1);
  assert.equal((await input.sourceRef.get()).data()?.occurrence.status, "reconciliation_required");
  const replay = await input.call(input.topic, input.payload, input.externalEventId);
  assert.ok("completed" in replay); assert.equal(replay.completed, false); assert.equal(replay.requiresReconciliation, true);
  assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await input.ref.collection("events").get()).size, eventCount);
});

test("expired started work is reconciled by the worker without running the handlers again", async () => {
  const input = await occurrenceFixture("root-expired"); await admitShopifyOccurrence(input.source);
  await input.sourceRef.update({ "occurrence.status": "processing", "occurrence.claimToken": "qa-expired", "occurrence.leaseUntil": new Date(1), "occurrence.attempts": 1 });
  const result = await processPendingAutomationActions({ tenantId, limit: 100 }); assert.equal(result.shopifyRecovery.reconciled, 1);
  assert.equal((await input.sourceRef.get()).data()?.occurrence.status, "reconciliation_required"); assert.equal((await input.ref.collection("events").get()).size, 0);
});

test("paused ready work and a tampered admitted payload cannot reach intake", async () => {
  const input = await occurrenceFixture("root-paused"); await admitShopifyOccurrence(input.source);
  await adminDb.collection("ecommerce_connections").doc(input.connectionId).update({ status: "paused" });
  await processPendingAutomationActions({ tenantId, limit: 100 }); assert.equal((await input.sourceRef.get()).data()?.occurrence.status, "reconciliation_required");
  assert.equal((await input.ref.collection("events").get()).size, 0);
  const tampered = await occurrenceFixture("root-tampered"); await admitShopifyOccurrence(tampered.source);
  await tampered.sourceRef.update({ "payload.total_price": "999" }); await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await tampered.sourceRef.get()).data()?.occurrence.status, "reconciliation_required"); assert.equal((await tampered.ref.collection("events").get()).size, 0);
});

test("legacy events are not promoted and a wrong tenant cannot claim admitted work", async () => {
  const input = await occurrenceFixture("root-legacy"); await input.sourceRef.set({ tenantId, provider: "shopify", connectionId: input.connectionId, payload: input.payload });
  const before = await input.sourceRef.get(); await assert.rejects(input.call(input.topic, input.payload, input.externalEventId), /INVALID_OR_LEGACY/);
  assert.ok((await input.sourceRef.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await input.ref.collection("events").get()).size, 0);
  const ready = await occurrenceFixture("root-foreign"); await admitShopifyOccurrence(ready.source);
  await assert.rejects(runShopifyOccurrence(ready.source.id, "qa-foreign-tenant", async () => assert.fail("Cannot execute a foreign occurrence")), /INVALID_OR_LEGACY/);
  assert.equal((await ready.sourceRef.get()).data()?.occurrence.status, "ready");
  // Prevent this fixture from being picked up by subsequent recovery tests.
  await ready.sourceRef.update({ "occurrence.status": "reconciliation_required" });
});

test("revocation inside a claimed execution is detected before the next handler boundary", async () => {
  const input = await occurrenceFixture("root-revoked"); await admitShopifyOccurrence(input.source);
  await assert.rejects(runShopifyOccurrence(input.source.id, tenantId, async assertActive => {
    await adminDb.collection("ecommerce_connections").doc(input.connectionId).update({ status: "paused" }); await assertActive();
  }), /CONNECTION_REVOKED/);
  assert.equal((await input.sourceRef.get()).data()?.occurrence.status, "reconciliation_required");
  assert.equal((await input.ref.collection("events").get()).size, 0);
});

test("a new process resumes an admitted ready event through the same periodic consumer", async context => {
  const input = await occurrenceFixture("root-cold-ready"); await admitShopifyOccurrence(input.source);
  const startedAt = performance.now();
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/shopify-occurrence-worker.mts", import.meta.url))], {
      timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_SHOPIFY_OCCURRENCE_TENANT: tenantId },
    }, (error, stdout, stderr) => {
      const phases = stderr.split(/\r?\n/).filter(line => /^QA_OCCURRENCE_PHASE [a-z_]+:\d+ms$/.test(line) ||
        /^QA_OCCURRENCE_IMPORT elapsed=\d+ms cpu=\d+ms rss=\d+MB$/.test(line));
      context.diagnostic(`Cold worker wall=${Math.round(performance.now() - startedAt)}ms; ${phases.join("; ")}`);
      if (error) reject(error); else resolve(stdout);
    }));
  const result = JSON.parse(output); assert.equal(result.shopifyRecovery.completed, 1);
  const row = (await input.sourceRef.get()).data()!; assert.equal(row.occurrence.status, "done"); assert.equal(row.occurrence.attempts, 1); assert.equal(row.deliveryCount, 1);
  assert.equal((await input.ref.collection("events").where("type", "==", "ecommerce_order").get()).size, 2);
});

test("connection metadata, counters and occurrence completion cannot commit partially", async () => {
  const input = await occurrenceFixture("root-finish-rollback"), { Transaction } = await import("firebase-admin/firestore");
  const originalUpdate = Transaction.prototype.update as (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => FirebaseFirestore.Transaction;
  const interceptor = mock.method(Transaction.prototype, "update", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) {
    if (ref.path === `ecommerce_connections/${input.connectionId}` && Object.hasOwn(data, "orderCount")) throw new Error("QA_CONNECTION_COMMIT_UNAVAILABLE");
    return originalUpdate.call(this, ref, data);
  });
  try { await assert.rejects(input.call(input.topic, input.payload, input.externalEventId), /QA_CONNECTION_COMMIT_UNAVAILABLE/); }
  finally { interceptor.mock.restore(); }
  const connection = (await adminDb.collection("ecommerce_connections").doc(input.connectionId).get()).data()!;
  assert.equal(connection.orderCount, undefined); assert.equal(connection.connectionStatus, undefined);
  assert.equal((await input.sourceRef.get()).data()?.occurrence.status, "reconciliation_required");
  const count = (await input.ref.collection("events").get()).size;
  const replay = await input.call(input.topic, input.payload, input.externalEventId); assert.equal("completed" in replay && replay.completed, false);
  assert.equal((await input.ref.collection("events").get()).size, count);
});

test("a connection deleted during execution is not recreated by completion", async () => {
  const input = await occurrenceFixture("root-connection-deleted"); await admitShopifyOccurrence(input.source);
  const connection = adminDb.collection("ecommerce_connections").doc(input.connectionId);
  await assert.rejects(runShopifyOccurrence(input.source.id, tenantId, async () => { await connection.delete(); return { connectionStatus: "receiving_events" }; }), /CONNECTION_REVOKED/);
  assert.equal((await connection.get()).exists, false); assert.equal((await input.sourceRef.get()).data()?.occurrence.status, "reconciliation_required");
});
