import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
const source = readFileSync("resources/openclaw/altum-mission-bridge/index.ts.template", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const operation of ["pause", "cancel"] as const) {
  test(`busy bridge receives ${operation} without starting another business run`, async () => {
    const events: Record<string, unknown>[] = [];
    const urls: string[] = [];
    let signal: AbortSignal | undefined;
    let runCount = 0;
    let scheduled: (() => Promise<void>) | undefined;
    let service: { start: (input: unknown) => void } | undefined;
    const mission = { id: "mission-test", tenantId: "tenant-test", conversationId: null, title: "Pilot", objective: "Text only", template: "custom", risk: "low", budgetBrl: 0, constraints: [] };
    const envelope = (dispatchId: string, op: string) => ({
      protocol: "altum.openclaw.mission.v1", dispatchId, operation: op, mission,
      task: null,
      policy: { externalActionsRequireApproval: true, secretHandling: "altum_vault_only", artifactDelivery: "altum_private_library" },
      callback: { url: "https://fixture.test/events", signatureHeader: "x-altum-runtime-signature", timestampHeader: "x-altum-runtime-timestamp" },
    });
    const queue = [envelope("dispatch-execute", "execute"), envelope("dispatch-control", operation)];
    const exports: { default?: { register: (api: unknown) => void } } = {};
    vm.runInNewContext(compiled, {
      exports,
      require: (name: string) => {
        if (name === "openclaw/plugin-sdk/plugin-entry") return { definePluginEntry: (entry: unknown) => entry };
        if (name === "openclaw/plugin-sdk/webhook-request-guards") return { WEBHOOK_BODY_READ_DEFAULTS: { postAuthResponseFirst: {} } };
        if (name === "node:fs") return { mkdirSync() {}, writeFileSync() {} };
        return realRequire(name);
      },
      process: { env: { ALTUM_OPENCLAW_SHARED_SECRET: "s".repeat(32), ALTUM_PUBLIC_URL: "https://fixture.test", OPENCLAW_STATE_DIR: "/fixture" } },
      AbortController, AbortSignal, Buffer,
      fetch: async (url: string, options?: { body?: string }) => {
        urls.push(url);
        if (url.includes("missions/next")) return { status: 200, ok: true, json: async () => ({ mission: queue.shift() }) };
        events.push(JSON.parse(options?.body || "{}"));
        return { ok: true };
      },
    });
    exports.default!.register({
      logger: { warn: (message: string) => { throw new Error(message); } },
      runtime: {
        config: { current: () => ({}) },
        agent: {
          ensureAgentWorkspace: async () => {},
          resolveAgentWorkspaceDir: () => "/fixture/workspace",
          resolveAgentTimeoutMs: () => 1000,
          runEmbeddedAgent: (input: { abortSignal: AbortSignal }) => {
            runCount++;
            signal = input.abortSignal;
            return new Promise((_resolve, reject) => {
              signal!.addEventListener("abort", () => reject(new Error("wrapped abort")), { once: true });
            });
          },
        },
      },
      registerService: (entry: typeof service) => { service = entry; },
      registerHttpRoute() {},
    });
    service!.start({ scheduler: { signal: new AbortController().signal, schedule: (entry: { run: () => Promise<void> }) => { scheduled = entry.run; } } });
    const settle = async () => { for (let i = 0; i < 6; i++) await new Promise<void>((done) => setImmediate(done)); };
    await scheduled!();
    await settle();
    assert.equal(runCount, 1);
    await scheduled!();
    await settle();
    assert.match(urls[2], /controlOnly=1/);
    assert.equal(signal!.aborted, true);
    assert.equal(runCount, 1);
    assert.equal(events.some((event) => event.type === "mission.failed"), false);
    assert.equal(events.at(-1)?.type, operation === "pause" ? "mission.completed" : "mission.cancelled");
    assert.equal(events.at(-1)?.dispatchId, "dispatch-control");
  });
}
