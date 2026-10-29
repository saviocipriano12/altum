import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getProposalCreateAttempt, completeProposalCreateAttempt } from "../lib/proposal-create-attempt.ts";
function storage() {
  const values = new Map<string, string>();
  return { values, getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); }, removeItem(key: string) { values.delete(key); } };
}
test("lost response and a new page instance reuse the stored opaque intent", () => {
  const saved = storage();
  assert.equal(getProposalCreateAttempt(saved, "tenant-a", "seller-a", () => "qa-original-2026"), "qa-original-2026");
  // The page does not persist customer names, notes or the submitted payload.
  assert.deepEqual([...saved.values.values()], ["qa-original-2026"]);
  assert.equal(getProposalCreateAttempt(saved, "tenant-a", "seller-a", () => { throw new Error("Must not mint another intent after failure/reload"); }), "qa-original-2026");
});
test("tenant and seller scopes are independent and only a matching confirmed intent is released", () => {
  const saved = storage();
  getProposalCreateAttempt(saved, "tenant-a", "seller-a", () => "qa-first-2026");
  assert.equal(getProposalCreateAttempt(saved, "tenant-b", "seller-a", () => "qa-other-tenant-2026"), "qa-other-tenant-2026");
  assert.equal(getProposalCreateAttempt(saved, "tenant-a", "seller-b", () => "qa-other-seller-2026"), "qa-other-seller-2026");
  completeProposalCreateAttempt(saved, "tenant-a", "seller-a", "qa-stale-2026");
  assert.equal(getProposalCreateAttempt(saved, "tenant-a", "seller-a"), "qa-first-2026");
  completeProposalCreateAttempt(saved, "tenant-a", "seller-a", "qa-first-2026");
  assert.equal(getProposalCreateAttempt(saved, "tenant-a", "seller-a", () => "qa-next-2026"), "qa-next-2026");
});
test("corrupt or unavailable storage cannot silently produce a fresh unprotected request", () => {
  const saved = storage(); getProposalCreateAttempt(saved, "tenant-a", "seller-a", () => "qa-first-2026");
  saved.values.set([...saved.values.keys()][0], "invalid");
  assert.throws(() => getProposalCreateAttempt(saved, "tenant-a", "seller-a"), /revisao/);
  assert.throws(() => getProposalCreateAttempt({ ...saved, setItem() {} }, "tenant-b", "seller-a", () => "qa-new-2026"), /proteger/);
});
test("the existing form passes the stable intent, fences double submission and requires a protected receipt", async () => {
  const page = await readFile(new URL("../app/cliente/painel/comercial/page.tsx", import.meta.url), "utf8");
  const fn = page.slice(page.indexOf("async function createBudget("), page.indexOf("async function createFinance("));
  assert.match(fn, /budgetSubmission\.current\) return/); assert.match(fn, /budgetSubmission\.current = true/);
  assert.match(fn, /getProposalCreateAttempt\(sessionStorage, tenant\.tenantId, tenant\.userId\)/);
  assert.match(fn, /"Idempotency-Key": requestId/); assert.match(fn, /payload\.retryProtected !== true/);
  const catchPart = fn.slice(fn.indexOf("} catch (err)")); assert.doesNotMatch(catchPart, /completeProposalCreateAttempt/);
  assert.match(fn, /CREATION_REQUEST_CONFLICT/); assert.match(fn, /setActiveTab\("proposals"\)/);
});
