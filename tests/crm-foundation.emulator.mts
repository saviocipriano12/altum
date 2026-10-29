import test, { before, after } from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET: board } = await import("../app/api/tenant/[tenantId]/pipeline/route.ts");
const { GET: list, POST: create } = await import("../app/api/tenant/[tenantId]/leads/route.ts");
const { POST: move } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/stage/route.ts");
const { PATCH: edit } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/route.ts");
const { POST: remove } = await import("../app/api/tenant/[tenantId]/leads/bulk-delete/route.ts");
const { POST: removeChats } = await import("../app/api/tenant/[tenantId]/chats/bulk-delete/route.ts");
const { deleteTenantLead, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const tenantId = `qa_crm_foundation_${Date.now()}`, uid = `${tenantId}_seller`, foreign = `${tenantId}_foreign`;
const context = { params: Promise.resolve({ tenantId }) };
let token = "";
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "External transport prohibited");
  return originalFetch(input, init);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "CrmFoundationLocalOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, name: "Vendedor ficticio", role: "client_agent", status: "active" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, inbox: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
    { id: "entrada_loja", label: "Entrada", position: 0, isTerminal: false },
    { id: "escolha", label: "Escolha", position: 1, isTerminal: false },
    { id: "reserva", label: "Reserva", position: 2, isTerminal: false },
  ] });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "CrmFoundationLocalOnly2026!", returnSecureToken: true }),
  });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "pipeline", "leads", "chats", "tenant_settings", "lead_tasks", "lead_notes", "ai_logs", "jobs", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails", "audit_logs", "deletion_audits", "tenant_trash", "orcamentos", "financeiro", "budgets", "finance_entries", "contacts", "contact_identity_aliases"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "in", [tenantId, foreign]).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function request(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return new Request(`http://127.0.0.1/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function lead(name: string, ownerId = uid, tenant = tenantId) {
  const id = `${tenantId}_${name}`, ref = adminDb.collection("leads").doc(id);
  await ref.set({ tenantId: tenant, nome: "Contato ficticio", ownerId, pipelineStage: "entrada_loja", stage: "entrada_loja", createdAt: new Date(), updatedAt: new Date() });
  return { id, ref, params: Promise.resolve({ tenantId, leadId: id }) };
}

test("restricted funnel returns only authorized leads and totals; manager retains team access", async () => {
  const own = await lead("board-own"), other = await lead("board-other", `${tenantId}_other`);
  let response = await board(request("pipeline"), context), payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.columns.flatMap((column: { items: { id: string }[] }) => column.items).map((item: { id: string }) => item.id), [own.id]);
  assert.equal(payload.summary.totalLeads, 1);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["edit_leads", "view_team_records"] });
  try {
    response = await board(request("pipeline"), context); payload = await response.json();
    assert.equal(payload.summary.totalLeads, 2); assert.ok(payload.columns.flatMap((column: { items: { id: string }[] }) => column.items).some((item: { id: string }) => item.id === other.id));
  } finally { await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["edit_leads"] }); }
});

test("mixed deletion selection is denied before deleting any contact or creating trash", async () => {
  const own = await lead("delete-own"), other = await lead("delete-other", `${tenantId}_other`);
  const before = (await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).get()).size;
  const response = await remove(request("delete", { ids: [own.id, other.id] }), context);
  assert.equal(response.status, 403); assert.ok((await own.ref.get()).exists); assert.ok((await other.ref.get()).exists);
  assert.equal((await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).get()).size, before);
});

test("bulk deletion rejects a foreign tenant and read-only capability without effects", async () => {
  const target = await lead("foreign", uid, foreign);
  assert.equal((await remove(request("delete", { ids: [target.id] }), context)).status, 403);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
  try { assert.equal((await remove(request("delete", { ids: [target.id] }), context)).status, 403); }
  finally { await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["edit_leads"] }); }
  assert.ok((await target.ref.get()).exists);
});

test("authorized bulk deletion is recoverable and a repeated request stays harmless", async () => {
  const target = await lead("delete-retry");
  const first = await remove(request("delete", { ids: [target.id] }), context);
  assert.equal(first.status, 200); assert.equal((await first.json()).deleted, 1);
  const second = await remove(request("delete", { ids: [target.id] }), context);
  assert.equal(second.status, 200); assert.equal((await second.json()).deleted, 0);
  const trash = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", target.id).get();
  assert.equal(trash.size, 1);
  await restoreTenantTrash({ tenantId, trashId: trash.docs[0].id, actorId: uid });
  assert.equal((await target.ref.get()).data()?.ownerId, uid);
});

