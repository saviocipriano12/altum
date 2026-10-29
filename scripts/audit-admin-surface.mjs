import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceExtensions = /\.(?:ts|tsx|mts|cts|mjs|cjs)$/;
const targets = {
  adminPages: "app/admin",
  adminApi: "app/api/admin",
  internalApi: "app/api/internal",
  agentRuntime: "lib/server/agent-os",
  jobs: "infra/jobs",
};

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (sourceExtensions.test(entry.name) || entry.name.endsWith(".service") || entry.name.endsWith(".timer")) files.push(full);
  }
  return files;
}

function pathsFor(path) {
  return walk(join(root, path)).map((file) => relative(root, file).replace(/\\/g, "/")).sort();
}

const inventory = Object.fromEntries(Object.entries(targets).map(([name, path]) => [name, pathsFor(path)]));
const pageRoutes = inventory.adminPages
  .filter((path) => /\/page\.tsx$/.test(path))
  .map((path) => `/${path.slice("app/".length, -"/page.tsx".length) || "admin"}`);
const apiRoutes = [...inventory.adminApi, ...inventory.internalApi]
  .filter((path) => /\/route\.ts$/.test(path))
  .map((path) => `/${path.slice("app/".length, -"/route.ts".length)}`);
const workerCandidates = inventory.agentRuntime.filter((path) => /worker|runtime|executor|routing/i.test(path));
const integrationSignals = new Set();
for (const path of [...inventory.adminApi, ...inventory.agentRuntime]) {
  const content = readFileSync(join(root, path), "utf8");
  for (const match of content.matchAll(/(?:providerId|connectionId|runtime|OpenClaw|MCP|OAuth|webhook)/gi)) integrationSignals.add(match[0]);
}

const required = ["/admin/missoes", "/admin/agentes", "/api/admin/agent-os/missions", "/api/internal/agent-runtime/events"];
const discovered = new Set([...pageRoutes, ...apiRoutes]);
const missing = required.filter((route) => !discovered.has(route));
const report = {
  ok: missing.length === 0,
  generatedAt: new Date().toISOString(),
  counts: Object.fromEntries(Object.entries(inventory).map(([name, files]) => [name, files.length])),
  routes: { pages: pageRoutes, apis: apiRoutes },
  workerCandidates,
  integrationSignals: [...integrationSignals].sort(),
  inventory,
  required,
  missing,
};

console.log(process.argv.includes("--summary")
  ? JSON.stringify({
      ok: report.ok,
      counts: report.counts,
      pageRouteCount: report.routes.pages.length,
      apiRouteCount: report.routes.apis.length,
      workerCandidateCount: report.workerCandidates.length,
      missing: report.missing,
    }, null, 2)
  : JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
