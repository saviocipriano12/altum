import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Dedicated, ephemeral loopback fixtures. No provider configuration or real data.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const app = initializeApp({ projectId: "demo-altum-qa-lab" }, "qa-delivery-reconcile-http");
const db = getFirestore(app);
const auth = getAuth(app);
const tenantId = `qa_http_receipts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const otherTenantId = `${tenantId}_other`;
const tokens = new Map<string, string>();
const createdUsers: string[] = [];
const profiles = [
  { key: "owner", role: "client_owner" },
  { key: "agent", role: "client_agent" },
  { key: "channels-only", role: "client_agent", capabilities: ["respond_inbox", "manage_channels"] },
  { key: "team-only", role: "client_agent", capabilities: ["respond_inbox", "view_team_records"] },
];
const post = (key: string | null, body: unknown = { action: "reconcile_delivery", limit: 1 }, tenant = tenantId) =>
  fetch(`http://127.0.0.1:3199/api/tenant/${tenant}/chats/outbound-queue`, {
    method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${tokens.get(key)}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });

before(async () => {
  await db.collection("tenants").doc(tenantId).set({ tenantId, name: "Empresa ficticia HTTP recibos", status: "active", billingStatus: "active", accessStatus: "active" });
  await db.collection("tenant_entitlements").doc(tenantId).set({ tenantId, version: 1, mode: "custom", modules: { inbox: true }, limits: {}, isLegacyFallback: false });
  for (const profile of profiles) {
    const uid = `${tenantId}_${profile.key}`;
    const email = `${uid}@qa.invalid`;
    await auth.createUser({ uid, email, password: "QaHttpReceiptsLocal2026!", emailVerified: true });
    createdUsers.push(uid);
    await db.collection("users").doc(uid).set({ tenantId, uid, email, name: profile.key, role: profile.role, status: "active" });
    await db.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: profile.role, status: "active", isDefault: true,
      ...("capabilities" in profile ? { capabilities: profile.capabilities } : {}) });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "QaHttpReceiptsLocal2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    tokens.set(profile.key, (await response.json()).idToken);
  }
  for (const suffix of ["a", "b"]) {
    await db.collection("messages").doc(`${tenantId}_${suffix}`).set({ tenantId, chatId: `${tenantId}_chat`, sender: "agent", channel: "whatsapp",
      status: "sent", metaMessageId: suffix, channelPhoneNumberId: "qa-http-receipt-number", text: `Texto ficticio ${suffix}` });
    await db.collection("whatsapp_delivery_events").doc(`${tenantId}_legacy_${suffix}`).set({ tenantId, phoneNumberId: "qa-http-receipt-number",
      metaMessageId: suffix, status: "read", deliveryAt: new Date(4000) });
  }
  await db.collection("messages").doc(`${tenantId}_foreign`).set({ tenantId: otherTenantId, sender: "agent", status: "sent", text: "Outro tenant ficticio" });
});
after(async () => {
  tokens.clear();
  for (const collection of ["messages", "whatsapp_delivery_events", "audit_logs", "users", "tenant_users", "tenants", "tenant_entitlements"]) {
    const rows = await db.collection(collection).where("tenantId", "in", [tenantId, otherTenantId]).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await Promise.all(createdUsers.map((uid) => auth.deleteUser(uid)));
  await db.terminate(); await deleteApp(app);
});

test("HTTP reconciliation rejects anonymous requests and does not create audits", async () => {
  assert.equal((await post(null)).status, 401);
  assert.equal((await db.collection("audit_logs").where("tenantId", "==", tenantId).get()).size, 0);
});
test("HTTP reconciliation requires both channel management and team visibility", async () => {
  for (const key of ["agent", "channels-only", "team-only"]) {
    const response = await post(key);
    assert.equal(response.status, 403, key);
    assert.equal((await response.json()).code, "tenant_capability_denied");
  }
  assert.equal((await db.collection("audit_logs").where("tenantId", "==", tenantId).get()).size, 0);
  assert.equal((await db.collection("messages").doc(`${tenantId}_a`).get()).data()?.status, "sent");
});
test("HTTP owner cannot repair another tenant", async () => {
  assert.equal((await post("owner", undefined, otherTenantId)).status, 403);
  assert.equal((await db.collection("messages").doc(`${tenantId}_foreign`).get()).data()?.status, "sent");
});
test("HTTP owner repairs, resumes and repeats pages without outbound jobs", async () => {
  const first = await post("owner");
  assert.equal(first.status, 200);
  const page = await first.json();
  assert.equal(page.reconciled, 1); assert.equal(page.hasMore, true); assert.ok(page.nextCursor);
  assert.equal((await db.collection("messages").doc(`${tenantId}_a`).get()).data()?.status, "read");
  for (let count = 0; count < 2; count += 1) {
    const response = await post("owner", { action: "reconcile_delivery", limit: 1, cursor: page.nextCursor });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.equal(next.reconciled, 1); assert.equal(next.hasMore, false);
  }
  assert.equal((await db.collection("messages").doc(`${tenantId}_b`).get()).data()?.status, "read");
  assert.equal((await db.collection("messages").where("tenantId", "==", tenantId).get()).size, 2);
  assert.equal((await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 0);
  assert.equal((await db.collection("audit_logs").where("tenantId", "==", tenantId).get()).size, 3);
});
test("HTTP validation rejects malformed body, action, limit and cursor", async () => {
  for (const body of [null, [], { action: "unknown" }, { action: "reconcile_delivery", limit: 26 }, { action: "reconcile_delivery", cursor: "invalid" }]) {
    assert.equal((await post("owner", body)).status, 400);
  }
});
