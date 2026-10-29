import assert from "node:assert/strict";
import test from "node:test";
import { activationReadiness, agentManifestSchema } from "@/lib/server/agent-os/agent-manifest";

const source = {
  repo: "Ado77/agency-agents",
  commit: "3c9588880b7cafaec325a104899fd8bbe27e7d72",
  path: "paid-media/paid-media-paid-social-strategist.md",
  license: "MIT",
};

test("review manifests preserve source provenance but cannot be activated", () => {
  const parsed = agentManifestSchema.parse({
    schemaVersion: 1,
    agentId: "paid-social-strategist",
    version: "0.1.0",
    displayName: "Especialista de Mídia Paga Social",
    role: "Planeja campanhas sociais.",
    status: "review_required",
    executionMode: "draft_only",
    source,
    ownerId: null,
    capabilities: ["READ_ANALYTICS"],
    skillIds: ["campaign-plan"],
    allowedConnectionKinds: ["none", "read_only"],
    approvalCapabilities: [],
    limits: { maxRunMinutes: 15, maxAttempts: 2, maxCostBrl: 20 },
    evaluationIds: ["paid-social-plan-v1"],
    escalation: { requiresHumanForExternalAction: true, failureOwner: null },
  });
  const readiness = activationReadiness(parsed);
  assert.equal(readiness.ready, false);
  assert.match(readiness.blockers.join(" "), /não está marcado como ativo/i);
});

test("external execution capabilities require their approval policy", () => {
  const parsed = agentManifestSchema.parse({
    schemaVersion: 1,
    agentId: "paid-social-strategist",
    version: "0.1.0",
    displayName: "Especialista de Mídia Paga Social",
    role: "Planeja campanhas sociais.",
    status: "active",
    executionMode: "supervised",
    source,
    ownerId: "agency-ops",
    capabilities: ["PUBLISH_OR_ADS_WRITE"],
    skillIds: ["campaign-plan"],
    allowedConnectionKinds: ["approved_write"],
    approvalCapabilities: [],
    limits: { maxRunMinutes: 15, maxAttempts: 2, maxCostBrl: 20 },
    evaluationIds: ["paid-social-plan-v1"],
    escalation: { requiresHumanForExternalAction: true, failureOwner: "agency-ops" },
  });
  const readiness = activationReadiness(parsed);
  assert.equal(readiness.ready, false);
  assert.match(readiness.blockers.join(" "), /PUBLISH_OR_ADS_WRITE/);
});

test("supervised agent with owner, eval and approval policy can be activated", () => {
  const parsed = agentManifestSchema.parse({
    schemaVersion: 1,
    agentId: "paid-social-strategist",
    version: "0.1.0",
    displayName: "Especialista de Mídia Paga Social",
    role: "Planeja campanhas sociais.",
    status: "active",
    executionMode: "supervised",
    source,
    ownerId: "agency-ops",
    capabilities: ["PUBLISH_OR_ADS_WRITE"],
    skillIds: ["campaign-plan"],
    allowedConnectionKinds: ["approved_write"],
    approvalCapabilities: ["PUBLISH_OR_ADS_WRITE"],
    limits: { maxRunMinutes: 15, maxAttempts: 2, maxCostBrl: 20 },
    evaluationIds: ["paid-social-plan-v1"],
    escalation: { requiresHumanForExternalAction: true, failureOwner: "agency-ops" },
  });
  assert.deepEqual(activationReadiness(parsed), { ready: true, blockers: [] });
});
