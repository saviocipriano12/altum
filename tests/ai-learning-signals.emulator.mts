import assert from "node:assert/strict";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "altum-learning-test";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });

const { recordAiLearningSignal, refreshTenantLearningRecommendations } = await import("../lib/server/ai/learning-signals.ts");
const { getTenantLearningHints } = await import("../lib/server/ai/tenant-learning.ts");
const { trackAltumAgentLearning } = await import("../lib/server/ai/learning-loop.ts");
const { trackProposalOutcome } = await import("../lib/server/ai/learning-outcomes.ts");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");

test("sinal e idempotente, isolado e nao persiste texto bruto", async () => {
  const input = {
    tenantId: "tenant-learning-a",
    dedupeKey: "event-1",
    relationshipId: "lead-sensitive-id",
    type: "explicit_feedback" as const,
    source: "customer" as const,
    direction: "positive" as const,
    targetKind: "channel" as const,
    targetId: "whatsapp",
    rawCandidate: "Gostei da resposta",
  };
  const first = await recordAiLearningSignal(input);
  const replay = await recordAiLearningSignal(input);
  assert.equal(first.status, "accepted");
  assert.equal(replay.status, "duplicate");
  assert.ok("signalId" in first);
  const doc = await adminDb.collection("ai_learning_signals").doc(first.signalId).get();
  assert.equal(doc.data()?.tenantId, input.tenantId);
  assert.equal("rawCandidate" in (doc.data() || {}), false);
  assert.notEqual(doc.data()?.relationshipKey, input.relationshipId);
});

test("global recebe apenas taxonomia segura e nunca tenant ou relacionamento", async () => {
  await recordAiLearningSignal({ tenantId: "tenant-learning-a", dedupeKey: "global-safe", relationshipId: "lead-a", type: "conversion", source: "business_outcome", direction: "positive", targetKind: "channel", targetId: "whatsapp" });
  await recordAiLearningSignal({ tenantId: "tenant-learning-b", dedupeKey: "tenant-only", relationshipId: "lead-b", type: "conversion", source: "business_outcome", direction: "positive", targetKind: "offer", targetId: "oferta_exclusiva" });
  const global = await adminDb.collection("ai_global_learning_daily").limit(5).get();
  assert.ok(global.size >= 1);
  const raw = JSON.stringify(global.docs.map((doc) => doc.data()));
  assert.doesNotMatch(raw, /tenant-learning|lead-|oferta_exclusiva/);
  assert.match(raw, /whatsapp/);
});

test("amostra diversa cria recomendacao somente em sombra", async () => {
  for (let index = 0; index < 12; index += 1) {
    await recordAiLearningSignal({
      tenantId: "tenant-learning-shadow",
      dedupeKey: `meeting-${index}`,
      relationshipId: `lead-${index % 6}`,
      type: "appointment_outcome",
      source: "business_outcome",
      direction: "positive",
      targetKind: "closing_motion",
      targetId: "meeting",
    });
  }
  const recommendations = await refreshTenantLearningRecommendations("tenant-learning-shadow");
  assert.equal(recommendations.length, 1);
  const stored = await adminDb.collection("ai_tenant_learning_recommendations").where("tenantId", "==", "tenant-learning-shadow").get();
  assert.equal(stored.size, 1);
  assert.equal(stored.docs[0]?.data().status, "shadow");
  assert.ok(stored.docs[0]?.data().sampleSize >= 8);
  assert.deepEqual(await getTenantLearningHints("tenant-learning-shadow"), {
    hasData: false,
    topOffers: [],
    topActions: [],
    topObjections: [],
    preferredClosingMotion: null,
    evidenceFingerprints: [],
  });

  await stored.docs[0]!.ref.set({ status: "approved" }, { merge: true });
  const active = await getTenantLearningHints("tenant-learning-shadow");
  assert.equal(active.hasData, true);
  assert.equal(active.preferredClosingMotion, "meeting");
  assert.equal((await getTenantLearningHints("tenant-learning-other")).hasData, false);

  await recordAiLearningSignal({
    tenantId: "tenant-learning-shadow",
    dedupeKey: "meeting-new-evidence",
    relationshipId: "lead-new",
    type: "appointment_outcome",
    source: "business_outcome",
    direction: "positive",
    targetKind: "closing_motion",
    targetId: "meeting",
  });
  await refreshTenantLearningRecommendations("tenant-learning-shadow");
  const refreshed = await stored.docs[0]!.ref.get();
  assert.equal(refreshed.data()?.status, "shadow", "evidencia nova exige nova avaliacao antes de voltar ao runtime");
  assert.equal((await getTenantLearningHints("tenant-learning-shadow")).hasData, false);
});

test("execucao da IA e outcome comercial sao idempotentes e somente o outcome ensina", async () => {
  const tenantId = "tenant-learning-outcomes";
  for (let index = 0; index < 8; index += 1) {
    const observation = {
      tenantId,
      chatId: `chat-${index}`,
      leadId: `lead-${index}`,
      aiLogId: `ai-log-${index}`,
      decision: "responder",
      recommendedOffer: "Plano Pro",
      nextAction: "enviar proposta",
      objectionType: "preco",
      confidence: 0.9,
      qualityScore: 0.9,
    };
    await trackAltumAgentLearning(observation);
    if (index === 0) await trackAltumAgentLearning(observation);
    await trackProposalOutcome({
      tenantId,
      leadId: `lead-${index}`,
      budgetId: `budget-${index}`,
      status: "Enviado",
    });
  }

  await trackProposalOutcome({ tenantId, leadId: "lead-0", budgetId: "budget-0", status: "Enviado" });
  const events = await adminDb.collection("ai_learning_events").where("tenantId", "==", tenantId).get();
  const outcomes = await adminDb.collection("ai_learning_outcomes").where("tenantId", "==", tenantId).get();
  const agentSignals = await adminDb.collection("ai_learning_signals").where("tenantId", "==", tenantId).where("type", "==", "agent_observation").get();
  const offerSignals = await adminDb.collection("ai_learning_signals").where("tenantId", "==", tenantId).where("targetKind", "==", "offer").get();
  assert.equal(events.size, 8);
  assert.equal(outcomes.size, 8);
  assert.equal(agentSignals.size, 8);
  assert.ok(agentSignals.docs.every((doc) => doc.data().accepted === false && doc.data().weight === 0));
  assert.equal(offerSignals.size, 8);
  assert.ok(offerSignals.docs.every((doc) => doc.data().source === "business_outcome" && doc.data().accepted === true));

  const recommendations = await adminDb.collection("ai_tenant_learning_recommendations").where("tenantId", "==", tenantId).get();
  const offerRecommendation = recommendations.docs.find((doc) => doc.data().targetKind === "offer");
  assert.ok(offerRecommendation);
  assert.equal(offerRecommendation.data().status, "shadow");
  assert.equal(offerRecommendation.data().distinctRelationships, 8);
});
