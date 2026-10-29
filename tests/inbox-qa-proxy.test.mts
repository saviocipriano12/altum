import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createInboxQaProxy } from "../scripts/serve-inbox-qa-proxy.mjs";

const { WebSocket, WebSocketServer } = createRequire(import.meta.url)("next/dist/compiled/ws");
async function listen(server: http.Server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return address.port;
}

test("HTTP and HMR WebSocket use the same upstream host and preserve payloads", async (t) => {
  const received: { protocol: string; host?: string }[] = [];
  const upstream = http.createServer((req, res) => {
    received.push({ protocol: "http", host: req.headers.host }); res.end("qa-ok");
  });
  const wss = new WebSocketServer({ server: upstream });
  wss.on("connection", (ws: any, req: http.IncomingMessage) => {
    received.push({ protocol: "websocket", host: req.headers.host });
    ws.on("message", (body: Buffer) => ws.send(body));
  });
  const upstreamPort = await listen(upstream);
  const proxy = createInboxQaProxy(upstreamPort);
  const port = await listen(proxy.server);
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); upstream.closeAllConnections(); upstream.close(); proxy.server.closeAllConnections(); proxy.server.close(); });
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/qa`)).text(), "qa-ok");
  const ws = new WebSocket(`ws://127.0.0.1:${port}/_next/hmr?id=qa-only`);
  t.after(() => ws.terminate());
  await once(ws, "open");
  const echoed = once(ws, "message"); ws.send("qa-ping");
  assert.equal(String((await echoed)[0]), "qa-ping");
  assert.deepEqual(received, [
    { protocol: "http", host: `127.0.0.1:${upstreamPort}` },
    { protocol: "websocket", host: `127.0.0.1:${upstreamPort}` },
  ]);
});

test("outage is tenant-scoped, records method/path without query, and restores HTTP", async (t) => {
  let forwarded = 0;
  const upstream = http.createServer((_req, res) => { forwarded++; res.end("qa-ok"); });
  const proxy = createInboxQaProxy(await listen(upstream));
  const port = await listen(proxy.server);
  t.after(() => { upstream.closeAllConnections(); upstream.close(); proxy.server.closeAllConnections(); proxy.server.close(); });
  proxy.command("outage");
  await assert.rejects(fetch(`http://127.0.0.1:${port}/api/tenant/qa-altum-alpha/chats/qa/send-media?private=not-recorded`, { method: "POST" }));
  assert.equal(forwarded, 0);
  assert.deepEqual(proxy.status().interruptedRequests, { "POST /api/tenant/qa-altum-alpha/chats/qa/send-media": 1 });
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/client-portal/me`)).status, 200);
  proxy.command("restore");
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/tenant/qa-altum-alpha/chats`)).status, 200);
  assert.equal(forwarded, 2);
});
