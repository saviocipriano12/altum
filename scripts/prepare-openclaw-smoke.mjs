import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Isolated startup check: no model, production URL or business queue.
const stateDir = join(process.cwd(), ".altum-openclaw", "smoke");
mkdirSync(stateDir, { recursive: true });
const envPath = join(stateDir, "runtime.env");
if (!existsSync(envPath)) {
  writeFileSync(envPath, [
    `ALTUM_OPENCLAW_SHARED_SECRET=${randomBytes(32).toString("hex")}`,
    `ALTUM_OPENCLAW_GATEWAY_TOKEN=${randomBytes(32).toString("hex")}`,
    "OPENCLAW_STATE_DIR=/home/node/.openclaw",
    "OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json",
    "OPENCLAW_DISABLE_BONJOUR=1",
    "",
  ].join("\n"), { mode: 0o600 });
}
const configPath = join(stateDir, "openclaw.json");
{
  const config = JSON.parse(readFileSync(
    existsSync(configPath) ? configPath : "resources/openclaw/runtime/openclaw.json.example",
    "utf8",
  ));
  delete config.models;
  delete config.agents.defaults.model;
  config.tools = { ...config.tools, allow: [], deny: ["*"] };
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
console.log("Ambiente de inicialização isolado preparado; segredos preservados e não exibidos.");
