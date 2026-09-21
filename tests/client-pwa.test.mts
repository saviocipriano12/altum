import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker(options: { offline?: boolean; missingFallback?: boolean } = {}) {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  let fetches = 0, preloadEnabled = false;
  const offlineResponse = new Response("offline-screen");
  runInNewContext(workerSource, {
    URL, Request, Response,
    self: { location: { origin: "https://altum.test" }, addEventListener: (name: string, fn: any) => handlers[name] = fn,
      skipWaiting() {}, clients: { async claim() {} }, registration: { navigationPreload: { async enable() { preloadEnabled = true; } } } },
    caches: { async keys() { return ["static-altum-client-v4", "static-altum-client-v5", "other-product-cache"]; },
      async delete(key: string) { deleted.push(key); }, async open() { return { async match() { return options.missingFallback ? undefined : offlineResponse; } }; } },
    async fetch() { fetches++; if (options.offline) throw new Error("offline"); return new Response("live-page"); },
  });
  return { handlers, deleted, get fetches() { return fetches; }, get preloadEnabled() { return preloadEnabled; } };
}
async function navigate(instance: ReturnType<typeof worker>, path: string, preload?: Response) {
  let result: Promise<Response> | undefined;
  instance.handlers.fetch({ request: { method: "GET", mode: "navigate", url: `https://altum.test${path}` }, preloadResponse: Promise.resolve(preload), respondWith(value: Promise<Response>) { result = value; } });
  return result ? await result : undefined;
}

test("worker update deletes only Altum client caches and enables navigation preload", async () => {
  const instance = worker(); let activation: Promise<void> | undefined;
  instance.handlers.activate({ waitUntil(value: Promise<void>) { activation = value; } }); await activation;
  assert.deepEqual(instance.deleted, ["static-altum-client-v4"]); assert.equal(instance.preloadEnabled, true);
});
test("worker bypasses API, Next assets and unrelated page navigation", async () => {
  const instance = worker();
  for (const path of ["/api/client-portal/me", "/_next/static/client.js", "/admin", "/precos", "/cliente-outro"]) assert.equal(await navigate(instance, path), undefined);
  assert.equal(instance.fetches, 0);
});
test("preloaded navigation avoids a duplicate request", async () => {
  const instance = worker(); const response = await navigate(instance, "/cliente/painel", new Response("preloaded-page"));
  assert.equal(await response?.text(), "preloaded-page"); assert.equal(instance.fetches, 0);
});
test("offline navigation displays the fallback instead of a blank page", async () => {
  const instance = worker({ offline: true }); const response = await navigate(instance, "/cliente/painel/inbox");
  assert.equal(await response?.text(), "offline-screen");
});
test("missing offline cache still returns a readable response", async () => {
  const instance = worker({ offline: true, missingFallback: true }); const response = await navigate(instance, "/cliente/painel");
  assert.equal(response?.status, 503); assert.match(await response!.text(), /Sem conexão/);
});
test("successful navigation remains live and is never cached as customer HTML", async () => {
  const instance = worker(); const response = await navigate(instance, "/cliente/painel");
  assert.equal(await response?.text(), "live-page"); assert.equal(instance.fetches, 1);
});
