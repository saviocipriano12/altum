import assert from "node:assert/strict";
import test, { before, after } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  CRM_ACTIVITY_CURSOR_KEY: "cd".repeat(32) });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET } = await import("../app/api/tenant/[tenantId]/activities/clients/route.ts");
const tenantId = `qa_activity_picker_${Date.now()}`, uid = `${tenantId}_seller`, peer = `${tenantId}_peer`;
const member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
let token = "";
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "PickerLocalOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, role: "client_agent", status: "active" });
  await member.set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true } });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "PickerLocalOnly2026!", returnSecureToken: true }),
  }); assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  for (const name of ["users", "tenant_users", "tenant_entitlements", "leads"]) {
    const rows = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await row.ref.delete();
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
async function feed(params: Record<string, string> = {}) {
  const res = await GET(new Request(`http://127.0.0.1/clients?${new URLSearchParams({ pageSize: "2", ...params })}`, {
    headers: { authorization: `Bearer ${token}` },
  }), { params: Promise.resolve({ tenantId }) }); return { res, body: await res.json() };
}
async function clearLeads() {
  const rows = await adminDb.collection("leads").where("tenantId", "==", tenantId).get(); await Promise.all(rows.docs.map(row => row.ref.delete()));
}
test("customer search reaches beyond the scan budget and includes a customer without any task", async () => {
  const batch = adminDb.batch();
  for (let index = 0; index < 205; index++) batch.set(adminDb.collection("leads").doc(`${tenantId}_${String(index).padStart(4, "0")}`), {
    tenantId, ownerId: uid, nome: index === 204 ? "Acácia fictícia" : "Outro contato", title: index === 204 ? "Nova consultoria" : "",
  }); await batch.commit();
  const first = await feed({ q: "acacia" }); assert.equal(first.res.status, 200); assert.equal(first.body.options.length, 0);
  assert.equal(first.body.coverage, "partial"); assert.ok(first.body.nextCursor);
  const next = await feed({ q: "acacia", cursor: first.body.nextCursor }); assert.equal(next.res.status, 200);
  assert.equal(next.body.options.length, 1); assert.equal(next.body.options[0].nome, "Acácia fictícia");
  assert.equal(next.body.options[0].opportunityTitle, "Nova consultoria"); assert.equal(next.body.coverage, "end_reached");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get()).empty, true);
  assert.equal((await feed({ q: "nova consultoria" })).body.coverage, "partial");
});
test("pagination never reveals another seller's customers and checks current ownership", async () => {
  await clearLeads(); const first = adminDb.collection("leads").doc(`${tenantId}_a`), second = adminDb.collection("leads").doc(`${tenantId}_b`);
  await first.set({ tenantId, ownerId: peer, nome: "Reservado" }); await second.set({ tenantId, assignedUserId: uid, nome: "Acessível" });
  const page = await feed(); assert.equal(page.res.status, 200); assert.deepEqual(page.body.options.map((row: {id: string}) => row.id), [second.id]);
  assert.equal(page.body.options[0].ownerId, uid);
  await second.update({ ownerId: peer }); assert.equal((await feed()).body.options.length, 0);
});
test("continuations reject changed search or policy and blocked membership", async () => {
  await clearLeads();
  for (const id of ["a", "b", "c"]) await adminDb.collection("leads").doc(`${tenantId}_${id}`).set({ tenantId, ownerId: uid, nome: id });
  const page = await feed(); assert.ok(page.body.nextCursor);
  assert.equal((await feed({ cursor: page.body.nextCursor, q: "changed" })).res.status, 400);
  await member.update({ capabilities: ["view_team_records"] });
  assert.equal((await feed({ cursor: page.body.nextCursor })).res.status, 400);
  await member.update({ capabilities: ["edit_leads"], status: "blocked" });
  try { assert.equal((await feed({ cursor: page.body.nextCursor })).res.status, 403); }
  finally { await member.update({ status: "active" }); }
});
test("invalid search, page size and empty cursor fail before any full portfolio read", async () => {
  const invalid: Array<Record<string, string>> = [{ pageSize: "0" }, { pageSize: "51" }, { pageSize: "" }, { cursor: "" }, { q: "x".repeat(121) }];
  for (const params of invalid) assert.equal((await feed(params)).res.status, 400);
});
