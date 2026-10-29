import test from "node:test";
import assert from "node:assert/strict";
import { getCampaignDispatchAttempt, acknowledgeCampaignDispatch } from "../lib/campaign-dispatch-attempt.ts";
const scope = ["tenant-qa", "user-qa", "campaign-qa"];
function storage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) || null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
}
test("lost response and page reload retain the same request until a matching acknowledgement", () => {
  const saved = storage(); let generated = 0;
  const id = () => `request-${++generated}-fixture`;
  const first = getCampaignDispatchAttempt(saved, scope, null, id);
  assert.deepEqual(getCampaignDispatchAttempt(saved, scope, null, id), first);
  acknowledgeCampaignDispatch(saved, scope, "other-request");
  assert.deepEqual(getCampaignDispatchAttempt(saved, scope, null, id), first);
  acknowledgeCampaignDispatch(saved, scope, first.id);
  assert.notEqual(getCampaignDispatchAttempt(saved, scope, null, id).id, first.id);
});
test("an unconfirmed request cannot silently switch schedule or user/tenant scope", () => {
  const saved = storage(), first = getCampaignDispatchAttempt(saved, scope, null, () => "request-1-fixture");
  assert.throws(() => getCampaignDispatchAttempt(saved, scope, "2026-10-20T12:00:00Z", () => "request-2-fixture"), /sem confirmacao/);
  assert.notEqual(getCampaignDispatchAttempt(saved, ["other-tenant", scope[1], scope[2]], null, () => "request-2-fixture").id, first.id);
  assert.notEqual(getCampaignDispatchAttempt(saved, [scope[0], "other-user", scope[2]], null, () => "request-3-fixture").id, first.id);
});
test("storage unavailable fails before an untrackable POST can be made", () => {
  const saved = storage(); saved.setItem = () => { throw new Error("storage unavailable"); };
  assert.throws(() => getCampaignDispatchAttempt(saved, scope, null, () => "request-1-fixture"), /identificacao/);
});
test("failure clearing an acknowledged key does not create a replacement request", () => {
  const saved = storage(), first = getCampaignDispatchAttempt(saved, scope, null, () => "request-1-fixture");
  saved.removeItem = () => { throw new Error("storage denied"); };
  assert.equal(acknowledgeCampaignDispatch(saved, scope, first.id), false);
  assert.deepEqual(getCampaignDispatchAttempt(saved, scope, null, () => "request-2-fixture"), first);
});
