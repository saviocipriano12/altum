import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { randomBytes } from "node:crypto";

for (const port of [8080, 9099, 9199]) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(1500);
    socket.on("connect", () => { socket.destroy(); resolve(); });
    socket.on("error", reject);
    socket.on("timeout", () => { socket.destroy(); reject(new Error(`Missing local emulator ${port}`)); });
  });
}
const env = { ...process.env };
// Shadow dotenv keys before Next can autoload them. Values are never logged.
for (const name of readdirSync(process.cwd()).filter((name) => /^\.env(?:\.|$)/.test(name))) {
  for (const match of readFileSync(name, "utf8").matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[match[1]] = "";
}
for (const key of Object.keys(env)) {
  if (/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY|CLIENT_EMAIL/.test(key)) env[key] = "";
}
Object.assign(env, {
  ALTUM_QA_TRACE_WATCH: process.argv.includes("--trace-watch") ? "1" : "0",
  NODE_ENV: "development", ALTUM_QA_EMULATORS: "1", NEXT_PUBLIC_ALTUM_QA_EMULATORS: "1",
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  GCLOUD_PROJECT: "demo-altum-qa-lab", GOOGLE_CLOUD_PROJECT: "demo-altum-qa-lab",
  NEXT_PUBLIC_FIREBASE_API_KEY: "qa-local-only", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_APP_ID: "qa-local-only",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789000",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  NEXT_TELEMETRY_DISABLED: "1",
  // Ephemeral local-only cursor key; never reuse or print a production key.
  CRM_ACTIVITY_CURSOR_KEY: randomBytes(32).toString("hex"),
});
// The isolated lab avoids Turbopack's separate PostCSS evaluator, which failed
// under memory pressure on this host. Production build configuration is unchanged.
const port = Number(process.env.ALTUM_QA_PORT || 3199);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local QA port");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
  { env, stdio: "inherit", windowsHide: true });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
