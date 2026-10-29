import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

const root = process.cwd();
const registryPath = join(root, "config", "agent-source-registry.json");
const agencyPath = join(root, "config", "reviewed-agency-agents.json");
const checkCheckouts = process.argv.includes("--check-checkouts");
const importedManifestPath = join(root, "resources", "agency-agents", "review-queue", "manifest.json");
const sha256 = (content) => createHash("sha256").update(content).digest("hex");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`JSON inválido em ${path}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  }
}

const sourceRegistry = readJson(registryPath);
const agencyRegistry = readJson(agencyPath);
const errors = [];
const warnings = [];
const byRepo = new Map();

if (!Array.isArray(sourceRegistry.sources)) errors.push("agent-source-registry.json precisa conter sources[].");
for (const source of sourceRegistry.sources || []) {
  if (!source || typeof source !== "object") {
    errors.push("Há uma entrada de fonte inválida.");
    continue;
  }
  if (typeof source.repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repo)) errors.push(`Repo inválido: ${String(source.repo)}`);
  if (typeof source.commit !== "string" || !/^[a-f0-9]{40}$/i.test(source.commit)) errors.push(`Commit inválido para ${String(source.repo)}`);
  if (typeof source.category !== "string" || !source.category.trim()) errors.push(`Categoria ausente para ${String(source.repo)}`);
  if (typeof source.adoption !== "string" || !source.adoption.trim()) errors.push(`Modo de adoção ausente para ${String(source.repo)}`);
  const previous = byRepo.get(source.repo);
  if (previous && previous.commit !== source.commit) errors.push(`O repo ${source.repo} possui commits concorrentes no registro.`);
  else if (previous) warnings.push(`O repo ${source.repo} aparece mais de uma vez com o mesmo commit.`);
  else byRepo.set(source.repo, source);
}

if (!agencyRegistry.source || typeof agencyRegistry.source !== "object") {
  errors.push("reviewed-agency-agents.json precisa declarar source.");
} else {
  const selected = byRepo.get(agencyRegistry.source.repo);
  if (!selected) errors.push(`Fonte da agência não está registrada: ${agencyRegistry.source.repo}`);
  else if (selected.commit !== agencyRegistry.source.commit) errors.push(`Commit da agência diverge do registro principal para ${agencyRegistry.source.repo}`);
  if (agencyRegistry.source.license !== "MIT") warnings.push("A fonte Agency Agents não está marcada como MIT; revise a decisão de importação.");
}

const agentIds = new Set();
for (const agent of agencyRegistry.agents || []) {
  if (!agent || typeof agent !== "object" || typeof agent.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(agent.id)) {
    errors.push(`ID de agente inválido: ${String(agent?.id)}`);
    continue;
  }
  if (agentIds.has(agent.id)) errors.push(`ID de agente duplicado: ${agent.id}`);
  agentIds.add(agent.id);
  if (typeof agent.sourcePath !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+\.md$/i.test(agent.sourcePath)) errors.push(`sourcePath inválido: ${agent.id}`);
  if (typeof agent.altumRole !== "string" || agent.altumRole.trim().length < 3) errors.push(`altumRole inválido: ${agent.id}`);
}

let checkout = { checked: false, present: false, head: null };
if (checkCheckouts && agencyRegistry.source?.repo) {
  checkout.checked = true;
  const folder = join(root, ".altum-agent-sources", agencyRegistry.source.repo.replace("/", "__"));
  checkout.present = existsSync(folder);
  if (!checkout.present) {
    errors.push(`Checkout ausente para ${agencyRegistry.source.repo}. Execute o sync da fonte.`);
  } else {
    try {
      checkout.head = execFileSync("git", ["-C", folder, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      if (checkout.head !== agencyRegistry.source.commit) errors.push(`Checkout divergente para ${agencyRegistry.source.repo}: ${checkout.head}`);
    } catch {
      errors.push(`Não foi possível ler o commit do checkout ${agencyRegistry.source.repo}.`);
    }
  }
}

let importAudit = { checked: false, manifestPresent: false, agentCount: 0 };
if (existsSync(importedManifestPath)) {
  importAudit = { checked: true, manifestPresent: true, agentCount: 0 };
  const imported = readJson(importedManifestPath);
  if (imported.schemaVersion !== 2 || !Array.isArray(imported.agents)) {
    errors.push("Manifesto importado da agência está em formato inesperado; reimporte a fonte.");
  } else {
    importAudit.agentCount = imported.agents.length;
    const importedById = new Map(imported.agents.map((agent) => [agent.id, agent]));
    for (const agent of agencyRegistry.agents || []) {
      const record = importedById.get(agent.id);
      if (!record || record.sourceRepo !== agencyRegistry.source?.repo || record.sourceCommit !== agencyRegistry.source?.commit || record.sourcePath !== agent.sourcePath) {
        errors.push(`Proveniência importada divergente: ${agent.id}`);
        continue;
      }
      const importedFile = typeof record.importedFile === "string" ? join(root, "resources", "agency-agents", record.importedFile) : "";
      if (!importedFile || !existsSync(importedFile)) {
        errors.push(`Arquivo importado ausente: ${agent.id}`);
      } else if (typeof record.importedContentSha256 !== "string" || sha256(readFileSync(importedFile, "utf8")) !== record.importedContentSha256) {
        errors.push(`Arquivo importado foi alterado fora da reimportação: ${agent.id}`);
      }
      if (checkCheckouts && checkout.present && typeof record.sourceSha256 === "string") {
        const sourceFile = join(root, ".altum-agent-sources", agencyRegistry.source.repo.replace("/", "__"), agent.sourcePath);
        if (!existsSync(sourceFile) || sha256(readFileSync(sourceFile, "utf8")) !== record.sourceSha256) errors.push(`Fonte original diverge do hash importado: ${agent.id}`);
      }
    }
  }
}

const report = {
  ok: errors.length === 0,
  sourceCount: Array.isArray(sourceRegistry.sources) ? sourceRegistry.sources.length : 0,
  agencyAgentCount: Array.isArray(agencyRegistry.agents) ? agencyRegistry.agents.length : 0,
  checkout,
  importAudit,
  warnings,
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
