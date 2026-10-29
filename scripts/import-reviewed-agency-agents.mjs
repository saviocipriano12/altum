import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";

const root = process.cwd();
const registry = JSON.parse(readFileSync(join(root, "config", "reviewed-agency-agents.json"), "utf8"));
const sourceRoot = join(root, ".altum-agent-sources", registry.source.repo.replace("/", "__"));
const outputRoot = join(root, "resources", "agency-agents", "review-queue");
const licenseRoot = join(root, "resources", "agency-agents", "licenses");

function mustBeInside(rootPath, targetPath) {
  const relative = targetPath.slice(rootPath.length).replace(/^[\\/]+/, "");
  if (!relative || relative.includes("..") || targetPath !== join(rootPath, relative)) {
    throw new Error(`Caminho de agente inválido: ${targetPath}`);
  }
}

if (!existsSync(sourceRoot)) {
  throw new Error(`Checkout ausente: ${registry.source.repo}. Execute node scripts/sync-agent-sources.mjs ${registry.source.repo}`);
}

const head = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (head !== registry.source.commit) {
  throw new Error(`Checkout inesperado para ${registry.source.repo}: ${head}. Esperado: ${registry.source.commit}`);
}

mkdirSync(outputRoot, { recursive: true });
mkdirSync(licenseRoot, { recursive: true });
const manifest = [];
const ids = new Set();
const sha256 = (content) => createHash("sha256").update(content).digest("hex");

for (const agent of registry.agents) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(agent.id) || ids.has(agent.id)) {
    throw new Error(`ID de agente inválido ou duplicado: ${agent.id}`);
  }
  ids.add(agent.id);
  if (typeof agent.sourcePath !== "string" || !agent.sourcePath.endsWith(".md")) {
    throw new Error(`sourcePath inválido para ${agent.id}`);
  }
  const source = join(sourceRoot, agent.sourcePath);
  mustBeInside(sourceRoot, source);
  if (!existsSync(source)) throw new Error(`Agente fonte ausente: ${agent.sourcePath}`);
  const content = readFileSync(source, "utf8");
  if (!content.startsWith("---")) throw new Error(`Agente sem frontmatter esperado: ${agent.sourcePath}`);

  const attribution = `<!--\nImported for Altum agency review queue.\nSource: https://github.com/${registry.source.repo}\nCommit: ${registry.source.commit}\nLicense: ${registry.source.license}\nSource path: ${agent.sourcePath}\nAltum role: ${agent.altumRole}\nStatus: review_required_before_activation\n-->\n\n`;
  const output = join(outputRoot, `${agent.id}.md`);
  writeFileSync(output, `${attribution}${content}`, "utf8");
  manifest.push({
    id: agent.id,
    altumRole: agent.altumRole,
    division: agent.division,
    sourceRepo: registry.source.repo,
    sourceCommit: registry.source.commit,
    sourcePath: agent.sourcePath,
    importedFile: `review-queue/${basename(output)}`,
    sourceSha256: sha256(content),
    importedContentSha256: sha256(`${attribution}${content}`),
    status: "review_required_before_activation",
  });
}

const license = join(sourceRoot, "LICENSE");
if (!existsSync(license)) throw new Error(`LICENSE ausente em ${registry.source.repo}`);
copyFileSync(license, join(licenseRoot, `${registry.source.repo.replace("/", "__")}-LICENSE`));
rmSync(join(outputRoot, "manifest.json"), { force: true });
writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify({ schemaVersion: 2, source: registry.source, agents: manifest }, null, 2)}\n`, "utf8");
writeFileSync(join(root, "resources", "agency-agents", "README.md"), `# Agência Altum — fontes externas em revisão\n\nOs agentes neste diretório foram importados de uma fonte externa fixada em commit e permanecem em \`review_required_before_activation\`. Eles não podem receber ferramentas, dados de clientes ou execução em produção até terem manifesto Altum, permissões, política de custo, avaliação e responsável definidos.\n\nOrigem: https://github.com/${registry.source.repo}\nCommit: \`${registry.source.commit}\`\nLicença: ${registry.source.license}\n`, "utf8");
console.log(`Importados ${manifest.length} agentes para a fila de revisão da agência.`);