test("conversation bulk deletion checks every assignment and personal channel before deleting any item", async () => {
  const own = adminDb.collection("chats").doc(`${tenantId}_bulk-own`), other = adminDb.collection("chats").doc(`${tenantId}_bulk-other`), personal = adminDb.collection("chats").doc(`${tenantId}_bulk-personal`);
  await own.set({ tenantId, ownerId: uid, contactName: "Ficticio" });
  await other.set({ tenantId, ownerId: `${tenantId}_other`, contactName: "Ficticio" });
  await personal.set({ tenantId, ownerId: uid, channelScope: "personal", channelOwnerUserId: `${tenantId}_other` });
  const member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
  await member.update({ capabilities: ["edit_leads", "respond_inbox"] });
  try {
    for (const denied of [other, personal]) {
      const response = await removeChats(request("delete-chats", { ids: [own.id, denied.id] }), context);
      assert.equal(response.status, 403); assert.ok((await own.get()).exists); assert.ok((await denied.get()).exists);
    }
    assert.equal((await removeChats(request("delete-chats", { ids: [own.id] }), context)).status, 200);
    assert.equal((await own.get()).exists, false);
    const retry = await removeChats(request("delete-chats", { ids: [own.id] }), context);
    assert.equal(retry.status, 200); assert.equal((await retry.json()).deleted, 0);
  } finally { await member.update({ capabilities: ["edit_leads"] }); }
});

for (const route of ["stage", "profile"] as const) {
  test(`${route} refuses a stage outside the saved funnel without changing lead, events or jobs`, async () => {
    const target = await lead(`invalid-${route}`), before = await target.ref.get();
    const response = route === "stage"
      ? await move(request("stage", { stage: "inexistente", force: true }), target)
      : await edit(request("profile", { pipelineStage: "inexistente" }, "PATCH"), target);
    assert.equal(response.status, 400, await response.clone().text());
    assert.ok((await target.ref.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await target.ref.collection("events").get()).size, 0);
    assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", target.id).get()).size, 0);
  });
}

test("creation rejects invalid stages and defaults to the real first stage", async () => {
  const before = (await adminDb.collection("leads").where("tenantId", "==", tenantId).get()).size;
  const invalid = await create(request("create", { nome: "Novo ficticio", pipelineStage: "inexistente" }), context);
  assert.equal(invalid.status, 400); assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).get()).size, before);
  const response = await create(request("create", { nome: "Novo ficticio" }), context), payload = await response.json();
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.equal((await adminDb.collection("leads").doc(payload.leadId).get()).data()?.pipelineStage, "entrada_loja");
});

test("invalid funnel configuration blocks manual writes without inventing fallback stages", async () => {
  const target = await lead("malformed-funnel"), before = await target.ref.get();
  const pipelineRef = adminDb.collection("pipeline").doc(tenantId), pipeline = (await pipelineRef.get()).data()!;
  await pipelineRef.update({ stages: [] });
  try {
    const response = await edit(request("profile", { pipelineStage: "escolha" }, "PATCH"), target);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, "pipeline_configuration_invalid");
    assert.ok((await target.ref.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await target.ref.collection("events").get()).size, 0);
  } finally { await pipelineRef.set(pipeline); }
});

test("blank explicit stage cannot silently reset a lead to a generic entry stage", async () => {
  const target = await lead("blank-stage"), before = await target.ref.get();
  assert.equal((await move(request("stage", { stage: "" }), target)).status, 400);
  assert.equal((await edit(request("profile", { pipelineStage: "" }, "PATCH"), target)).status, 400);
  assert.equal((await create(request("create", { nome: "Ficticio", pipelineStage: "" }), context)).status, 400);
  assert.ok((await target.ref.get()).updateTime!.isEqual(before.updateTime!));
});

test("unauthenticated requests cannot read the funnel or delete contacts", async () => {
  assert.equal((await board(new Request("http://127.0.0.1/pipeline"), context)).status, 401);
  assert.equal((await remove(new Request("http://127.0.0.1/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: ["ficticio"] }) }), context)).status, 401);
});

test("compact list preserves pending conversations and excludes chats assigned to a different seller", async () => {
  const target = await lead("pending");
  await adminDb.collection("chats").doc(`${target.id}_chat`).set({ tenantId, leadId: target.id, ownerId: uid, status: "pending", priority: "high", lastMessageTime: new Date() });
  await adminDb.collection("chats").doc(`${target.id}_private`).set({ tenantId, leadId: target.id, ownerId: `${tenantId}_other`, status: "pending", lastMessageTime: new Date() });
  for (const path of ["leads?view=compact", "leads"]) {
    const response = await list(request(path), context), payload = await response.json();
    assert.equal(response.status, 200); const item = payload.items.find((item: { id: string }) => item.id === target.id);
    assert.equal(item.chatSummary.pending, 1); assert.equal(item.chatSummary.total, 1);
  }
});

test("authorized lead deletion and restoration include actual and legacy commercial collections", async () => {
  const target = await lead("trash");
  for (const collection of ["orcamentos", "financeiro", "budgets", "finance_entries"]) {
    await adminDb.collection(collection).doc(`${target.id}_${collection}`).set({ tenantId, leadId: target.id, status: "Rascunho", value: 100 });
  }
  const result = await deleteTenantLead({ tenantId, leadId: target.id });
  assert.equal(result.deleted, true); assert.ok("trashId" in result);
  for (const collection of ["orcamentos", "financeiro", "budgets", "finance_entries"]) assert.equal((await adminDb.collection(collection).doc(`${target.id}_${collection}`).get()).exists, false, collection);
  await restoreTenantTrash({ tenantId, trashId: result.trashId as string, actorId: uid });
  assert.ok((await target.ref.get()).exists);
  for (const collection of ["orcamentos", "financeiro", "budgets", "finance_entries"]) assert.equal((await adminDb.collection(collection).doc(`${target.id}_${collection}`).get()).data()?.value, 100, collection);
});
