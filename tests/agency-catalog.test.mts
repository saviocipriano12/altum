import assert from "node:assert/strict";
import test from "node:test";
import { getImportedAgencyAgent, importedAgencyAgentIds } from "@/lib/server/agent-os/agency-catalog";
import { getAgencyCatalog } from "@/lib/server/agent-os/agent-catalog";
import { buildMissionTaskSeeds } from "@/lib/server/agent-os/missions";

test("Agency Agents catalog preserves the review boundary", () => {
  const agent = getImportedAgencyAgent("paid-social-strategist");
  assert.equal(agent?.status, "review_required");
  assert.equal(agent?.source.repo, "Ado77/agency-agents");
  assert.ok(importedAgencyAgentIds.includes("studio-producer"));
});

test("mission templates reference imported specialists without activating them", () => {
  const marketing = buildMissionTaskSeeds("marketing");
  const research = marketing.find((task) => task.agentCandidateId === "market-research-synthesist");
  const creative = marketing.find((task) => task.agentCandidateId === "visual-storyteller");
  const humanReview = marketing.find((task) => task.agent === "Human Review");
  assert.equal(research?.agentCandidate?.status, "review_required");
  assert.equal(creative?.agentCandidate?.displayRole, "Diretor Criativo");
  assert.equal(humanReview?.agentCandidate, null);
});

test("the administrative catalog never promotes an imported agent by itself", () => {
  const catalog = getAgencyCatalog();
  const paidSocial = catalog.find((agent) => agent.agentId === "paid-social-strategist");
  const visualStoryteller = catalog.find((agent) => agent.agentId === "visual-storyteller");

  assert.equal(catalog.length, importedAgencyAgentIds.length);
  assert.equal(paidSocial?.manifest?.executionMode, "draft_only");
  assert.equal(paidSocial?.activation.ready, false);
  assert.equal(visualStoryteller?.manifest, null);
  assert.match(visualStoryteller?.activation.blockers[0] || "", /manifesto/i);
});
