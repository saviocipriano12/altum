import assert from "node:assert/strict";
import test from "node:test";
import { applyConfirmedActivityRefresh, readActivityWindow, reconcileConfirmedActivities, activityLeadLabel, type ActivityFeedPage } from "../lib/crm-activity-window.ts";
import { normalizeCommercialActivity } from "../lib/crm-activity.ts";
const task = (id: string, revision = "1:1") => ({ ...normalizeCommercialActivity("task", id, { title: id }), revision });
const page = (items: ReturnType<typeof task>[], nextCursor: string | null = null): ActivityFeedPage => ({ contractVersion: 2, items, nextCursor, canEdit: true, reviewItems: [], coverage: nextCursor ? "partial" : "end_reached" });

test("legacy data preserves the full client selector and never requests a continuation", async () => {
  const calls: Array<string | undefined> = [];
  const result = await readActivityWindow({ refreshPages: 3, fetchPage: async cursor => { calls.push(cursor); return { contractVersion: 1, items: [task("old")], leads: [{ id: "first-time-customer" }], canEdit: true }; } });
  assert.deepEqual(calls, [undefined]); assert.equal(result.paged, false); assert.equal(result.leads[0].id, "first-time-customer");
});
test("a sparse empty page keeps its continuation and an append deduplicates updated identities", async () => {
  const first = await readActivityWindow({ fetchPage: async () => page([], "scan-next") });
  assert.equal(first.items.length, 0); assert.equal(first.nextCursor, "scan-next");
  const second = await readActivityWindow({ previous: first, append: true, fetchPage: async cursor => { assert.equal(cursor, "scan-next"); return page([task("a")], "next"); } });
  const final = await readActivityWindow({ previous: second, append: true, fetchPage: async () => page([task("a", "2:2"), task("b")]) });
  assert.deepEqual(final.items.map(row => [row.recordId, row.revision]), [["a", "2:2"], ["b", "1:1"]]);
  assert.equal(final.pages, 3); assert.equal(final.nextCursor, null); assert.equal(second.items[0].revision, "1:1");
});
test("refresh stages all visited pages before replacing the caller's visible window", async () => {
  const prior = await readActivityWindow({ fetchPage: async () => page([task("old")], "next") });
  const calls: Array<string | undefined> = [];
  const updated = await readActivityWindow({ previous: prior, refreshPages: 2, fetchPage: async cursor => {
    calls.push(cursor); return cursor ? page([task("old", "2:1")]) : page([task("arrived")], "new-next");
  } });
  assert.deepEqual(calls, [undefined, "new-next"]); assert.equal(prior.items[0].recordId, "old"); assert.equal(prior.items[0].revision, "1:1");
  assert.deepEqual(updated.items.map(row => row.recordId), ["arrived", "old"]);
});
test("a failed or canceled refresh never mutates prior rows or cursor", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => page([task("preserved")], "old-next") });
  const original = structuredClone(previous);
  await assert.rejects(readActivityWindow({ previous, refreshPages: 2, fetchPage: async cursor => { if (cursor) throw Error("READ_FAILED"); return page([task("new")], "other"); } }), /READ_FAILED/);
  await assert.rejects(readActivityWindow({ previous, append: true, fetchPage: async () => { throw new DOMException("Replaced", "AbortError"); } }), /Replaced/);
  assert.deepEqual(previous, original);
});
test("a reviewed task replaces its ordinary row and a corrected task replaces its review", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => page([task("a")], "next") });
  const reviewed = await readActivityWindow({ previous, append: true, fetchPage: async () => ({ ...page([], "more"), reviewItems: [{ recordId: "a", leadId: "customer", title: "a", issue: "invalid_status", revision: "2:1" }] }) });
  assert.equal(reviewed.items.length, 0); assert.equal(reviewed.reviewItems.length, 1);
  const fixed = await readActivityWindow({ previous: reviewed, append: true, fetchPage: async () => page([task("a", "3:1")]) });
  assert.equal(fixed.reviewItems.length, 0); assert.equal(fixed.items[0].revision, "3:1");
});
test("a policy change, contract switch or repeating cursor cannot silently merge incompatible pages", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => page([task("a")], "next") });
  await assert.rejects(readActivityWindow({ previous, append: true, fetchPage: async () => ({ contractVersion: 1, items: [] }) }), /consulta mudou/);
  await assert.rejects(readActivityWindow({ previous, append: true, fetchPage: async () => page([], "next") }), /não avançou/);
  const locked = await readActivityWindow({ previous, append: true, fetchPage: async () => ({ ...page([task("b")]), canEdit: false }) });
  assert.equal(locked.canEdit, false); assert.equal(previous.canEdit, true);
});
test("invalid payloads cannot replace the list with a false empty result", async () => {
  await assert.rejects(readActivityWindow({ fetchPage: async () => ({ contractVersion: 2 }) }), /conferir/);
  await assert.rejects(readActivityWindow({ refreshPages: NaN, fetchPage: async () => page([]) }), /consulta/);
  await assert.rejects(readActivityWindow({ fetchPage: async () => ({ ...page([]), contractVersion: 3 }) }), /consulta mudou/);
});
test("a customer's opportunity title remains part of the selected option", () => {
  assert.equal(activityLeadLabel({ id: "a", nome: "Marina", opportunityTitle: "Segunda compra" }), "Marina · Segunda compra");
});
test("legacy assignment aliases keep a seller's returns associated with their current responsible user", () => {
  for (const field of ["assignedUserId", "responsavelId"]) {
    assert.equal(normalizeCommercialActivity("task", "legacy", { [field]: "task-seller" }, { ownerId: "lead-seller" }).ownerUserId, "task-seller");
    assert.equal(normalizeCommercialActivity("task", "legacy", {}, { [field]: "lead-seller" }).ownerUserId, "lead-seller");
  }
});
test("a confirmed mutation updates or removes only its requested row and preserves the window continuation", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => ({ ...page([task("a"), task("b")], "next"), queryScope: "scope" }) });
  const response = { queryScope: "scope", items: [], reviewItems: [], removedIds: ["a"], leads: [], canEdit: true };
  const result = applyConfirmedActivityRefresh(previous, ["a"], response);
  assert.deepEqual(result.items.map(row => row.recordId), ["b"]); assert.equal(previous.items.length, 2);
  assert.equal(result.nextCursor, "next"); assert.equal(result.pages, previous.pages);
  assert.throws(() => applyConfirmedActivityRefresh(previous, ["a"], { ...response, removedIds: [] }), /conferir todos/);
  assert.throws(() => applyConfirmedActivityRefresh(previous, ["a"], { ...response, removedIds: ["other"] }), /conferir todos/);
  assert.throws(() => applyConfirmedActivityRefresh(previous, ["a"], { ...response, queryScope: "other" }), /consulta/);
});
test("confirmed record merges preserve chronological ordering and the other loaded rows", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => ({ ...page([task("undated")], "next"), queryScope: "scope" }) });
  const dated = { ...task("dated"), dueAt: "2026-10-23T14:00:00Z" };
  const result = applyConfirmedActivityRefresh(previous, ["dated"], { queryScope: "scope", items: [dated], reviewItems: [], removedIds: [], leads: [], canEdit: true });
  assert.deepEqual(result.items.map(row => row.recordId), ["dated", "undated"]);
});
test("a newly saved return beyond the current prefix remains present after a fresh authorized read", async () => {
  const first = await readActivityWindow({ fetchPage: async () => ({ ...page([task("old")], "next"), queryScope: "scope" }) });
  const saved = { ...task("saved-later"), dueAt: "2026-12-01T12:00:00Z" };
  const previous = applyConfirmedActivityRefresh(first, [saved.recordId], { queryScope: "scope", items: [saved], reviewItems: [], removedIds: [], leads: [], canEdit: true });
  const prefix = await readActivityWindow({ fetchPage: async () => ({ ...page([task("old")], "fresh-next"), queryScope: "scope" }) });
  const merged = await reconcileConfirmedActivities(previous, prefix, async (ids, scope) => {
    assert.deepEqual(ids, ["saved-later"]); return { queryScope: scope, items: [{ ...saved, revision: "2:1" }], reviewItems: [], removedIds: [], leads: [], canEdit: true };
  });
  assert.equal(merged.items.find(row => row.recordId === "saved-later")?.revision, "2:1");
  assert.equal(merged.nextCursor, "fresh-next"); assert.equal(previous.items.find(row => row.recordId === "saved-later")?.revision, "1:1");
});
test("reconciling a confirmed record uses the new scope and removes lost access without keeping cached data", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => ({ ...page([task("saved")]), queryScope: "old-scope" }) });
  previous.confirmedIds = ["saved"];
  const next = await readActivityWindow({ fetchPage: async () => ({ ...page([]), queryScope: "current-scope" }) });
  const result = await reconcileConfirmedActivities(previous, next, async (ids, scope) => {
    assert.equal(scope, "current-scope"); return { queryScope: scope, items: [], reviewItems: [], removedIds: ids, leads: [], canEdit: false };
  });
  assert.equal(result.items.length, 0); assert.deepEqual(result.confirmedIds, []); assert.equal(result.canEdit, false);
});
test("confirmation recovery stays bounded in batches and a partial failure cannot mutate either window", async () => {
  const previous = await readActivityWindow({ fetchPage: async () => ({ ...page([]), queryScope: "scope" }) });
  previous.confirmedIds = Array.from({ length: 205 }, (_, index) => `saved_${index}`);
  const next = await readActivityWindow({ fetchPage: async () => ({ ...page([task("visible")]), queryScope: "scope" }) });
  const sizes: number[] = [];
  const result = await reconcileConfirmedActivities(previous, next, async (ids, scope) => {
    sizes.push(ids.length); return { queryScope: scope, items: [], reviewItems: [], removedIds: ids, leads: [], canEdit: true };
  });
  assert.deepEqual(sizes, [100,100,5]); assert.deepEqual(result.confirmedIds, []); assert.equal(previous.confirmedIds.length, 205);
  let calls = 0; const original = structuredClone(next);
  await assert.rejects(reconcileConfirmedActivities(previous, next, async (ids, scope) => {
    if (++calls === 2) throw Error("LATE_READ_FAILURE"); return { queryScope: scope, items: [], reviewItems: [], removedIds: ids, leads: [], canEdit: true };
  }), /LATE_READ_FAILURE/);
  assert.deepEqual(next, original); assert.equal(previous.confirmedIds.length, 205);
});
