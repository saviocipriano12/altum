import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET, PATCH } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/qualification/route.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { commercialEvidenceFacts } = await import("../lib/crm-field-evidence.ts");
const tenantId = `qa_review_${Date.now()}_${randomUUID().slice(0, 6)}`, uid = `${tenantId}_seller`;
let token = "", seq = 0;
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaLocalReview2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, role: "client_agent", status: "active", name: "Vendedor fictício" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { responsePaused: true } });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaLocalReview2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  for (const name of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "chats", "messages", "crm_conversation_observations", "ai_logs", "lead_tasks"]) {
    const rows = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function request(body?: unknown, authorized = true) {
  return new Request("http://127.0.0.1/qualification", { method: body ? "PATCH" : "GET", headers: {
    ...(authorized ? { authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function fixture(owner = uid) {
  const ref = adminDb.collection("leads").doc(`${tenantId}_${++seq}`);
  await ref.set({ tenantId, ownerId: owner, nome: "Cliente fictício", pipelineStage: "captado", createdAt: new Date(),
    customFields: { orcamento: "5000 reais", campo_preservado: "original" },
    aiFieldEvidence: { budgetBand: { value: "5000 reais" }, "custom.orcamento": { source: "customer_message", value: "5000 reais", excerpt: "Meu orçamento é 5000 reais" } } });
  const context = { params: Promise.resolve({ tenantId, leadId: ref.id }) };
  return { ref, context, read: async () => { const response = await GET(request(), context); assert.equal(response.status, 200); return response.json(); } };
}
test("seller corrects buyer data with manual provenance and atomic history", async () => {
  const f = await fixture(), original = await f.read();
  const response = await PATCH(request({ revision: original.revision, fields: { orcamento: "Até 3000 reais" } }), f.context);
  assert.equal(response.status, 200);
  const row = (await f.ref.get()).data()!;
  assert.equal(row.customFields.orcamento, "Até 3000 reais"); assert.equal(row.customFields.campo_preservado, "original");
  assert.equal(row.aiFieldEvidence["custom.orcamento"].source, "manual");
  assert.equal(row.aiFieldEvidence["custom.orcamento"].actorId, uid);
  const visible = commercialEvidenceFacts(row).find(fact => fact.label === "Orçamento");
  assert.equal(visible?.value, "Até 3000 reais"); assert.equal(visible?.excerpt, "");
  assert.equal((await f.ref.collection("events").get()).size, 1);
});

test("release preserves the manual value and provenance, blocks historical facts, and accepts a new customer message", async () => {
  const f = await fixture(), original = await f.read();
  assert.equal((await PATCH(request({ revision: original.revision, fields: { orcamento: "3000 reais" } }), f.context)).status, 200);
  const chatId = `${f.ref.id}_release_chat`, oldId = `${f.ref.id}_old`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: f.ref.id, channel: "whatsapp" });
  await adminDb.collection("messages").doc(oldId).set({ tenantId, chatId, leadId: f.ref.id, sender: "client", text: "Meu orçamento é 8000 reais", createdAt: new Date() });
  const manual = await f.read(); assert.deepEqual(manual.manualFields, ["orcamento"]);
  assert.equal((await PATCH(request({ revision: manual.revision, releaseFields: ["orcamento"] }), f.context)).status, 200);
  assert.equal((await PATCH(request({ revision: manual.revision, releaseFields: ["orcamento"] }), f.context)).status, 409);
  assert.equal((await f.ref.collection("events").get()).size, 2);
  const released = (await f.ref.get()).data()!, proof = released.aiFieldEvidence["custom.orcamento"];
  assert.equal(released.customFields.orcamento, "3000 reais"); assert.equal(proof.source, "manual");
  assert.equal(proof.actorId, uid); assert.equal(proof.releasedBy, uid); assert.equal(proof.automaticUpdates, true);
  assert.ok(proof.automaticAfter.toMillis()); assert.deepEqual((await f.read()).manualFields, []);
  assert.equal(commercialEvidenceFacts(released).find(fact => fact.label === "Orçamento")?.excerpt, "");
  assert.equal((await observe({ tenantId, chatId, messageId: oldId })).observed, true);
  assert.equal((await f.ref.get()).data()?.customFields.orcamento, "3000 reais");
  const newId = `${f.ref.id}_new`;
  await adminDb.collection("messages").doc(newId).set({ tenantId, chatId, leadId: f.ref.id, sender: "client", text: "Meu orçamento é 9000 reais", createdAt: new Date() });
  assert.equal((await observe({ tenantId, chatId, messageId: newId })).observed, true);
  const updated = (await f.ref.get()).data()!;
  assert.match(updated.customFields.orcamento, /9000/);
  assert.equal(updated.aiFieldEvidence["custom.orcamento"].source, "customer_message");
  assert.equal(updated.aiFieldEvidence["custom.orcamento"].messageId, newId);
  assert.ok(updated.aiFieldEvidence["custom.orcamento"].automaticAfter.isEqual(proof.automaticAfter));
  const beforeCorrection = await f.read();
  assert.equal((await PATCH(request({ revision: beforeCorrection.revision, fields: { orcamento: "Conferir com financeiro" } }), f.context)).status, 200);
  const laterId = `${f.ref.id}_after_relock`;
  await adminDb.collection("messages").doc(laterId).set({ tenantId, chatId, leadId: f.ref.id, sender: "client", text: "Meu orçamento é 10000 reais", createdAt: new Date() });
  assert.equal((await observe({ tenantId, chatId, messageId: laterId })).observed, true);
  assert.equal((await f.ref.get()).data()?.customFields.orcamento, "Conferir com financeiro");
  assert.deepEqual((await f.read()).manualFields, ["orcamento"]);
});

test("release requires current revision, selected protected fields, and current portfolio authority", async () => {
  const f = await fixture(), first = await f.read();
  assert.equal((await PATCH(request({ revision: first.revision, releaseFields: ["orcamento"] }), f.context)).status, 409);
  assert.equal((await PATCH(request({ revision: first.revision, fields: { orcamento: "" } }), f.context)).status, 200);
  const manual = await f.read();
  for (const body of [
    { releaseFields: ["pipelineStage"] }, { releaseFields: ["orcamento", "orcamento"] },
    { releaseFields: ["orcamento"], fields: { orcamento: "x" } }, { releaseFields: "orcamento" },
    { releaseFields: ["orcamento"], actorId: "inventado" },
    { releaseFields: ["orcamento"], fields: "invalid" },
  ]) assert.equal((await PATCH(request({ revision: manual.revision, ...body }), f.context)).status, 400);
  assert.equal((await PATCH(request({ revision: first.revision, releaseFields: ["orcamento"] }), f.context)).status, 409);
  await f.ref.update({ ownerId: `${uid}_other` });
  assert.equal((await PATCH(request({ revision: manual.revision, releaseFields: ["orcamento"] }), f.context)).status, 403);
  assert.equal((await f.ref.collection("events").get()).size, 1);
});

test("releasing a deliberately empty field does not resurrect an old AI alias", async () => {
  const f = await fixture(), first = await f.read();
  assert.equal((await PATCH(request({ revision: first.revision, fields: { orcamento: "" } }), f.context)).status, 200);
  const manual = await f.read();
  assert.equal((await PATCH(request({ revision: manual.revision, releaseFields: ["orcamento"] }), f.context)).status, 200);
  const row = (await f.ref.get()).data()!;
  assert.equal(row.customFields.orcamento, "");
  assert.equal(row.aiFieldEvidence.budgetBand.value, "5000 reais");
  assert.equal(commercialEvidenceFacts(row).some(fact => fact.label === "Orçamento"), false);
});

test("concurrent release and human correction cannot both commit the same revision", async () => {
  const f = await fixture(), first = await f.read();
  assert.equal((await PATCH(request({ revision: first.revision, fields: { orcamento: "3000 reais" } }), f.context)).status, 200);
  const manual = await f.read();
  const results = await Promise.all([
    PATCH(request({ revision: manual.revision, releaseFields: ["orcamento"] }), f.context),
    PATCH(request({ revision: manual.revision, fields: { orcamento: "2500 reais" } }), f.context),
  ]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const row = (await f.ref.get()).data()!, proof = row.aiFieldEvidence["custom.orcamento"];
  if (row.customFields.orcamento === "2500 reais") assert.notEqual(proof.automaticUpdates, true);
  else { assert.equal(row.customFields.orcamento, "3000 reais"); assert.equal(proof.automaticUpdates, true); }
  assert.equal((await f.ref.collection("events").get()).size, 2);
});
test("clearing a wrong fact cannot resurrect the old AI value or be overwritten by the observer", async () => {
  const f = await fixture(), original = await f.read();
  assert.equal((await PATCH(request({ revision: original.revision, fields: { orcamento: "" } }), f.context)).status, 200);
  const chatId = `${f.ref.id}_chat`, messageId = `${f.ref.id}_message`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: f.ref.id, channel: "whatsapp" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId: f.ref.id, sender: "client", text: "Meu orçamento é 9000 reais", createdAt: new Date() });
  assert.equal((await observe({ tenantId, chatId, messageId })).observed, true);
  const row = (await f.ref.get()).data()!;
  assert.equal(row.customFields.orcamento, "");
  assert.equal(commercialEvidenceFacts(row).some(fact => fact.label === "Orçamento"), false);
});
test("concurrent correction cannot overwrite the current file", async () => {
  const f = await fixture(), original = await f.read();
  await f.ref.update({ "customFields.orcamento": "Alterado por colega" });
  const response = await PATCH(request({ revision: original.revision, fields: { orcamento: "Antigo" } }), f.context);
  assert.equal(response.status, 409); assert.equal((await f.ref.get()).data()?.customFields.orcamento, "Alterado por colega");
  assert.equal((await f.ref.collection("events").get()).size, 0);
});
test("recreated client and duplicate retry cannot accept an obsolete revision", async () => {
  const f = await fixture(), original = await f.read(), row = (await f.ref.get()).data()!;
  await f.ref.delete(); await f.ref.set(row);
  assert.equal((await PATCH(request({ revision: original.revision, fields: { orcamento: "Antigo" } }), f.context)).status, 409);
  const now = await f.read(), body = { revision: now.revision, fields: { orcamento: "Conferido" } };
  assert.equal((await PATCH(request(body), f.context)).status, 200);
  assert.equal((await PATCH(request(body), f.context)).status, 409);
  assert.equal((await f.ref.collection("events").get()).size, 1);
});
test("unauthenticated users, other seller and revoked membership cannot review the record", async () => {
  const other = await fixture(`${uid}_other`);
  assert.equal((await GET(request(undefined, false), other.context)).status, 401);
  assert.equal((await GET(request(), other.context)).status, 403);
  const own = await fixture(), original = await own.read();
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ status: "blocked" });
  assert.equal((await PATCH(request({ revision: original.revision, fields: { orcamento: "Proibido" } }), own.context)).status, 403);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ status: "active" });
});
test("payload cannot write stage, arbitrary custom fields or invented authorship", async () => {
  const f = await fixture(), original = await f.read();
  for (const fields of [{ pipelineStage: "ganho" }, { actorId: "admin" }, { campo_inventado: "x" }, { orcamento: 123 }, { orcamento: "x".repeat(321) }]) {
    assert.equal((await PATCH(request({ revision: original.revision, fields }), f.context)).status, 400);
  }
  assert.equal((await f.ref.collection("events").get()).size, 0);
});

test("changed CRM values cannot display an unrelated old AI quote as their source", () => {
  const facts = commercialEvidenceFacts({ customFields: { orcamento: "3000 reais" }, aiFieldEvidence: {
    "custom.orcamento": { source: "customer_message", value: "9000 reais", excerpt: "Meu orçamento é 9000 reais", contentKind: "audio_transcription" },
  } });
  assert.equal(facts[0].value, "3000 reais"); assert.equal(facts[0].excerpt, ""); assert.equal(facts[0].sourceLabel, "");
});
