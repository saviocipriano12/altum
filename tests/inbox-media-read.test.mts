import test from "node:test";
import assert from "node:assert/strict";
import { readInboxMedia } from "../lib/inbox-media-read.ts";

test("private media reads exact bytes for every attachment without URL resolution", async () => {
  for (const mime of ["image/png", "audio/mpeg", "video/mp4", "application/pdf"]) {
    const bytes = new Uint8Array([1, 2, 3, 4]); let calls = 0;
    const blob = await readInboxMedia(async () => { calls++; return new Response(bytes, { headers: { "content-type": mime } }); }, new AbortController().signal);
    assert.equal(blob.type, mime); assert.equal(calls, 1);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  }
});
test("errors and empty/HTML/JSON responses never masquerade as playable media or automatically repeat requests", async () => {
  for (const response of [new Response(null, { status: 403 }), new Response(""), Response.json({ error: "auth" }), new Response("login", { headers: { "content-type": "text/html" } })]) {
    let calls = 0;
    await assert.rejects(readInboxMedia(async () => { calls++; return response; }, new AbortController().signal));
    assert.equal(calls, 1);
  }
});
test("unmount cancels an in-flight media download", async () => {
  const controller = new AbortController();
  const pending = readInboxMedia((signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")))), controller.signal);
  controller.abort(); await assert.rejects(pending, /cancelled/);
});
test("an unresponsive media request times out instead of leaving a permanent loading bubble", async () => {
  await assert.rejects(readInboxMedia((signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")))), new AbortController().signal, 15), /timeout/);
});
