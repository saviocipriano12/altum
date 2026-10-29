import assert from "node:assert/strict";
import { after, before, test } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { reconcileTenantWhatsAppDeliveryReceipts: reconcile } = await import("../lib/server/whatsapp-delivery-reconciliation.ts");
const { whatsappDeliveryStateRef } = await import("../lib/server/whatsapp-delivery-status.ts");
const tenantId = `qa_reconcile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const phone = "qa-number-reconcile";
const chatId = `${tenantId}_chat`;
const id = (suffix: string) => `${tenantId}_${suffix}`;
before(async () => {
  await adminDb.collection("chats").doc(chatId).set({ tenantId, outboundTailJobId: "h" });
  for (const suffix of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    await adminDb.collection("messages").doc(id(suffix)).set({ tenantId, chatId, channel: "whatsapp", sender: suffix === "b" ? "client" : "agent",
      status: suffix === "c" ? "sending" : suffix === "f" ? "read" : "sent", deliveryStatus: suffix === "c" ? "queued" : suffix === "f" ? "read" : "sent",
      text: `Texto original ${suffix}`, metaMessageId: suffix, outboundJobId: suffix,
      ...(suffix === "d" ? {} : { channelPhoneNumberId: phone }) });
  }
  for (const [suffix, status] of [["a", "read"], ["e", "failed"], ["f", "sent"], ["h", "delivered"]]) {
    await adminDb.collection("whatsapp_delivery_events").doc(id(`legacy_${suffix}`)).set({ tenantId, phoneNumberId: phone,
      metaMessageId: suffix, status, deliveryAt: new Date(4000), errorCode: status === "failed" ? "qa-error" : "" });
  }
  await whatsappDeliveryStateRef(tenantId, phone, "g").set({ tenantId, phoneNumberId: phone, metaMessageId: "g", localMessageId: "different-message" });
  await adminDb.collection("messages").doc(id("foreign")).set({ tenantId: `${tenantId}_other`, chatId, sender: "agent", status: "sent", metaMessageId: "a", channelPhoneNumberId: phone });
});
after(async () => {
  for (const collection of ["messages", "chats", "whatsapp_delivery_events", "audit_logs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "in", [tenantId, `${tenantId}_other`]).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("pages repair accepted messages, preserve content and skip unsafe rows without dispatch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network forbidden in receipt reconciliation"); };
  try {
    let cursor: string | null = null;
    const seen: string[] = [];
    const counts = { reconciled: 0, skipped: 0, failed: 0 };
    do {
      const page = await reconcile({ tenantId, actorId: "qa-admin", limit: 2, cursor });
      seen.push(...page.results.map((row) => row.messageId));
      counts.reconciled += page.reconciled; counts.skipped += page.skipped; counts.failed += page.failed;
      cursor = page.nextCursor;
      assert.equal(page.hasMore, Boolean(cursor));
    } while (cursor);
    assert.equal(seen.length, 8); assert.equal(new Set(seen).size, 8);
    assert.deepEqual(counts, { reconciled: 4, skipped: 3, failed: 1 });
    const expected: Record<string, string> = { a: "read", b: "sent", c: "sending", d: "sent", e: "failed", f: "read", g: "sent", h: "delivered" };
    for (const [suffix, status] of Object.entries(expected)) {
      const row = (await adminDb.collection("messages").doc(id(suffix)).get()).data();
      assert.equal(row?.status, status); assert.equal(row?.text, `Texto original ${suffix}`);
    }
    assert.equal((await adminDb.collection("messages").doc(id("e")).get()).data()?.deliveryErrorCode, "qa-error");
    assert.equal((await adminDb.collection("messages").doc(id("foreign")).get()).data()?.status, "sent");
    assert.equal((await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).get()).size, 4);
    assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, 8);
  } finally { globalThis.fetch = originalFetch; }
});
test("cursor is tenant scoped, resumable and repeated pages do not resend or duplicate messages", async () => {
  const first = await reconcile({ tenantId, actorId: "qa-admin", limit: 2 });
  assert.ok(first.nextCursor);
  await assert.rejects(reconcile({ tenantId: `${tenantId}_other`, actorId: "qa-admin", cursor: first.nextCursor }), /outra empresa/);
  await assert.rejects(reconcile({ tenantId, actorId: "qa-admin", cursor: "invalid" }), /Cursor/);
  await assert.rejects(reconcile({ tenantId, actorId: "qa-admin", limit: 26 }), /Limite/);
  const next = await reconcile({ tenantId, actorId: "qa-admin", limit: 2, cursor: first.nextCursor });
  const repeated = await reconcile({ tenantId, actorId: "qa-admin", limit: 2, cursor: first.nextCursor });
  assert.deepEqual(next.results, repeated.results);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, 8);
});
test("forced history scan recovers a late legacy event after an earlier migration pass", async () => {
  await adminDb.collection("whatsapp_delivery_events").doc(id("late_h_read")).set({ tenantId, phoneNumberId: phone,
    metaMessageId: "h", status: "read", deliveryAt: new Date(5000) });
  await reconcile({ tenantId, actorId: "qa-admin", limit: 25 });
  assert.equal((await adminDb.collection("messages").doc(id("h")).get()).data()?.status, "read");
});

test("reconciliation cannot recreate a deleted message or bind an edited destination", async () => {
  const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
  const missing = adminDb.collection("messages").doc(id("deleted"));
  const args = { tenantId, chatId, metaMessageId: "deleted-external", channelPhoneNumberId: phone, status: "sent", deliveryStatus: "sent" };
  await assert.rejects(acknowledge(missing, args, { merge: true, reconcile: true, forceHistory: true }), /alterada/);
  assert.equal((await missing.get()).exists, false);
  const original = { ...args, sender: "agent", channelPhoneNumberId: "changed-number" };
  await missing.set(original);
  await assert.rejects(acknowledge(missing, args, { merge: true, reconcile: true, forceHistory: true }), /alterada/);
  assert.deepEqual((await missing.get()).data(), original);
});
