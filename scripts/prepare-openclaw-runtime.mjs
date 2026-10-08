import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimeState = join(root, ".altum-openclaw");
const config = join(runtimeState, "openclaw.json");
const configExample = join(root, "resources", "openclaw", "runtime", "openclaw.json.example");
const env = join(root, ".env.openclaw-runtime");
const envExample = join(root, ".env.openclaw-runtime.example");

const install = spawnSync(process.execPath, ["scripts/install-altum-openclaw-bridge.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if (install.status !== 0) process.exit(install.status ?? 1);

mkdirSync(runtimeState, { recursive: true });
if (!existsSync(config)) {
  copyFileSync(configExample, config);
  console.log("Configuração inicial criada em .altum-openclaw/openclaw.json");
} else {
  console.log("Configuração existente preservada em .altum-openclaw/openclaw.json");
}
if (!existsSync(env)) {
  copyFileSync(envExample, env);
  console.log("Arquivo local .env.openclaw-runtime criado; preencha os segredos antes de subir o runtime.");
} else {
  console.log("Arquivo .env.openclaw-runtime existente preservado.");
}
console.log("Próximo passo, depois de preencher o .env: docker compose -f docker-compose.openclaw-runtime.yml up -d --build");
