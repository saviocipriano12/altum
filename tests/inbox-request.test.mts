import test from "node:test";
import assert from "node:assert/strict";
import { fetchInboxJson, InboxRequestTimeoutError } from "../lib/inbox-request.ts";

test("a stalled token/fetch is bounded and its signal is aborted", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(fetchInboxJson((value) => { signal = value; return new Promise(() => {}); }, 10), InboxRequestTimeoutError);
  assert.equal(signal?.aborted, true);
});
test("a stalled response body is bounded too", async () => {
  const response = new Response(new ReadableStream({ start() { /* no body arrives */ } }));
  await assert.rejects(fetchInboxJson(async () => response, 10), InboxRequestTimeoutError);
});
test("HTTP failures retain their actual status and actionable JSON", async () => {
  const result = await fetchInboxJson<{ error: string }>(async () => Response.json({ error: "Sem acesso" }, { status: 403 }));
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error, "Sem acesso");
});
test("an earlier timeout does not prevent the next request succeeding", async () => {
  await assert.rejects(fetchInboxJson(() => new Promise(() => {}), 10));
  const result = await fetchInboxJson<{ items: string[] }>(async () => Response.json({ items: ["recuperado"] }));
  assert.deepEqual(result.payload.items, ["recuperado"]);
});
test("invalid JSON fails rather than being mistaken for delivery confirmation", async () => {
  await assert.rejects(fetchInboxJson(async () => new Response("invalid-json")), SyntaxError);
});
