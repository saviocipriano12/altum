import assert from "node:assert/strict";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "altum-proactive-test";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });

const { generateAiProactiveRecommendation } = await import("../lib/ai-proactive-intelligence.ts");
const { persistAiProactiveRecommendation, reviewAiProactiveRecommendation } = await import("../lib/server/ai/proactive-store.ts");
const { scanAiProactiveRecommendations } = await import("../lib/server/ai/proactive-processor.ts");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const now = Date.UTC(2026, 9, 12, 12);

test("recomendacao proativa e idempotente, isolada e sem texto de conversa", async () => {
  const item = generateAiProactiveRecommendation({ tenantId: "tenant-a", leadId: "lead-a", nowMs: now, score: 90, lastInteractionAtMs: now - 48 * 3_600_000 })!;
  const first = await persistAiProactiveRecommendation(item, "operator-a");
  const replay = await persistAiProactiveRecommendation(item, "operator-a");
  assert.equal(first.status, "created");
  assert.equal(replay.status, "duplicate");
  const stored = await adminDb.collection("ai_proactive_recommendations").doc(item.fingerprint).get();
  assert.equal(stored.data()?.tenantId, "tenant-a");
  assert.equal(stored.data()?.leadId, "lead-a");
  assert.equal(JSON.stringify(stored.data()).includes("messageText"), false);
  await assert.rejects(() => persistAiProactiveRecommendation({ ...item, tenantId: "tenant-b" }, "operator-b"), /scope_conflict/);
});

test("entrada invalida nao persiste", async () => {
  await assert.rejects(() => persistAiProactiveRecommendation({} as never, "operator"), /invalid_proactive/);
});

test("job varre tenant habilitado, pagina leads e registra recibo sem efeito externo", async () => {
  await adminDb.collection("tenant_settings").doc("tenant-job").set({ tenantId: "tenant-job", ai: { enabled: true, proactiveEnabled: true }, timezone: "America/Sao_Paulo" });
  await adminDb.collection("leads").doc("lead-job").set({ tenantId: "tenant-job", status: "open", score: 88, lastInteractionAt: new Date(now - 48 * 3_600_000) });
  const result = await scanAiProactiveRecommendations({ tenantLimit: 20, leadLimit: 20, nowMs: now });
  assert.equal(result.externalEffects, 0);
  assert.ok(result.tenantsEnabled >= 1);
  assert.ok(result.leadsScanned >= 1);
  assert.ok(result.created >= 1);
  const recommendations = await adminDb.collection("ai_proactive_recommendations").where("tenantId", "==", "tenant-job").get();
  assert.equal(recommendations.size, 1);
  const receipt = await adminDb.collection("ai_proactive_scan_runs").doc(result.runId).get();
  assert.equal(receipt.data()?.externalEffects, 0);
});

test("revisao e transacional, exige ordem valida e grava somente resultado fechado", async () => {
  const item = generateAiProactiveRecommendation({ tenantId: "tenant-review", leadId: "lead-review", nowMs: now, score: 91, lastInteractionAtMs: now - 48 * 3_600_000 })!;
  await persistAiProactiveRecommendation(item, "operator-a");
  await assert.rejects(() => reviewAiProactiveRecommendation({ tenantId: "tenant-review", recommendationId: item.fingerprint, action: "complete", outcome: "positive", reviewedBy: "operator-a" }), /invalid_proactive_transition/);
  const accepted = await reviewAiProactiveRecommendation({ tenantId: "tenant-review", recommendationId: item.fingerprint, action: "accept", reviewedBy: "operator-a" });
  assert.equal(accepted.status, "accepted");
  const completed = await reviewAiProactiveRecommendation({ tenantId: "tenant-review", recommendationId: item.fingerprint, action: "complete", outcome: "positive", reviewedBy: "operator-a" });
  assert.equal(completed.status, "completed");
  const stored = (await adminDb.collection("ai_proactive_recommendations").doc(item.fingerprint).get()).data();
  assert.equal(stored?.outcome, "positive");
  assert.equal("outcomeNote" in (stored || {}), false);
  await assert.rejects(() => reviewAiProactiveRecommendation({ tenantId: "tenant-other", recommendationId: item.fingerprint, action: "dismiss", reviewedBy: "operator-b" }), /scope_invalid/);
});
