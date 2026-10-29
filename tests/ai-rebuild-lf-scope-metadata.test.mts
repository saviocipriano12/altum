import test from "node:test";
import assert from "node:assert/strict";
import { buildLfScopeMetadata, LF_SCOPE } from "../scripts/ai-rebuild/lf-scope-metadata.mts";

function fixture() {
  return { settings: { id: LF_SCOPE.tenantId, data: { tenantId: LF_SCOPE.tenantId, name: "LF ficticia", ai: {
    enabled: true, responsePaused: false, businessSummary: "PRIVATE_CANARY", guardrails: ["PRIVATE_CANARY"],
    operatingProfile: { autonomyMode: "hybrid", monthlyBudgetUsd: 2 },
    rollout: { exclusiveTest: { tenantId: LF_SCOPE.tenantId, chatIds: ["PRIVATE_CANARY"] } }, accessToken: "PRIVATE_CANARY",
  } } }, connections: [{ id: LF_SCOPE.connectionId, data: { tenantId: LF_SCOPE.tenantId, provider: "shopify", status: "active", storeId: String(LF_SCOPE.storeDomain) } }],
  channels: [{ id: "PRIVATE_CANARY", data: { tenantId: String(LF_SCOPE.tenantId), type: "whatsapp", status: "active" } }],
  documents: [{ id: "PRIVATE_CANARY", data: { tenantId: String(LF_SCOPE.tenantId), type: "policy", content: "PRIVATE_CANARY" } }],
  pipelines: [{ id: LF_SCOPE.tenantId, data: { tenantId: LF_SCOPE.tenantId, stages: [{ id: "novo", label: "PRIVATE_CANARY" }] } }],
  };
}
test("metadata excludes private text, documents, channel/chat IDs and secrets without claiming readiness", () => {
  const report = buildLfScopeMetadata(fixture());
  assert.equal(JSON.stringify(report).includes("PRIVATE_CANARY"), false);
  assert.equal(report.controls.businessSummaryPresent, true); assert.equal(report.controls.exclusiveTestConversationCount, 1);
  assert.equal(report.connection.savedActive, true); assert.equal(report.connection.credentialsTested, false);
  assert.equal(report.newPilotAuthorized, false); assert.equal(report.productReady, false);
  assert.deepEqual(report.pipeline.stageIds, ["novo"]); assert.equal(report.pipeline.semanticStageMappingApproved, false);
});
test("foreign tenant or connection/store mismatch cannot generate LF inventory", () => {
  const wrongTenant = fixture(); wrongTenant.documents[0].data.tenantId = "other";
  assert.throws(() => buildLfScopeMetadata(wrongTenant), /outro tenant/);
  const wrongStore = fixture(); wrongStore.connections[0].data.storeId = "wrong.myshopify.com";
  assert.throws(() => buildLfScopeMetadata(wrongStore), /nao confirmada/);
});
test("saved active channel is not live access proof; empty exclusivity and duplicate funnel IDs are invalid", () => {
  const data = fixture(); data.settings.data.ai.rollout.exclusiveTest.chatIds = [];
  data.pipelines[0].data.stages.push({ id: "novo", label: "duplicate" });
  const report = buildLfScopeMetadata(data);
  assert.equal(report.controls.exclusiveTestStructurallyValid, false);
  assert.equal(report.pipeline.allStageIdsValidAndUnique, false);
  assert.ok(report.channels.every(channel => channel.liveProviderContractTested === false));
});
test("missing custom pipeline means runtime profile fallback, not no CRM funnel", () => {
  const data = fixture(); data.pipelines = [];
  const report = buildLfScopeMetadata(data);
  assert.equal(report.pipeline.configuredDocumentFound, false);
  assert.equal(report.pipeline.runtimeFallsBackToBusinessProfile, true);
});
test("legacy direct pipeline without tenant binding is visible but foreign binding is refused", () => {
  const data = fixture(); Object.assign(data.pipelines[0].data, { tenantId: undefined });
  assert.equal(buildLfScopeMetadata(data).pipeline.legacyDirectBindingMissing, true);
  Object.assign(data.pipelines[0].data, { tenantId: "other" });
  assert.throws(() => buildLfScopeMetadata(data), /Funil de outro tenant/);
});
