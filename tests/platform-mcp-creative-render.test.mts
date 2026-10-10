import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("lib/server/mcp/platform-admin-server.ts", "utf8");

test("platform render requires explicit approval and atomic job claim", () => {
  assert.match(source, /altum_admin_confirm_creative_render/);
  assert.match(source, /z\.literal\("I_CONFIRM_RENDER"\)/);
  assert.match(source, /job\.get\("status"\) !== "awaiting_approval"/);
  assert.match(source, /altum_admin_run_creative_render/);
  assert.match(source, /current\.get\("status"\) !== expected/);
});

test("model discovery exposes first-run routes safely and job listings scope to actor", () => {
  assert.match(source, /altum_admin_list_creative_models/);
  assert.match(source, /mediaConnectionAvailability\(row\)\.available/);
  assert.match(source, /ready_for_first_approved_render/);
  assert.match(source, /altum_admin_list_creative_jobs/);
  assert.match(source, /\.where\("createdBy", "==", actor!\.userId\)/);
});

test("accepted asynchronous render without polling URL is quarantined", () => {
  assert.match(source, /result\.status === "submitted" && classifyPlatformRender\(/);
  assert.match(source, /status: "needs_reconciliation", providerJobId: result\.providerJobId/);
});

test("platform render persists assets without exposing tenant media", () => {
  assert.match(source, /executeCreativeJobWithFallback\(/);
  assert.match(source, /planMediaConnections\(/);
  assert.match(source, /fallbackConnectionIds/);
  assert.match(source, /refreshCreativeJob\(/);
  assert.match(source, /persistCreativeAsset\(/);
  assert.match(source, /platform_creative_assets/);
  assert.match(source, /connection\.get\("scope"\) !== "platform"/);
  assert.match(source, /needs_reconciliation/);
});
