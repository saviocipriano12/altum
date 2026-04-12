import { spawnSync } from "node:child_process";

const checks = [
  {
    label: "Smoke tests",
    command: ["node", "scripts/run-smoke-tests.mjs"],
  },
  {
    label: "Targeted lint (agent core)",
    command: [
      "npx",
      "eslint",
      "lib/server/ai/agent.ts",
      "lib/server/ai/router.ts",
      "lib/server/ai/usage-ledger.ts",
      "app/cliente/painel/inbox/page.tsx",
      "app/api/tenant/[tenantId]/ai-preview/route.ts",
    ],
  },
  {
    label: "TypeScript check",
    command: ["npx", "tsc", "--noEmit", "--incremental", "false"],
  },
];

function runCheck(check) {
  const [cmd, ...args] = check.command;
  process.stdout.write(`\n[agent-closure] ${check.label}...\n`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  return result.status === 0;
}

let ok = true;
for (const check of checks) {
  const passed = runCheck(check);
  if (!passed) {
    ok = false;
    process.stdout.write(`[agent-closure] FAILED: ${check.label}\n`);
    break;
  }
  process.stdout.write(`[agent-closure] OK: ${check.label}\n`);
}

if (!ok) {
  process.exitCode = 1;
  process.stdout.write("\n[agent-closure] Gate status: FAIL\n");
} else {
  process.stdout.write("\n[agent-closure] Gate status: PASS\n");
}
