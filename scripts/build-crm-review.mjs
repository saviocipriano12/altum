import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statfsSync } from "node:fs";
import net from "node:net";

// Review build only. Never bake real service credentials or access production.
// A failed local build exhausted disk while persisting a 3.5 GB native cache.
// Reserve headroom for cache and output before launching another compiler.
const disk = statfsSync(process.cwd(), { bigint: true });
const freeBytes = disk.bavail * disk.bsize, minimumFreeBytes = 6n * 1024n ** 3n;
if (freeBytes < minimumFreeBytes) throw new Error(`CRM review build requires at least 6 GiB free disk space; available ${(Number(freeBytes) / 1024 ** 3).toFixed(2)} GiB. No compiler started.`);
for (const port of [8080, 9099]) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(1500);
    socket.on("connect", () => { socket.destroy(); resolve(); });
    socket.on("error", reject);
    socket.on("timeout", () => { socket.destroy(); reject(new Error(`Missing local emulator ${port}`)); });
  });
}
const env = { ...process.env };
for (const name of readdirSync(process.cwd()).filter(name => /^\.env(?:\.|$)/.test(name))) {
  for (const match of readFileSync(name, "utf8").matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[match[1]] = "";
}
for (const key of Object.keys(env)) if (/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY|CLIENT_EMAIL/.test(key)) env[key] = "";
Object.assign(env, { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ALTUM_QA_EMULATORS: "0", NEXT_PUBLIC_ALTUM_QA_EMULATORS: "0",
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab", GOOGLE_CLOUD_PROJECT: "demo-altum-qa-lab",
  NEXT_PUBLIC_FIREBASE_API_KEY: "qa-local-only", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  NEXT_PUBLIC_FIREBASE_APP_ID: "qa-local-only", NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789000",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
console.log("CRM review build: fictitious configuration and local emulators; not a deployment artifact.");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--turbopack"], { env, stdio: "inherit", windowsHide: true });
process.on("SIGINT", () => child.kill("SIGINT")); process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
