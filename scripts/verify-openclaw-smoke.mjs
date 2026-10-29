import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const name = "altum-openclaw-smoke";
const state = resolve(".altum-openclaw/smoke");
if (!existsSync(resolve(state, "runtime.env"))) {
  throw new Error("Execute node scripts/prepare-openclaw-smoke.mjs primeiro.");
}
const credentials = readFileSync(resolve(state, "runtime.env"), "utf8")
  .split(/\r?\n/).filter((line) => line.includes("SECRET=") || line.includes("TOKEN="))
  .map((line) => line.slice(line.indexOf("=") + 1));
function redact(value) {
  let safe = value;
  for (const credential of credentials) if (credential) safe = safe.replaceAll(credential, "[REDACTED]");
  return safe;
}
function docker(args, includeStderr = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = redact(`${result.stdout || ""}${includeStderr ? result.stderr || "" : ""}`).trim();
  if (result.error || result.status !== 0) {
    throw new Error(redact(`Docker ${args[0]} falhou: ${result.error?.message || result.stderr || result.status}`));
  }
  return output;
}
// Fail before mutation when the base image is still building.
docker(["image", "inspect", "altum-openclaw:runtime"]);
const existing = docker(["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"]);
if (existing) {
  throw new Error("Container de teste já existe; inspecione seu estado antes de repetir.");
}
docker([
  "run", "-d", "--name", name,
  "--env-file", resolve(state, "runtime.env"),
  "--mount", `type=bind,source=${state},target=/home/node/.openclaw`,
  "--security-opt", "no-new-privileges:true",
  "--cap-drop", "NET_RAW", "--cap-drop", "NET_ADMIN",
  "--health-interval", "10s", "--health-start-period", "30s",
  "altum-openclaw:runtime",
  "node", "openclaw.mjs", "gateway", "--bind", "loopback", "--port", "18789",
]);
console.log("Container isolado iniciado, sem portas publicadas nem fila de produção.");
const deadline = Date.now() + 180_000;
let healthy = false;
while (Date.now() < deadline) {
  const status = JSON.parse(docker(["inspect", "--format", "{{json .State}}", name]));
  if (!status.Running) {
    console.log(docker(["logs", "--tail", "100", name], true));
    throw new Error(`Runtime encerrou com código ${status.ExitCode}.`);
  }
  if (status.Health?.Status === "healthy") { healthy = true; break; }
  console.log(`Inicialização: ${status.Health?.Status || "aguardando healthcheck"}`);
  await new Promise((done) => setTimeout(done, 10_000));
}
console.log(docker(["logs", "--tail", "100", name], true));
if (!healthy) throw new Error("Healthcheck não confirmou prontidão em 180 segundos.");
// A healthy gateway alone does not prove that our private extension loaded.
// Probe its method guard inside the container, without submitting a mission.
const bridgeProbe = JSON.parse(docker([
  "exec", name, "node", "--input-type=module", "-e",
  "const r = await fetch('http://127.0.0.1:18789/altum/v1/missions'); console.log(JSON.stringify({status:r.status,body:await r.text()}));",
]));
if (bridgeProbe.status !== 405 || JSON.parse(bridgeProbe.body).error !== "method_not_allowed") {
  throw new Error("Gateway saudável, mas a rota do plugin Altum não foi confirmada.");
}
console.log("Plugin Altum confirmado pela rota privada; nenhuma missão foi enviada.");
console.log("Healthcheck aprovado. Execução de missão e acesso ao modelo ainda exigem teste integrado.");
