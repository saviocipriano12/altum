import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, ".altum-agent-sources", "openclaw__openclaw");
const bridgeTemplate = join(root, "resources", "openclaw", "altum-mission-bridge");
const target = join(sourceRoot, "extensions", "altum-mission-bridge");
const registry = JSON.parse(readFileSync(join(root, "config", "agent-source-registry.json"), "utf8"));
const entry = registry.sources.find((source) => source.repo === "openclaw/openclaw");

function ensureBridgeLockfile() {
  const lockfile = join(sourceRoot, "pnpm-lock.yaml");
  if (!existsSync(lockfile)) throw new Error("pnpm-lock.yaml ausente no checkout OpenClaw.");
  const importer = "  extensions/altum-mission-bridge:\n    devDependencies:\n      '@openclaw/plugin-sdk':\n        specifier: workspace:*\n        version: link:../../packages/plugin-sdk\n";
  const current = readFileSync(lockfile, "utf8");
  if (current.includes("  extensions/altum-mission-bridge:\n")) return;
  const marker = "  extensions/amazon-bedrock:\n";
  if (!current.includes(marker) || !current.includes("  packages/plugin-sdk:\n")) {
    throw new Error("pnpm-lock.yaml do OpenClaw mudou; atualize o template do bridge antes de continuar.");
  }
  // This bridge only consumes the already-versioned workspace SDK. Adding its
  // importer keeps Docker's frozen install reproducible without resolving or
  // upgrading any third-party dependency from the audited OpenClaw snapshot.
  writeFileSync(lockfile, current.replace(marker, `${importer}\n${marker}`), "utf8");
  console.log("Importer do bridge registrado no pnpm-lock.yaml do fork OpenClaw.");
}

if (!entry || entry.adoption !== "fork_runtime") {
  throw new Error("O registro da fonte OpenClaw precisa declarar adoption=fork_runtime.");
}
if (!existsSync(sourceRoot)) {
  throw new Error("Checkout OpenClaw ausente. Rode: node scripts/sync-agent-sources.mjs openclaw/openclaw");
}
if (!existsSync(bridgeTemplate)) {
  throw new Error("Template do bridge Altum ausente.");
}
const head = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (head !== entry.commit) {
  throw new Error(`Checkout OpenClaw inesperado (${head}). Commit esperado: ${entry.commit}`);
}

mkdirSync(target, { recursive: true });
cpSync(bridgeTemplate, target, { recursive: true, force: true });
const template = join(target, "index.ts.template");
const installed = join(target, "index.ts");
if (!existsSync(template)) throw new Error("Entry template não foi copiado.");
cpSync(template, installed, { force: true });
ensureBridgeLockfile();
console.log(`Bridge Altum instalado em ${target}`);
