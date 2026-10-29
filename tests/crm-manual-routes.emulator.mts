import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { POST: moveStage } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/stage/route.ts");
const { PATCH: editLead } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/route.ts");
const tenantId = `qa_crm_route_${Date.now()}_${randomUUID().slice(0, 8)}`, otherTenantId = `${tenantId}_other`, uid = `${tenantId}_agent`;
const originalFetch = globalThis.fetch;
let token: string;
globalThis.fetch = (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "No external transport allowed in authenticated CRM tests");
  return originalFetch(url, options);
};

before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaCrmLocalOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, name: "Vendedor ficticio", role: "client_agent", status: "active" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads", "manage_pipeline"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
    { id: "captado", label: "Entrada", position: 0, isTerminal: false },
    { id: "provador", label: "Escolhendo pecas", position: 1, isTerminal: false },
    { id: "reserva", label: "Separacao humana", position: 2, isTerminal: false },
  ] });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaCrmLocalOnly2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});

after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["leads", "users", "tenant_users", "tenant_entitlements", "pipeline", "lead_tasks", "lead_notes", "automations", "tenant_usage_monthly", "ai_logs", "jobs", "ai_learning_outcomes", "ai_tenant_learning_daily", "contacts", "contact_identity_aliases"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "in", [tenantId, otherTenantId]).get();
    for (const row of rows.docs) {
      if (collection === "leads") { assert.ok(row.id.startsWith(tenantId)); await adminDb.recursiveDelete(row.ref); }
      else await row.ref.delete();
    }
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});

function request(body: unknown, method = "POST", authenticated = true) {
  return new Request("http://127.0.0.1/qa-crm", { method,
    headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
async function fixture(name: string, ownerId: string, tenant = tenantId) {
  const leadId = `${tenantId}_${name}`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId: tenant, nome: "Cliente ficticio Shopify", ownerId, pipelineStage: "captado", stage: "captado", priority: "medium", tags: ["original"] });
  return { leadId, params: Promise.resolve({ tenantId, leadId }) };
}

test("authenticated seller cannot move another seller's lead, even with force; denial precedes every durable effect", async () => {
  const input = await fixture("forbidden", `${tenantId}_another_seller`), ref = adminDb.collection("leads").doc(input.leadId), before = await ref.get();
  const response = await moveStage(request({ stage: "provador", force: true }), input);
  assert.equal(response.status, 403); assert.equal((await response.json()).code, "commercial_record_access_denied");
  const afterSnapshot = await ref.get(); assert.ok(afterSnapshot.updateTime!.isEqual(before.updateTime!));
  assert.deepEqual(afterSnapshot.data(), before.data()); assert.equal((await ref.collection("events").get()).size, 0);
  for (const collection of ["lead_tasks", "jobs", "ai_learning_outcomes", "chat_outbound_jobs", "messages"]) {
    assert.equal((await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).size, 0, collection);
  }
});

test("missing authentication, foreign tenant and missing capability cannot change stage", async () => {
  for (const condition of ["no_token", "foreign_tenant", "no_capability"]) {
    const input = await fixture(condition, uid, condition === "foreign_tenant" ? otherTenantId : tenantId);
    const ref = adminDb.collection("leads").doc(input.leadId), before = await ref.get();
    if (condition === "no_capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    try {
      const response = await moveStage(request({ stage: "provador", force: true }, "POST", condition !== "no_token"), input);
      assert.equal(response.status, condition === "no_token" ? 401 : 403);
      assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await ref.collection("events").get()).size, 0);
    } finally {
      if (condition === "no_capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["edit_leads", "manage_pipeline"] });
    }
  }
});

test("authenticated own-lead stage and profile routes persist human ownership and ignore forged ownership metadata", async () => {
  const input = await fixture("allowed", uid), ref = adminDb.collection("leads").doc(input.leadId);
  const stage = await moveStage(request({ stage: "provador" }), input); assert.equal(stage.status, 200, await stage.clone().text());
  let lead = (await ref.get()).data()!; assert.equal(lead.pipelineStage, "provador"); assert.equal(lead.crmFieldOwnership.pipelineStage.source, "manual"); assert.equal(lead.crmFieldOwnership.pipelineStage.actorId, uid);
  const edited = await editLead(request({ pipelineStage: "reserva", priority: "low", tags: ["humano"],
    crmFieldOwnership: { priority: { source: "automation", locked: false, actorId: "forged-user" } } }, "PATCH"), input);
  assert.equal(edited.status, 200, await edited.clone().text());
  lead = (await ref.get()).data()!; assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["humano"]);
  for (const field of ["pipelineStage", "priority", "tags"]) {
    assert.equal(lead.crmFieldOwnership[field].source, "manual"); assert.equal(lead.crmFieldOwnership[field].locked, true); assert.equal(lead.crmFieldOwnership[field].actorId, uid);
  }
  const events = await ref.collection("events").get();
  assert.equal(events.docs.filter(row => row.data().type === "stage_change" && row.data().actorId === uid).length, 1);
  assert.equal(events.docs.filter(row => row.data().type === "lead_profile_update" && row.data().actorId === uid).length, 1);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 0);
});

for (const route of ["profile", "stage"] as const) {
  test(`authenticated ${route} route commits and consumes one causal automation with its own capability contract`, async () => {
    const name = `causal-${route}`, input = await fixture(name, uid), ref = adminDb.collection("leads").doc(input.leadId);
    await ref.update({ origem: name });
    await adminDb.collection("automations").doc(`${input.leadId}_automation`).set({ tenantId, name: "Acompanhar escolha ficticia", enabled: true, status: "active",
      trigger: "lead_stage_changed", conditions: { sourceIn: [name] }, actions: [{ type: "create_task", title: "Acompanhar cliente ficticio" }] });
    await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [route === "stage" ? "manage_pipeline" : "edit_leads"] });
    try {
      const response = route === "stage" ? await moveStage(request({ stage: "provador" }), input) : await editLead(request({ pipelineStage: "provador" }, "PATCH"), input);
      assert.equal(response.status, 200, await response.clone().text());
      const roots = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).where("type", "==", "crm_manual_stage_transition").get();
      assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().status, "done");
      const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
      const causal = tasks.docs.filter(doc => doc.data().stageSourceId === roots.docs[0].id);
      assert.equal(causal.length, 1);
      assert.equal(causal[0].data().stageSourceKind, "manual");
      assert.equal(causal[0].data().automationId, `${input.leadId}_automation`);
      const receipt = (await adminDb.collection("jobs").doc(causal[0].data().automationEffectId).get()).data();
      assert.equal(receipt?.status, "done"); assert.equal(receipt?.taskId, causal[0].id);
      assert.equal(tasks.docs.filter(doc => doc.data().source === "crm_automation").length, 1, "Preserve the existing sales journey follow-up");
      assert.equal(tasks.size, 2);
      assert.equal((await ref.get()).data()?.crmFieldOwnership.pipelineStage.locked, true);
    } finally { await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["edit_leads", "manage_pipeline"] }); }
  });
}
