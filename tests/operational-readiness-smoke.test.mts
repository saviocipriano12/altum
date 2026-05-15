import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

function routePathToFile(routePath: string) {
  return join(process.cwd(), "app", routePath.slice(1), "route.ts");
}

test("vercel cron jobs point to real internal route handlers", () => {
  const vercel = readJson<{ crons?: Array<{ path?: string; schedule?: string }> }>("vercel.json");
  const cronPaths = (vercel.crons || []).map((item) => String(item.path || "").split("?")[0]);
  const expected = [
    "/api/internal/jobs/ai/process",
    "/api/internal/jobs/automations/process",
    "/api/internal/jobs/campaigns/sync",
    "/api/internal/jobs/client-portal/push-critical",
    "/api/internal/jobs/finance/contract-billing",
  ];

  assert.deepEqual(
    expected.filter((path) => !cronPaths.includes(path)),
    [],
    "Existem jobs criticos esperados ausentes no vercel.json."
  );

  assert.deepEqual(
    expected.filter((path) => !existsSync(routePathToFile(path))),
    [],
    "Existem jobs criticos configurados sem route handler."
  );
});

test("package.json exposes critical validation and onboarding commands", () => {
  const pkg = readJson<{ scripts?: Record<string, string> }>("package.json");
  const scripts = pkg.scripts || {};

  assert.equal(typeof scripts["test:smoke"], "string");
  assert.equal(typeof scripts["test:agent-closure"], "string");
  assert.equal(typeof scripts["verify:postdeploy"], "string");
  assert.equal(typeof scripts["cliente:onboarding:new"], "string");
});

test("operational docs and scripts referenced by the platform exist", () => {
  const requiredFiles = [
    "docs/CLIENTE_FECHADO_CHECKLIST_OFICIAL.md",
    "docs/CLIENTE_FECHADO_FICHA_OPERACIONAL_TEMPLATE.md",
    "docs/go-live-definitivo-checklist.md",
    "docs/go-live-runbook.md",
    "docs/go-live-incident-playbook.md",
    "docs/POST_DEPLOY_CHECKLIST.md",
    "docs/LGPD_OPERACAO_E_GOVERNANCA.md",
    "docs/INTEGRATIONS_OAUTH_MANAGED.md",
    "docs/AGENT_CLOSURE_MODE.md",
    "scripts/new-client-onboarding.mjs",
    "scripts/post-deploy-verify.mjs",
    "scripts/run-agent-closure-gate.mjs",
  ];

  assert.deepEqual(
    requiredFiles.filter((file) => !existsSync(join(process.cwd(), file))),
    [],
    "Arquivos operacionais obrigatorios estao faltando."
  );
});

test("README documents platform-specific setup and release gates", () => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

  assert.match(readme, /ALTUM/);
  assert.match(readme, /test:smoke/);
  assert.match(readme, /test:agent-closure/);
  assert.match(readme, /verify:postdeploy/);
  assert.match(readme, /cliente:onboarding:new/);
  assert.match(readme, /\/cliente\/painel\/go-live/);
  assert.match(readme, /AI_JOBS_PROCESS_TOKEN/);
});
