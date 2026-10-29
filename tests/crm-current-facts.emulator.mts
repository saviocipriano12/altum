import assert from "node:assert/strict";
import test, { after, before, mock } from "node:test";
import { randomUUID } from "node:crypto";

Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  GCLOUD_PROJECT: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  OPENAI_API_KEY: "", ALTUM_CRM_SEMANTIC_ENABLED: "0",
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Only local transport is allowed");
  return originalFetch(input, init);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { readQualificationReview: read, saveQualificationReview: save } = await import("../lib/server/crm/qualification-review.ts");
const { evaluateLeadQualification: qualify } = await import("../lib/server/crm/qualification.ts");
const { upsertLeadCommercialDossier: dossier } = await import("../lib/server/ai/lead-dossier.ts");
const { getLeadMemory, getLeadMemoryDocId } = await import("../lib/server/ai/runtime-state.ts");
const { commercialEvidenceFacts } = await import("../lib/crm-field-evidence.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { mergeRelationshipState } = await import("../lib/server/ai/relationship-state.ts");
const { normalizePipelineStages } = await import("../lib/pipeline.ts");
const tenantId = `qa_current_${Date.now()}_${randomUUID().slice(0, 6)}`, userId = `${tenantId}_seller`;
let sequence = 0;
const stages = normalizePipelineStages([{ id: "entrada", label: "Entrada" }]);
before(async () => {
  await adminDb.collection("users").doc(userId).set({ tenantId, role: "client_owner", status: "active" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`).set({ tenantId, userId, role: "client_owner", status: "active" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: false, responsePaused: true } });
});
after(async () => {
  mock.restoreAll();
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "chats", "messages", "ai_lead_memory", "lead_tasks", "ai_logs", "crm_conversation_observations"])
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  globalThis.fetch = originalFetch;
  await adminDb.terminate();
});
async function fixture() {
  const leadId = `${tenantId}_${++sequence}`, ref = adminDb.collection("leads").doc(leadId);
  await ref.set({ tenantId, ownerId: userId, nome: "Cliente fictício", pipelineStage: "entrada",
    customFields: { orcamento: "5000 reais", objetivo_principal: "Objetivo anterior", urgencia: "Urgência anterior", decisor: "Decisor anterior" },
    aiBudgetBand: "9000 reais", aiPrimaryGoal: "Objetivo do alias", aiUrgency: "Urgência do alias", aiDecisionMaker: "Decisor do alias",
    aiMemory: { budgetBand: "7000 reais", primaryGoal: "Objetivo da memória", urgency: "Urgência da memória", decisionMaker: "Decisor da memória" },
    aiFieldEvidence: { "custom.orcamento": { source: "customer_message", value: "5000 reais" }, budgetBand: { value: "9000 reais" } },
  });
  await adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(tenantId, leadId)).set({ tenantId, leadId,
    budgetBand: "11000 reais", primaryGoal: "Objetivo de outra memória", urgency: "Urgência de outra memória", decisionMaker: "Decisor de outra memória" });
  return { leadId, ref, context: { tenantId, leadId, userId, userName: "Vendedor fictício" } };
}

test("human budget correction reaches qualification, conversation memory and seller dossier", async () => {
  const f = await fixture();
  await save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } });
  const lead = (await f.ref.get()).data()!;
  const qualification = qualify({ lead, stages });
  assert.equal(qualification.reasons.find(reason => reason.code === "budget_band_mapped")?.detail, "3000 reais");
  assert.equal((await getLeadMemory(tenantId, f.leadId))?.budgetBand, "3000 reais");
  const brief = await dossier({ tenantId, leadId: f.leadId, trigger: "qualification_ready", actorId: userId });
  assert.ok(brief?.talkingPoints.includes("Orçamento registrado: 3000 reais."));
  assert.equal(brief?.talkingPoints.some((point: string) => /7000|9000|11000/.test(point)), false);
  assert.equal(commercialEvidenceFacts(lead).find(fact => fact.label === "Orçamento")?.value, "3000 reais");
});

test("human clear removes stale budget from all current readers without erasing historical aliases", async () => {
  const f = await fixture();
  await save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "" } });
  const lead = (await f.ref.get()).data()!;
  assert.equal(qualify({ lead, stages }).reasonCodes.includes("budget_band_mapped"), false);
  assert.equal((await getLeadMemory(tenantId, f.leadId))?.budgetBand, null);
  const brief = await dossier({ tenantId, leadId: f.leadId, trigger: "qualification_ready", actorId: userId });
  assert.equal(brief?.talkingPoints.some((point: string) => /orçamento|7000|9000|11000/i.test(point)), false);
  assert.equal(commercialEvidenceFacts(lead).some(fact => fact.label === "Orçamento"), false);
  assert.equal(lead.aiBudgetBand, "9000 reais");
});

test("release alone cannot resurrect an alias; a genuinely new message can replace the cleared field", async () => {
  const f = await fixture();
  await save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "" } });
  await save(f.context, { revision: (await read(f.context)).revision, releaseFields: ["orcamento"] });
  assert.equal((await getLeadMemory(tenantId, f.leadId))?.budgetBand, null);
  const chatId = `${f.leadId}_chat`, messageId = `${f.leadId}_new`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: f.leadId, channel: "whatsapp" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, leadId: f.leadId, chatId, sender: "client", text: "Meu orçamento é 4000 reais", createdAt: new Date() });
  assert.equal((await observe({ tenantId, chatId, messageId })).observed, true);
  assert.equal((await getLeadMemory(tenantId, f.leadId))?.budgetBand, "4000 reais");
  assert.equal(qualify({ lead: (await f.ref.get()).data()!, stages }).reasons.find(reason => reason.code === "budget_band_mapped")?.detail, "4000 reais");
});

test("goal, urgency and decision maker corrections obey the same contract as budget", async () => {
  const f = await fixture();
  await save(f.context, { revision: (await read(f.context)).revision, fields: {
    objetivo_principal: "Reduzir faltas aos agendamentos", urgencia: "Após a reforma", decisor: "Mariana, minha sócia",
  } });
  const lead = (await f.ref.get()).data()!, memory = await getLeadMemory(tenantId, f.leadId);
  assert.equal(memory?.primaryGoal, "Reduzir faltas aos agendamentos");
  assert.equal(memory?.urgency, "Após a reforma"); assert.equal(memory?.decisionMaker, "Mariana, minha sócia");
  const qualification = qualify({ lead, stages });
  assert.equal(qualification.reasons.find(reason => reason.code === "primary_goal_mapped")?.detail, memory.primaryGoal);
  assert.equal(qualification.reasons.find(reason => reason.code === "urgency_mapped")?.detail, memory.urgency);
  assert.equal(qualification.reasons.find(reason => reason.code === "decision_maker_mapped")?.detail, memory.decisionMaker);
});

test("two opportunities for one contact cannot share the corrected commercial budget", async () => {
  const first = await fixture(), second = await fixture(), contactId = `${tenantId}_contact`;
  await first.ref.update({ contactId }); await second.ref.update({ contactId });
  await save(first.context, { revision: (await read(first.context)).revision, fields: { orcamento: "3000 reais" } });
  assert.equal((await getLeadMemory(tenantId, first.leadId))?.budgetBand, "3000 reais");
  assert.equal((await getLeadMemory(tenantId, second.leadId))?.budgetBand, "5000 reais");
});

test("saving a correction refreshes stored qualification and both dossier copies in the same commit", async () => {
  const f = await fixture();
  await f.ref.update({ qualification: qualify({ lead: (await f.ref.get()).data()!, stages }),
    aiLeadSummary: "O orçamento é de 9000 reais", aiMemory: { budgetBand: "7000 reais", diagnosis: "Planejar investimento de 9000 reais" } });
  await dossier({ tenantId, leadId: f.leadId, trigger: "qualification_ready", actorId: userId });
  await save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } });
  const row = (await f.ref.get()).data()!;
  assert.equal(row.qualification.reasons.find((reason: { code: string }) => reason.code === "budget_band_mapped")?.detail, "3000 reais");
  assert.ok(row.commercialDossier.talkingPoints.includes("Orçamento registrado: 3000 reais."));
  assert.doesNotMatch(JSON.stringify(row.commercialDossier), /7000 reais|9000 reais/);
  assert.equal((await f.ref.collection("documents").doc("commercial_dossier").get()).data()?.fingerprint, row.commercialDossier.fingerprint);
  const reviewed = (await f.ref.collection("events").where("type", "==", "qualification_reviewed").get()).docs[0].data();
  assert.ok(reviewed.previousDossierFingerprint);
  assert.equal(row.aiLeadSummary, null);
  const later = await dossier({ tenantId, leadId: f.leadId, trigger: "handoff", actorId: userId });
  assert.doesNotMatch(JSON.stringify(later), /7000 reais|9000 reais/);
});

test("the agent prompt cannot receive a contradictory relationship fact, raw field or generated summary", async () => {
  const f = await fixture(), memoryRef = adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(tenantId, f.leadId));
  const state = mergeRelationshipState({ tenantId, leadId: f.leadId, sourceMessageId: "fictional_old_message",
    occurredAtMs: Date.now(), extractedFields: { budgetBand: "11000 reais" }, inboundText: "Meu orçamento é 11000 reais" }).state;
  assert.equal(state.facts.budgetBand.value, "11000 reais");
  await memoryRef.update({ relationshipState: state, fields: { budgetBand: "11000 reais", budget: "11000 reais" },
    summary: "Investirá 11000 reais", diagnosis: "Precisa investir 11000 reais" });
  await save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } });
  const memory = await getLeadMemory(tenantId, f.leadId);
  assert.equal(memory?.budgetBand, "3000 reais");
  assert.equal(memory?.relationshipState?.facts.budgetBand, undefined);
  assert.equal(memory?.fields?.budgetBand, "3000 reais"); assert.equal(memory?.fields?.budget, "3000 reais");
  assert.equal(memory?.summary, null); assert.equal(memory?.diagnosis, null);
  assert.equal((await memoryRef.get()).data()?.summary, "Investirá 11000 reais");
});

test("an audit write failure rolls back facts, qualification and both dossier copies", async () => {
  const f = await fixture();
  await dossier({ tenantId, leadId: f.leadId, trigger: "qualification_ready", actorId: userId });
  const before = await f.ref.get(), documentRef = f.ref.collection("documents").doc("commercial_dossier"), beforeDocument = await documentRef.get();
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith(`${f.ref.path}/events/`)) throw new Error("QA_REVIEW_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try { await assert.rejects(save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } }), /QA_REVIEW_AUDIT_FAILURE/); }
  finally { hook.mock.restore(); }
  assert.ok((await f.ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await documentRef.get()).updateTime!.isEqual(beforeDocument.updateTime!));
});

test("manual score is preserved and releasing a field does not regenerate a reviewed dossier", async () => {
  const f = await fixture(); await f.ref.update({ score: 42, scoreSource: "manual" });
  await dossier({ tenantId, leadId: f.leadId, trigger: "qualification_ready", actorId: userId });
  await save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } });
  const before = (await f.ref.get()).data()!;
  assert.equal(before.score, 42); assert.equal(before.scoreSource, "manual");
  assert.equal(before.commercialDossier.score, 42);
  await save(f.context, { revision: (await read(f.context)).revision, releaseFields: ["orcamento"] });
  const after = (await f.ref.get()).data()!;
  assert.equal(after.commercialDossier.fingerprint, before.commercialDossier.fingerprint);
  assert.equal(after.commercialDossier.version, before.commercialDossier.version);
});

test("a foreign dossier document cannot be overwritten by a human review", async () => {
  const f = await fixture();
  await f.ref.update({ commercialDossier: { fingerprint: "fictional_previous" } });
  const documentRef = f.ref.collection("documents").doc("commercial_dossier");
  await documentRef.set({ tenantId: `${tenantId}_foreign`, sourceLeadGeneration: (await f.ref.get()).createTime });
  const before = await f.ref.get(), document = await documentRef.get();
  await assert.rejects(save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "dossier_changed");
  assert.ok((await f.ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await documentRef.get()).updateTime!.isEqual(document.updateTime!));
});

test("legacy-only facts displayed by the reviewer match the shared reader before saving", async () => {
  const f = await fixture();
  await f.ref.update({ customFields: {} });
  const review = await read(f.context);
  assert.equal(review.fields.orcamento, "9000 reais");
  assert.equal(review.fields.objetivo_principal, "Objetivo do alias");
});

test("a recreated lead cannot repurpose a dossier from its previous generation", async () => {
  const f = await fixture();
  await dossier({ tenantId, leadId: f.leadId, trigger: "qualification_ready", actorId: userId });
  const previous = (await f.ref.get()).data()!, documentRef = f.ref.collection("documents").doc("commercial_dossier"), before = await documentRef.get();
  await f.ref.delete(); await f.ref.set(previous);
  const current = await f.ref.get();
  await assert.rejects(save(f.context, { revision: (await read(f.context)).revision, fields: { orcamento: "3000 reais" } }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "dossier_changed");
  assert.ok((await f.ref.get()).updateTime!.isEqual(current.updateTime!));
  assert.ok((await documentRef.get()).updateTime!.isEqual(before.updateTime!));
});
