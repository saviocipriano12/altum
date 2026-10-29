import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { commercialTaskIndex, commercialTaskIndexMatches, withCommercialTaskIndex } from "../lib/crm-task-index.ts";
test("legacy date formats share chronological keys; an undated return sorts after dated ones", () => {
  const instant = "2026-10-23T14:00:00.000Z", ms = Date.parse(instant);
  for (const dueAt of [instant, new Date(instant), Timestamp.fromMillis(ms), { seconds: ms / 1000 }, ms, ms / 1000]) {
    assert.deepEqual(commercialTaskIndex({ dueAt, status: "pending" }), { version: 1, state: "pending", openRank: 0, dueOrder: ms, issue: null });
  }
  for (const dueAt of [null, undefined, ""]) assert.equal(commercialTaskIndex({ dueAt }).dueOrder, Number.MAX_SAFE_INTEGER);
  assert.ok(commercialTaskIndex({}).dueOrder > ms);
});
test("invalid legacy dates or states remain review cases, without fabricating a deadline", () => {
  assert.equal(commercialTaskIndex({ dueAt: "not-a-date" }).issue, "invalid_due_at");
  assert.equal(commercialTaskIndex({ dueAt: new Date(NaN) }).issue, "invalid_due_at");
  assert.equal(commercialTaskIndex({ status: "unrecognized" }).issue, "invalid_status");
  for (const status of [null, false, 0, "", [], {}]) assert.equal(commercialTaskIndex({ status }).issue, "invalid_status");
  assert.equal(commercialTaskIndex({}).issue, null);
  for (const status of ["done", "completed"]) assert.equal(commercialTaskIndex({ status }).state, "done");
  for (const status of ["canceled", "cancelled", "no_show"]) assert.equal(commercialTaskIndex({ status }).state, "canceled");
});
test("index patches use the current task without copying or overwriting other business fields", () => {
  const original = { title: "Ligar", dueAt: "2026-10-23T14:00:00Z", status: "pending", version: 4 };
  const patch = withCommercialTaskIndex({ status: "done", version: 5 }, original);
  assert.equal(patch.crmTaskIndex.dueOrder, Date.parse(original.dueAt));
  assert.equal(patch.crmTaskIndex.state, "done"); assert.equal(Object.hasOwn(patch, "title"), false);
  assert.deepEqual(original, { title: "Ligar", dueAt: "2026-10-23T14:00:00Z", status: "pending", version: 4 });
  assert.equal(commercialTaskIndexMatches({ ...original, ...patch }), true);
  assert.equal(commercialTaskIndexMatches({ ...original, ...patch, dueAt: null }), false);
});
