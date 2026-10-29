import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type { ResolveFnOutput, ResolveHookContext } from "node:module";
import { createHash } from "node:crypto";
// Node 24 supplies this synchronous API; the shared project still has older
// Node type declarations. Describe only the runtime surface this harness uses.
const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve(specifier: string, context: ResolveHookContext,
    nextResolve: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput): ResolveFnOutput }): { deregister(): void };
};
// This is a Node server harness. Match Next's react-server marker alias only;
// no authentication/provider implementation is replaced or mocked here.
const serverMarker = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { POST: apply } = await import("../app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts");
const { PATCH: review } = await import("../app/api/tenant/[tenantId]/mcp/drafts/[draftId]/route.ts");
const { applyApprovedCrmDraft, crmDraftFingerprint } = await import("../lib/server/crm/draft-mutation.ts");
const { assertTenantAccess } = await import("../lib/server/tenant.ts");
const tenantId = `qa_crm_draft_${Date.now()}`, reviewerId = `${tenantId}_owner`, agentId = `${tenantId}_agent`;
const tokens: Record<string, string> = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "No external transport in CRM draft QA");
  return originalFetch(url, options);
};
before(async () => {
  for (const uid of [reviewerId, agentId]) {
    const role = uid === reviewerId ? "client_owner" : "client_agent";
    await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaCrmDraftLocal2026!" });
    await adminDb.collection("users").doc(uid).set({ tenantId, uid, name: "Pessoa ficticia QA", role, status: "active" });
    await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role, status: "active",
      ...(role === "client_agent" ? { capabilities: ["edit_leads", "manage_commercial"] } : {}) });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaCrmDraftLocal2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200); tokens[uid] = (await response.json()).idToken;
  }
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "captado", label: "Entrada" }, { id: "provador", label: "Escolha" }, { id: "reserva", label: "Separado" }] });
});
after(async () => {
  serverMarker.deregister();
  globalThis.fetch = originalFetch;
  for (const collection of ["mcp_action_drafts", "leads", "orcamentos", "audit_logs", "users", "tenant_users", "tenant_entitlements", "pipeline", "ai_learning_outcomes", "ai_tenant_learning_daily"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) {
      if (collection === "leads") { assert.ok(row.id.startsWith(tenantId)); await adminDb.recursiveDelete(row.ref); } else await row.ref.delete();
    }
  }
  for (const uid of [reviewerId, agentId]) await adminAuth.deleteUser(uid);
  await adminDb.terminate();
});
function req(uid: string, method = "POST", body: unknown = {}) {
  return new Request("http://127.0.0.1/qa-draft", { method, headers: { authorization: `Bearer ${tokens[uid]}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function fixture(name: string, type = "update_lead", ownerId = agentId) {
  const leadId = `${tenantId}_${name}_lead`, draftId = `${tenantId}_${name}_draft`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente Shopify ficticio", ownerId, pipelineStage: "captado", stage: "captado", priority: "medium", tags: ["original"] });
  const proposedChange = type === "create_proposal" ? { leadId, title: "Proposta ficticia Shopify", totalValue: 100 }
    : type === "assign_lead" ? { leadId, ownerUserId: reviewerId } : { leadId, patch: { pipelineStage: "provador", priority: "low", tags: ["aprovado"] } };
  await adminDb.collection("mcp_action_drafts").doc(draftId).set({ tenantId, type, status: "pending_review", source: "mcp", proposedChange });
  const context = { params: Promise.resolve({ tenantId, draftId }) };
  const approved = await review(req(reviewerId, "PATCH", { action: "approve" }), context); assert.equal(approved.status, 200);
  return { leadId, draftId, context };
}
test("an authenticated approved CRM update persists human control without treating generated content as human authorship", async () => {
  const input = await fixture("ownership"), response = await apply(req(agentId), input.context); assert.equal(response.status, 200);
  const lead = (await adminDb.collection("leads").doc(input.leadId).get()).data()!;
  assert.equal(lead.pipelineStage, "provador"); assert.equal(lead.crmFieldOwnership?.pipelineStage?.source, "manual");
  assert.equal(lead.crmFieldOwnership.pipelineStage.authoredBy, "mcp"); assert.equal(lead.crmFieldOwnership.pipelineStage.actorId, agentId);
  const event = (await adminDb.collection("leads").doc(input.leadId).collection("events").get()).docs[0].data();
  assert.equal(event.before.pipelineStage, "captado"); assert.equal(event.before.priority, "medium"); assert.deepEqual(event.before.tags, ["original"]);
});
test("replaying the same approved mutation returns its receipt and cannot undo a later human edit", async () => {
  const input = await fixture("replay"); const first = await apply(req(agentId), input.context); assert.equal(first.status, 200); const initial = await first.json();
  const ref = adminDb.collection("leads").doc(input.leadId); await ref.update({ priority: "high" });
  const afterHuman = await ref.get(); const response = await apply(req(agentId), input.context);
  assert.equal(response.status, 200); const replay = await response.json(); assert.equal(replay.replayed, true); assert.deepEqual(replay.patch, initial.patch);
  assert.ok((await ref.get()).updateTime!.isEqual(afterHuman.updateTime!));
});
test("concurrent application of one approved proposal creates one proposal and all callers receive its receipt", async () => {
  const input = await fixture("proposal", "create_proposal");
  const responses = await Promise.all(Array.from({ length: 5 }, () => apply(req(agentId), input.context)));
  assert.ok(responses.every(response => response.status === 200));
  const proposals = await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get(); assert.equal(proposals.size, 1);
  const ids = await Promise.all(responses.map(async response => (await response.json()).proposalId)); assert.equal(new Set(ids).size, 1);
  assert.equal(proposals.docs[0].data().status, "Rascunho");
});

test("edited proposal or target after review requires a fresh approval, with no partial CRM write", async () => {
  for (const change of ["draft", "lead"]) {
    const input = await fixture(`changed-${change}`), ref = adminDb.collection("leads").doc(input.leadId), draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId);
    if (change === "draft") await draftRef.update({ "proposedChange.patch.priority": "high" });
    else await ref.update({ notes: "Nova decisao humana apos a revisao" });
    const before = await ref.get(); const result = await apply(req(agentId), input.context); assert.equal(result.status, 409);
    assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await draftRef.get()).data()?.status, "approved_pending_apply");
    assert.equal((await review(req(reviewerId, "PATCH", { action: "approve" }), input.context)).status, 200);
    assert.equal((await apply(req(agentId), input.context)).status, 200);
  }
});

test("revoked approval and legacy applying work cannot be silently resumed", async () => {
  for (const status of ["rejected", "applying", "apply_failed_requires_review"]) {
    const input = await fixture(`state-${status}`), ref = adminDb.collection("leads").doc(input.leadId);
    await adminDb.collection("mcp_action_drafts").doc(input.draftId).update({ status }); const before = await ref.get();
    assert.equal((await apply(req(agentId), input.context)).status, 409); assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  }
});

test("current record access and capabilities are enforced again before application and receipt replay", async () => {
  const input = await fixture("access"), ref = adminDb.collection("leads").doc(input.leadId);
  await ref.update({ ownerId: reviewerId });
  assert.equal((await apply(req(agentId), input.context)).status, 403);
  await ref.update({ ownerId: agentId });
  assert.equal((await review(req(reviewerId, "PATCH", { action: "approve" }), input.context)).status, 200);
  assert.equal((await apply(req(agentId), input.context)).status, 200);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${agentId}`).update({ capabilities: [] });
  try { assert.equal((await apply(req(agentId), input.context)).status, 403); }
  finally { await adminDb.collection("tenant_users").doc(`${tenantId}_${agentId}`).update({ capabilities: ["edit_leads", "manage_commercial"] }); }
});

test("audit collision rolls back CRM, ownership and the approved draft as one commit", async () => {
  const input = await fixture("atomic"), ref = adminDb.collection("leads").doc(input.leadId), before = await ref.get();
  const id = `mcp_crm_${createHash("sha256").update(JSON.stringify([tenantId, input.draftId])).digest("hex")}`;
  await adminDb.collection("audit_logs").doc(id).set({ tenantId, title: "Conflito QA" });
  assert.equal((await apply(req(agentId), input.context)).status, 500);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await ref.collection("events").get()).size, 0);
  assert.equal((await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()?.status, "approved_pending_apply");
});

