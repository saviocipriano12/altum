import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const roots = ["app", "lib"];
const contractsPath = join(root, "config", "agent-os-data-contracts.json");
const extension = /\.(?:ts|tsx|mts|cts)$/;
const collectionPattern = /collection\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g;
const focus = /^(agent_|tool_|audit_)/;

function walk(path) {
  const entries = [];
  for (const entry of (existsSync(path) ? readdirSync(path, { withFileTypes: true }) : [])) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) entries.push(...walk(full));
    else if (extension.test(entry.name)) entries.push(full);
  }
  return entries;
}

const findings = new Map();
for (const directory of roots) {
  for (const file of walk(join(root, directory))) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(collectionPattern)) {
      const collection = match[1];
      if (!focus.test(collection)) continue;
      const files = findings.get(collection) || new Set();
      files.add(relative(root, file).replace(/\\/g, "/"));
      findings.set(collection, files);
    }
  }
}

const collections = [...findings.entries()]
  .map(([collection, files]) => ({ collection, files: [...files].sort() }))
  .sort((left, right) => left.collection.localeCompare(right.collection));
const required = [
  "agent_missions", "agent_tasks", "agent_approvals", "agent_runtime_dispatches",
  "agent_runtime_events", "agent_task_executions", "agent_mission_evidence", "audit_logs", "tool_connections", "tool_providers",
];
const missing = required.filter((collection) => !findings.has(collection));
const contracts = JSON.parse(readFileSync(contractsPath, "utf8"));
const contractNames = new Set(contracts.collections.map((contract) => contract.name));
const missingContracts = required.filter((collection) => !contractNames.has(collection));
const undocumentedCollections = collections
  .map((item) => item.collection)
  .filter((collection) => !contractNames.has(collection));
const contractMismatches = contracts.collections
  .filter((contract) => !findings.has(contract.name))
  .map((contract) => contract.name);
const report = {
  ok: missing.length === 0 && missingContracts.length === 0 && undocumentedCollections.length === 0 && contractMismatches.length === 0,
  scannedRoots: roots,
  collectionCount: collections.length,
  collections,
  required,
  missing,
  dataContracts: {
    schemaVersion: contracts.schemaVersion,
    count: contracts.collections.length,
    tenantScoped: contracts.collections.filter((contract) => contract.scope === "tenant").map((contract) => contract.name),
    platformScoped: contracts.collections.filter((contract) => contract.scope === "platform").map((contract) => contract.name),
    mixedScope: contracts.collections.filter((contract) => contract.scope === "tenant_or_platform").map((contract) => contract.name),
    legacyScope: contracts.collections.filter((contract) => contract.scope === "legacy_chat_bound").map((contract) => contract.name),
    missingContracts,
    undocumentedCollections,
    contractMismatches,
  },
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
