import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { normalizeCanonicalInboundEvent } from "../lib/server/messaging/inbound-event.ts";

const PROJECT_ID = "demo-altum-inbound-pipeline";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantA = `tenant_a_${suffix}`;
const tenantB = `tenant_b_${suffix}`;

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let recordInboundEventMetric: typeof import("../lib/server/messaging/inbound-observability.ts").recordInboundEventMetric;

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  ({ recordInboundEventMetric } = await import("../lib/server/messaging/inbound-observability.ts"));
});

after(async () => {
  for (const collectionName of ["messages", "inbound_claims", "metrics"]) {
    const snap = await adminDb.collection(collectionName).get();
    await Promise.all(
      snap.docs
        .filter((doc) => JSON.stringify(doc.data()).includes(suffix))
        .map((doc) => doc.ref.delete())
    );
  }
});

function event(tenantId: string, channelId: string) {
  const result = normalizeCanonicalInboundEvent({
    tenantId,
    channel: "instagram",
    channelId,
    provider: "meta",
    providerEventId: `message_${suffix}`,
    senderExternalId: "contact-1",
    recipientExternalId: channelId,
    occurredAt: 1_700_000_000_000,
    receivedAt: 1_700_000_001_000,
    text: "Olá",
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error(result.reason);
  return result.event;
}

test("canonical Firestore ids are idempotent and isolated by tenant and channel account", async () => {
  const first = event(tenantA, "page-1");
  const duplicate = event(tenantA, "page-1");
  const otherPage = event(tenantA, "page-2");
  const otherTenant = event(tenantB, "page-1");

  assert.equal(first.messageDocumentId, duplicate.messageDocumentId);
  assert.notEqual(first.messageDocumentId, otherPage.messageDocumentId);
  assert.notEqual(first.messageDocumentId, otherTenant.messageDocumentId);

  const claim = async (eventKey: string) => adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("inbound_claims").doc(eventKey);
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { eventKey, testSuffix: suffix });
    return true;
  });
  assert.equal(await claim(first.eventKey), true);
  assert.equal(await claim(duplicate.eventKey), false);

  await Promise.all([first, otherPage, otherTenant].map((item) =>
    adminDb.collection("messages").doc(item.messageDocumentId).set({
      tenantId: item.tenantId,
      channelId: item.channelId,
      conversationIdentityKey: item.conversationIdentityKey,
      testSuffix: suffix,
    })
  ));
  const messages = await adminDb.collection("messages").where("testSuffix", "==", suffix).get();
  assert.equal(messages.size, 3);
});

test("inbound observability increments outcomes without mixing tenants", async () => {
  await recordInboundEventMetric({
    tenantId: tenantA,
    channel: "instagram",
    outcome: "accepted",
    reason: `queued_${suffix}`,
    deliveryClass: "on_time",
    attachmentCount: 2,
  });
  await recordInboundEventMetric({
    tenantId: tenantA,
    channel: "instagram",
    outcome: "duplicate",
    reason: `duplicate_${suffix}`,
    deliveryClass: "delayed",
  });
  await recordInboundEventMetric({
    tenantId: tenantB,
    channel: "whatsapp",
    outcome: "invalid",
    reason: `invalid_${suffix}`,
  });

  const metrics = await adminDb.collection("metrics").where("type", "==", "inbound_events_daily").get();
  const a = metrics.docs.find((doc) => doc.data().tenantId === tenantA)?.data();
  const b = metrics.docs.find((doc) => doc.data().tenantId === tenantB)?.data();
  assert.equal(a?.counters?.accepted, 1);
  assert.equal(a?.counters?.duplicate, 1);
  assert.equal(a?.channelCounters?.instagram?.accepted, 1);
  assert.equal(a?.attachments, 2);
  assert.equal(b?.counters?.invalid, 1);
  assert.equal(b?.channelCounters?.whatsapp?.invalid, 1);
});
