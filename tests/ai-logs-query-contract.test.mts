import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AI audit returns the most recent decisions instead of an unordered sample", async () => {
  const routeSource = await readFile(new URL("../app/api/tenant/[tenantId]/ai-logs/route.ts", import.meta.url), "utf8");
  const indexesSource = await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8");

  assert.match(routeSource, /where\("tenantId", "==", tenantId\)\s*\.orderBy\("createdAt", "desc"\)\s*\.limit\(40\)/);
  assert.doesNotMatch(routeSource, /limit\(150\)/);
  assert.match(indexesSource, /"collectionGroup": "ai_logs"[\s\S]*?"fieldPath": "tenantId"[\s\S]*?"fieldPath": "createdAt"[\s\S]*?"order": "DESCENDING"/);
});

test("AI usage exposes the effective limit and returns the most recent ledger entries", async () => {
  const routeSource = await readFile(new URL("../app/api/tenant/[tenantId]/ai-usage/route.ts", import.meta.url), "utf8");
  const indexesSource = await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8");

  assert.match(routeSource, /where\("tenantId", "==", tenantId\)\s*\.orderBy\("createdAt", "desc"\)\s*\.limit\(40\)/);
  assert.match(routeSource, /const effectiveUsageCap = configuredUsageCaps\.length \? Math\.min\(\.\.\.configuredUsageCaps\) : 0/);
  assert.match(routeSource, /usageCapExceeded,/);
  assert.match(routeSource, /budgetCapExceeded,/);
  assert.match(indexesSource, /"collectionGroup": "ai_usage_ledger"[\s\S]*?"fieldPath": "tenantId"[\s\S]*?"fieldPath": "createdAt"[\s\S]*?"order": "DESCENDING"/);
});

test("AI action engine reserves funnel changes and commercial drafts for autonomous mode", async () => {
  const agentSource = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");

  assert.match(agentSource, /const canAdvanceCommercialWorkflow = canAutonomouslyAdvanceCommercialWorkflow\(input\.autonomyMode\)/);
  assert.match(agentSource, /canAdvanceCommercialWorkflow && canAdvanceStage && suggestedStage/);
  assert.match(agentSource, /canAdvanceCommercialWorkflow && nextActionChanged && input\.plan\.nextAction === "preparar_proposta_comercial"/);
  assert.match(agentSource, /allowStageAdvance: canAdvanceCommercialWorkflow && canAdvanceStage/);
});

test("handoff notifications never treat a lead phone as an internal recipient", async () => {
  const agentSource = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");
  const settingsSource = await readFile(new URL("../app/api/tenant/[tenantId]/settings/ai/route.ts", import.meta.url), "utf8");

  assert.match(agentSource, /function extractHandoffOwnerPhoneCandidates/);
  assert.match(agentSource, /extractHandoffOwnerPhoneCandidates\(input\.chatData\)/);
  assert.match(agentSource, /extractHandoffOwnerPhoneCandidates\(leadData\)/);
  assert.doesNotMatch(agentSource, /extractPhoneCandidates\(input\.chatData\)/);
  assert.doesNotMatch(agentSource, /extractPhoneCandidates\(leadData\)/);
  assert.doesNotMatch(agentSource, /settings\?\.contactPhone \|\| settings\?\.ownerPhone \|\| settings\?\.phone/);
  assert.doesNotMatch(settingsSource, /settings\?\.contactPhone \|\| settings\?\.ownerPhone \|\| settings\?\.phone/);
});
