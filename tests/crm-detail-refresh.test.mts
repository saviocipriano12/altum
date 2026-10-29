import assert from "node:assert/strict";
import test from "node:test";
import { CrmDetailRequests, crmDetailScope, reconcileCrmStageDraft } from "../lib/crm-detail-refresh.ts";

test("background refresh cannot cancel the initial file request", () => {
  const requests = new CrmDetailRequests(), scope = crmDetailScope("tenant", "seller", "one");
  const initial = requests.begin(scope)!;
  assert.equal(requests.begin(scope, true), null);
  assert.equal(initial.controller.signal.aborted, false);
  assert.equal(requests.accepts(initial, scope), true);
});

test("switching client aborts the old fetch even if that transport later resolves", async () => {
  const requests = new CrmDetailRequests(), one = crmDetailScope("tenant", "seller", "one"), two = crmDetailScope("tenant", "seller", "two");
  const first = requests.begin(one)!;
  let release!: (row: { name: string }) => void;
  const delayed = new Promise<{ name: string }>(resolve => { release = resolve; });
  let visible = "second client";
  const oldRead = delayed.then(row => { if (requests.accepts(first, two)) visible = row.name; });
  const second = requests.begin(two)!;
  release({ name: "first client" });
  await oldRead;
  requests.finish(first);
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(visible, "second client");
  assert.equal(requests.accepts(second, two), true);
});

test("the refresh after a seller saves takes precedence over an older background response", () => {
  const requests = new CrmDetailRequests(), scope = crmDetailScope("tenant", "seller", "one");
  const background = requests.begin(scope, true)!;
  const afterSave = requests.begin(scope)!;
  requests.finish(background);
  assert.equal(background.controller.signal.aborted, true);
  assert.equal(requests.accepts(background, scope), false);
  assert.equal(requests.accepts(afterSave, scope), true);
  assert.equal(requests.begin(scope, true), null);
});

test("changing company or signed-in seller rejects a response for the same client id", () => {
  const requests = new CrmDetailRequests(), original = crmDetailScope("one", "alice", "client");
  const ticket = requests.begin(original)!;
  assert.equal(requests.accepts(ticket, crmDetailScope("two", "alice", "client")), false);
  assert.equal(requests.accepts(ticket, crmDetailScope("one", "bob", "client")), false);
});

test("returning to the first client does not accept its older response", () => {
  const requests = new CrmDetailRequests(), scope = crmDetailScope("tenant", "seller", "one");
  const first = requests.begin(scope)!;
  requests.begin(crmDetailScope("tenant", "seller", "two"));
  const returned = requests.begin(scope)!;
  requests.finish(first);
  assert.equal(requests.accepts(first, scope), false);
  assert.equal(requests.accepts(returned, scope), true);
});

test("timeout or leaving the screen allows recovery and rejects the canceled result", () => {
  const requests = new CrmDetailRequests(), scope = crmDetailScope("tenant", "seller", "one");
  const first = requests.begin(scope)!;
  requests.cancelScope(scope);
  const retry = requests.begin(scope, true)!;
  requests.finish(first);
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(requests.accepts(first, scope), false);
  assert.equal(requests.accepts(retry, scope), true);
  requests.cancelScope("an older screen");
  assert.equal(requests.accepts(retry, scope), true);
});

test("new facts preserve a seller's unsaved stage while a different client starts its own stage", () => {
  assert.equal(reconcileCrmStageDraft("proposta", { id: "one", stage: "contato" }, { id: "one", stage: "diagnostico" }), "proposta");
  assert.equal(reconcileCrmStageDraft("contato", { id: "one", stage: "contato" }, { id: "one", stage: "diagnostico" }), "diagnostico");
  assert.equal(reconcileCrmStageDraft("proposta", { id: "one", stage: "contato" }, { id: "two", stage: "captado" }), "captado");
});