test("assignment approval respects manager authority and active tenant membership", async () => {
  const denied = await fixture("assign-denied", "assign_lead"); assert.equal((await apply(req(agentId), denied.context)).status, 403);
  const accepted = await fixture("assign-ok", "assign_lead"); assert.equal((await apply(req(reviewerId), accepted.context)).status, 200);
  assert.equal((await adminDb.collection("leads").doc(accepted.leadId).get()).data()?.ownerId, reviewerId);
  const paused = await fixture("assign-paused", "assign_lead");
  await adminDb.collection("mcp_action_drafts").doc(paused.draftId).update({ "proposedChange.ownerUserId": agentId });
  assert.equal((await review(req(reviewerId, "PATCH", { action: "approve" }), paused.context)).status, 200);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${agentId}`).update({ status: "blocked" });
  try {
    assert.equal((await apply(req(reviewerId), paused.context)).status, 409);
    assert.equal((await adminDb.collection("leads").doc(paused.leadId).get()).data()?.ownerId, agentId);
  } finally { await adminDb.collection("tenant_users").doc(`${tenantId}_${agentId}`).update({ status: "active" }); }
});

test("autonomous policy cannot relabel generated content as human or overwrite manually locked fields", async () => {
  const input = await fixture("autonomous"), ref = adminDb.collection("leads").doc(input.leadId), draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId);
  await ref.update({ crmFieldOwnership: { priority: { source: "manual", locked: true, actorId: agentId } } });
  const source = (await draftRef.get()).data()!;
  await draftRef.update({ reviewDecision: "autonomous_policy", reviewedChangeFingerprint: crmDraftFingerprint(source) });
  const current = await draftRef.get(), membership = await assertTenantAccess(agentId, tenantId);
  const result = await applyApprovedCrmDraft({ tenantId, draftId: input.draftId, expectedDraftVersion: current.updateTime!, membership, actorId: agentId, actorName: "MCP QA", viaMcp: true });
  assert.deepEqual(result.application.blockedFields, ["priority"]);
  const lead = (await ref.get()).data()!; assert.equal(lead.priority, "medium"); assert.equal(lead.crmFieldOwnership.tags.source, "approved_mcp");
  assert.equal(lead.crmFieldOwnership.tags.authoredBy, "mcp"); assert.equal(lead.crmFieldOwnership.tags.locked, false);
});

test("an approved stage outside the tenant funnel is rejected without partial changes", async () => {
  const input = await fixture("invalid-stage"), draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId);
  await draftRef.update({ "proposedChange.patch.pipelineStage": "qualificacao" });
  assert.equal((await review(req(reviewerId, "PATCH", { action: "approve" }), input.context)).status, 200);
  const ref = adminDb.collection("leads").doc(input.leadId), before = await ref.get();
  assert.equal((await apply(req(agentId), input.context)).status, 409); assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
});

test("a manager can reject an obsolete draft after its target was deleted", async () => {
  const input = await fixture("deleted-reject"); await adminDb.collection("leads").doc(input.leadId).delete();
  const result = await review(req(reviewerId, "PATCH", { action: "reject" }), input.context);
  assert.equal(result.status, 200); assert.equal((await adminDb.collection("mcp_action_drafts").doc(input.draftId).get()).data()?.status, "rejected");
  assert.equal((await apply(req(agentId), input.context)).status, 409);
});

test("changed content cannot reuse an applied receipt and a legacy approval needs a fresh review", async () => {
  const applied = await fixture("changed-receipt"), ref = adminDb.collection("leads").doc(applied.leadId);
  assert.equal((await apply(req(agentId), applied.context)).status, 200); const before = await ref.get();
  await adminDb.collection("mcp_action_drafts").doc(applied.draftId).update({ "proposedChange.patch.priority": "high" });
  assert.equal((await apply(req(agentId), applied.context)).status, 409); assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  const legacy = await fixture("legacy-approval"), draft = adminDb.collection("mcp_action_drafts").doc(legacy.draftId);
  const { FieldValue } = await import("firebase-admin/firestore"); await draft.update({ reviewedChangeFingerprint: FieldValue.delete() });
  assert.equal((await apply(req(agentId), legacy.context)).status, 409);
  assert.equal((await review(req(reviewerId, "PATCH", { action: "approve" }), legacy.context)).status, 200);
  assert.equal((await apply(req(agentId), legacy.context)).status, 200);
});
