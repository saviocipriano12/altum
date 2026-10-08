import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const registry = JSON.parse(readFileSync(join(root, "config", "agent-source-registry.json"), "utf8"));
const destination = join(root, ".altum-agent-sources");
const selected = process.argv.slice(2);
mkdirSync(destination, { recursive: true });

for (const source of registry.sources) {
  if (selected.length && !selected.includes(source.repo)) continue;
  const target = join(destination, source.repo.replace("/", "__"));
  const url = `https://github.com/${source.repo}.git`;
  let validCheckout = false;
  if (existsSync(target)) {
    try {
      validCheckout = execFileSync("git", ["-C", target, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
      if (validCheckout) execFileSync("git", ["-C", target, "rev-parse", "--verify", "HEAD"], { stdio: ["ignore", "ignore", "ignore"] });
    } catch {
      // Um clone interrompido não pode ser reutilizado; ele só existe na pasta
      // temporária e ignorada de fontes externas.
      const normalizedTarget = target.replace(/\\/g, "/");
      const normalizedDestination = destination.replace(/\\/g, "/");
      if (!normalizedTarget.startsWith(`${normalizedDestination}/`)) throw new Error("Destino de fonte inválido.");
      console.log(`${source.repo}: removendo clone incompleto...`);
      rmSync(target, { recursive: true, force: true });
    }
  }
  if (!validCheckout) {
    console.log(`Clonando ${source.repo} (${source.adoption})...`);
    execFileSync("git", ["clone", "--depth=1", url, target], { stdio: "inherit" });
  }
  let head = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== source.commit) {
    console.log(`${source.repo}: fixando commit auditado ${source.commit.slice(0, 12)}...`);
    execFileSync("git", ["-C", target, "fetch", "--depth=1", "origin", source.commit], { stdio: "inherit" });
    execFileSync("git", ["-C", target, "checkout", "--detach", source.commit], { stdio: "inherit" });
    head = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  }
  if (head !== source.commit) throw new Error(`${source.repo}: não foi possível fixar o commit auditado.`);
}
console.log(`Fontes disponíveis em ${destination}`);
