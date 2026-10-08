import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const route = readFileSync(join(root, "app", "api", "admin", "agent-os", "missions", "[missionId]", "route.ts"), "utf8");
const page = readFileSync(join(root, "app", "admin", "missoes", "page.tsx"), "utf8");

test("reconciliation endpoint requires agency admin and validates ownership", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /requireRequestUser\(request, \{ roles: \["agency_admin"\] \}\)/);
  assert.match(route, /dispatch\.get\("missionId"\)/);
  assert.match(route, /dispatch\.get\("tenantId"\)/);
  assert.match(route, /reconciliation_mismatch/);
});

test("reconciliation decisions are transactional, audited, and not executable commands", () => {
  assert.match(route, /"confirmed_completed", "confirmed_not_executed", "requires_investigation"/);
  assert.match(route, /reason\.length < 20 \|\| reason\.length > 2000/);
  assert.match(route, /reconciliation_closed/);
  assert.match(route, /reconciliation_unchanged/);
  assert.match(route, /transaction\.set\(dispatchRef/);
  assert.match(route, /transaction\.set\(auditRef/);
  const postBody = route.split("export async function POST")[1].split("function errorResponse")[0];
  assert.doesNotMatch(postBody, /dispatchMissionToOpenClaw\(/);
});

test("Mission Control exposes evidence and human decision", () => {
  assert.match(page, /ReconciliationPanel/);
  assert.match(page, /pendingReconciliationDispatches/);
  assert.match(page, /onResolved=\{load\}/);
  assert.match(page, /requires_investigation/);
  assert.match(page, /confirmed_not_executed/);
  assert.match(page, /confirmed_completed/);
});
