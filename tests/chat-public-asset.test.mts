import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http, { type ClientRequest, type IncomingMessage } from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { downloadPublicChatAsset, isPublicChatAssetAddress, parsePublicChatAssetUrl } from "../lib/server/chat-public-asset.ts";
let addresses = [{ address: "93.184.216.34", family: 4 }];
let replies: Array<{ status?: number; headers?: Record<string, string>; body?: string }> = [];
const requests: Array<{ url: string; pinned: string }> = [];
mock.method(dns, "lookup", (async () => addresses) as unknown as typeof dns.lookup);
const request = ((url: URL, options: https.RequestOptions, callback: (response: IncomingMessage) => void) => {
  const reply = replies.shift(); assert.ok(reply, "Unexpected native network request must fail closed");
  assert.equal(options.agent, false); assert.equal(options.headers && (options.headers as Record<string, string>).authorization, undefined);
  const fake = new EventEmitter() as ClientRequest;
  fake.end = (() => {
    options.lookup!(url.hostname, { all: false }, (error, pinned) => { assert.equal(error, null); requests.push({ url: url.href, pinned: String(pinned) }); });
    queueMicrotask(() => {
      const response = Object.assign(new PassThrough(), { statusCode: reply.status || 200, headers: reply.headers || { "content-type": "image/png" } });
      callback(response as unknown as IncomingMessage);
      if (!response.destroyed) response.end(reply.body ?? "qa-content");
    });
    return fake;
  }) as typeof fake.end;
  return fake;
}) as typeof https.request;
mock.method(https, "request", request); mock.method(http, "request", request);
after(() => mock.restoreAll());
test("unsafe protocols, credentials, ports and private literal addresses are rejected without network", () => {
  const before = requests.length;
  for (const url of ["file:///secret", "ftp://example.test/file", "http://localhost/file", "http://127.1/file", "http://169.254.169.254/metadata", "https://user:secret@example.test/file", "https://example.test:8443/file", "http://[::1]/file", "http://[::ffff:127.0.0.1]/file"]) assert.throws(() => parsePublicChatAssetUrl(url), Error, url);
  assert.equal(requests.length, before);
  for (const ip of ["10.0.0.1", "100.64.0.1", "192.168.0.1", "198.18.0.1", "224.0.0.1", "240.0.0.1", "fd00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::"]) assert.equal(isPublicChatAssetAddress(ip), false, ip);
});
test("mixed public/private DNS results are blocked before connecting", async () => {
  const before = requests.length; addresses = [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }];
  await assert.rejects(downloadPublicChatAsset("https://asset.qa.invalid/file", 100), /interno/);
  assert.equal(requests.length, before); addresses = [{ address: "93.184.216.34", family: 4 }];
});
test("public downloads pin the validated IP and preserve paths/query across validated redirects", async () => {
  const before = requests.length;
  replies = [{ status: 302, headers: { location: "https://cdn.qa.invalid/material?token=qa" } }, { headers: { "content-type": "image/png" }, body: "qa-png" }];
  const result = await downloadPublicChatAsset("https://asset.qa.invalid/start", 100);
  assert.equal(result.buffer.toString(), "qa-png"); assert.equal(result.contentType, "image/png");
  assert.deepEqual(requests.slice(before).map(row => row.pinned), ["93.184.216.34", "93.184.216.34"]);
  assert.equal(requests.at(-1)?.url, "https://cdn.qa.invalid/material?token=qa");
});
test("redirects cannot reach metadata/internal networks or downgrade HTTPS", async () => {
  for (const target of ["http://169.254.169.254/metadata", "http://public.qa.invalid/file"]) {
    replies = [{ status: 302, headers: { location: target } }]; const before = requests.length;
    await assert.rejects(downloadPublicChatAsset("https://asset.qa.invalid/file", 100));
    assert.equal(requests.length, before + 1);
  }
});
test("declared and streamed size limits and redirect count are enforced", async () => {
  replies = [{ headers: { "content-length": "1000" }, body: "small" }]; await assert.rejects(downloadPublicChatAsset("https://asset.qa.invalid/file", 3), /limite/);
  replies = [{ body: "large" }]; await assert.rejects(downloadPublicChatAsset("https://asset.qa.invalid/file", 3), /limite/);
  replies = Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/again" } }));
  await assert.rejects(downloadPublicChatAsset("https://asset.qa.invalid/file", 100), /redirecionamentos/);
});
