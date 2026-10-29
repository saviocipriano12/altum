import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { InboxDraftStore, inboxDraftKey } from "../lib/inbox-drafts.ts";
import { InboxLoadGate } from "../lib/inbox-load-gate.ts";
import { fetchInboxJson } from "../lib/inbox-request.ts";

// Real loopback HTTP; the server is a controlled failure fixture, not the
// production send handler or proof of delivery by a messaging provider.
test("lost HTTP acknowledgement retains the draft and explicit retry reuses its identity", async (t) => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const accepted = new Set<string>();
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { requestId } = JSON.parse(body);
    accepted.add(requestId);
    requests++;
    if (requests === 1) { res.destroy(); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ accepted: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/send`;
  const key = inboxDraftKey("qa-tenant", "qa-user", "qa-chat");
  let store = new InboxDraftStore(storage);
  store.setText(key, "Proposta pronta");
  const first = store.beginAttempt(key, "Proposta pronta", "original-reply", () => "attempt-one");
  const send = (id: string) => fetchInboxJson<{ accepted: boolean }>((signal) => fetch(url, {
    method: "POST", signal, body: JSON.stringify({ requestId: id }),
  }), 2000);
  await assert.rejects(send(first.attempt.id));
  assert.equal(store.read(key).text, "Proposta pronta");
  assert.equal(requests, 1, "a failed request must not trigger an automatic resend");
  store = new InboxDraftStore(storage);
  const retry = store.beginAttempt(key, "Proposta pronta", null, () => "must-not-be-created");
  assert.deepEqual(retry.attempt, first.attempt);
  const result = await send(retry.attempt.id);
  assert.equal(result.payload.accepted, true);
  store.acknowledge(key, retry.attempt.id);
  assert.equal(store.read(key).text, "");
  assert.equal(requests, 2);
  assert.equal(accepted.size, 1, "the fixture sees the same idempotency identity");
});

test("HTTP interruption releases the load gate so a restored connection can load again", async (t) => {
  let unavailable = true;
  const server = http.createServer((_req, res) => {
    if (unavailable) { res.destroy(); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ items: ["preserved-message"] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/messages`;
  const gate = new InboxLoadGate();
  async function load() {
    const token = gate.begin("qa-tenant", "qa-chat");
    assert.notEqual(token, null);
    try { return await fetchInboxJson<{ items: string[] }>((signal) => fetch(url, { signal }), 2000); }
    finally { gate.finish(token!); }
  }
  await assert.rejects(load());
  unavailable = false;
  assert.deepEqual((await load()).payload.items, ["preserved-message"]);
});
