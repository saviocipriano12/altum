import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const objectiveRoute = readFileSync(
  join(root, "app/api/admin/agent-os/objectives/route.ts"),
  "utf8",
);
const programRoute = readFileSync(
  join(root, "app/api/admin/agent-os/programs/route.ts"),
  "utf8",
);

test("objective and program status changes remain agency-admin operations", () => {
  for (const source of [objectiveRoute, programRoute]) {
    assert.match(source, /export async function PATCH/);
    assert.match(source, /roles:\s*\["agency_admin"\]/);
    assert.match(source, /adminDb\.runTransaction/);
    assert.match(source, /adminDb\.collection\("audit_logs"\)/);
    assert.match(source, /updatedBy: actor\.uid/);
  }
});

test("objective and program routes only accept their canonical status values", () => {
  assert.match(
    objectiveRoute,
    /\["draft", "active", "achieved", "cancelled"\]\.includes/,
  );
  assert.match(
    programRoute,
    /\["draft", "active", "paused", "completed", "cancelled"\]\.includes/,
  );
});
