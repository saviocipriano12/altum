import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const bridge = join(root, "resources", "openclaw", "altum-mission-bridge");

test("o bridge OpenClaw versiona o contrato e nunca vira parte do bundle Next", () => {
  const entry = join(bridge, "index.ts.template");
  const manifest = join(bridge, "openclaw.plugin.json");
  assert.equal(existsSync(entry), true);
  assert.equal(existsSync(manifest), true);
  const source = readFileSync(entry, "utf8");
  const plugin = JSON.parse(readFileSync(manifest, "utf8")) as { categories?: string[] };
  assert.equal(source.includes('path: "/altum/v1/missions"'), true);
  assert.match(source, /auth: "plugin"/);
  assert.match(source, /externalActionsRequireApproval/);
  assert.match(source, /runEmbeddedAgent/);
  assert.match(source, /abortSignal: controller\.signal/);
  assert.match(source, /activeRuns/);
  assert.match(source, /processedDispatches/);
  assert.match(source, /claimDurableDispatch/);
  assert.match(source, /OPENCLAW_STATE_DIR/);
  assert.match(source, /duplicate: true/);
  assert.deepEqual(plugin.categories, ["agent-orchestration", "infrastructure"]);
  assert.equal(existsSync(join(bridge, "index.ts")), false);
});

test("bootstrap do runtime mantém o gateway privado e o fork reproduzível", () => {
  const compose = readFileSync(join(root, "docker-compose.openclaw-runtime.yml"), "utf8");
  const installer = readFileSync(join(root, "scripts", "install-altum-openclaw-bridge.mjs"), "utf8");
  const runtimeConfig = readFileSync(join(root, "resources", "openclaw", "runtime", "openclaw.json.example"), "utf8");
  const runtimePatch = readFileSync(join(root, "resources", "openclaw", "runtime-patch", "Dockerfile"), "utf8");
  assert.match(compose, /127\.0\.0\.1:\$\{ALTUM_OPENCLAW_PORT/);
  assert.match(compose, /context: \.\/resources\/openclaw\s/);
  assert.match(compose, /dockerfile: runtime-patch\/Dockerfile/);
  assert.match(compose, /OPENCLAW_STATE_DIR: \/home\/node\/\.openclaw/);
  assert.match(compose, /\.\/\.altum-openclaw:\/home\/node\/\.openclaw/);
  assert.match(compose, /image: altum-openclaw:runtime/);
  assert.match(compose, /env_file:/);
  assert.doesNotMatch(compose, /ALTUM_OPENCLAW_MODEL_ID:\s*\$\{/);
  assert.match(runtimePatch, /FROM altum-openclaw:local/);
  assert.match(runtimePatch, /altum-mission-bridge/);
  assert.match(installer, /ensureBridgeLockfile/);
  assert.match(installer, /extensions\/altum-mission-bridge/);
  assert.match(runtimeConfig, /"controlUi": \{ "enabled": false \}/);
  assert.match(runtimeConfig, /"allow": \["altum-mission-bridge"\]/);
  assert.match(runtimeConfig, /"deny": \["codex"\]/);
  assert.match(runtimeConfig, /"id": "ALTUM_OPENCLAW_GATEWAY_TOKEN"/);
  assert.match(runtimeConfig, /"id": "ALTUM_OPENCLAW_SHARED_SECRET"/);
});
