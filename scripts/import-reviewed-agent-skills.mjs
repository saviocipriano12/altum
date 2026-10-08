import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, ".altum-agent-sources");
const outputRoot = join(root, "resources", "agent-skills", "review-queue");
const registry = JSON.parse(readFileSync(join(root, "config", "reviewed-external-skills.json"), "utf8"));
mkdirSync(outputRoot, { recursive: true });

const notices = new Map();
for (const skill of registry.skills) {
  const repoDir = skill.sourceRepo.replace("/", "__");
  const source = join(sourceRoot, repoDir, skill.sourcePath);
  if (!existsSync(source)) throw new Error(`Fonte ausente: ${skill.sourceRepo}:${skill.sourcePath}. Execute sync-agent-sources primeiro.`);
  const content = readFileSync(source, "utf8");
  const attribution = `<!--\nImported for Altum review queue.\nSource: https://github.com/${skill.sourceRepo}\nCommit: ${skill.sourceCommit}\nLicense: ${skill.license}\nStatus: review_required_before_activation\n-->\n\n`;
  writeFileSync(join(outputRoot, `${skill.category}--${skill.id}.md`), `${attribution}${content}`);
  notices.set(skill.sourceRepo, { repoDir, license: skill.license });
}

const licenseRoot = join(root, "resources", "agent-skills", "licenses");
mkdirSync(licenseRoot, { recursive: true });
for (const [repo, metadata] of notices) {
  const license = join(sourceRoot, metadata.repoDir, "LICENSE");
  if (existsSync(license)) copyFileSync(license, join(licenseRoot, `${metadata.repoDir}-LICENSE`));
}
writeFileSync(join(root, "resources", "agent-skills", "README.md"), `# Skills externas em revisão\n\nEste diretório contém cópias atribuídas de skills reutilizáveis. Elas **não são executáveis** até passarem por curadoria da Altum; ver \`config/reviewed-external-skills.json\`.\n`);
console.log(`Importadas ${registry.skills.length} skills para revisão.`);
