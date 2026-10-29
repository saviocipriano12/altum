import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function inspectConfig(qa: boolean, production: boolean, projectId = "demo-altum-qa-lab", trace = false) {
  return spawnSync(process.execPath, ["--import", "tsx", "-e", `(async()=>{
    const m=await import('./next.config.ts'); const c=m.default.default||m.default;
    const headers=await c.headers(); const all=headers.find(x=>x.source==='/(.*)');
    console.log(JSON.stringify({distDir:c.distDir||null,tsconfig:c.typescript.tsconfigPath,
      csp:all.headers.find(x=>x.key==='Content-Security-Policy').value,
      watchPlugin:c.webpack?(c.webpack({plugins:[]}).plugins[0]?.constructor.name||null):null}));
  })().catch(e=>{console.error(e.message);process.exitCode=1})`], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, ALTUM_QA_EMULATORS: qa ? "1" : "", NODE_ENV: production ? "production" : "development",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, ALTUM_QA_TRACE_WATCH: trace ? "1" : "0" },
  });
}
test("production keeps normal cache/types and never allows emulator connections", () => {
  const result = inspectConfig(false, true, "real-project");
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.distDir, null);
  assert.equal(config.tsconfig, "tsconfig.release.json");
  assert.doesNotMatch(config.csp, /127\.0\.0\.1|localhost|9099|9199/);
  assert.equal(config.watchPlugin, null);
});
test("isolated development has its own cache, type configuration and loopback-only emulator CSP", () => {
  const result = inspectConfig(true, false);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.distDir, ".qa-artifacts/next-inbox");
  assert.equal(config.tsconfig, "tsconfig.inbox-qa.json");
  assert.equal(config.watchPlugin, null);
  for (const port of [8080, 9099, 9199]) assert.ok(config.csp.includes(`http://127.0.0.1:${port}`));
});

test("watch tracing requires both isolated QA and explicit opt-in, never production", () => {
  const enabled = inspectConfig(true, false, "demo-altum-qa-lab", true);
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(JSON.parse(enabled.stdout).watchPlugin, "InboxQaWatchPlugin");
  const production = inspectConfig(false, true, "real-project", true);
  assert.equal(production.status, 0, production.stderr);
  assert.equal(JSON.parse(production.stdout).watchPlugin, null);
});
test("QA cannot start in production or against a real project", () => {
  for (const result of [inspectConfig(true, true), inspectConfig(true, false, "real-project")]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /QA server requires/);
  }
});
