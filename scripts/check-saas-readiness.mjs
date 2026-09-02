import nextEnv from "@next/env";
import { access } from "node:fs/promises";
import process from "node:process";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const requiredGroups = [
  {
    name: "URL publica",
    keys: ["NEXT_PUBLIC_SITE_URL"],
  },
  {
    name: "Firebase Web",
    keys: [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
    ],
  },
  {
    name: "Firebase Admin",
    alternatives: [
      ["FIREBASE_SERVICE_ACCOUNT_KEY"],
      ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"],
    ],
  },
  {
    name: "E-mail transacional Resend",
    keys: ["RESEND_API_KEY"],
  },
  {
    name: "Asaas",
    keys: ["ASAAS_API_URL", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"],
  },
  {
    name: "Criptografia",
    keys: ["SECRET_ENCRYPTION_KEY"],
  },
];

const recommendedGroups = [
  {
    name: "Jobs internos",
    keys: ["CRON_SECRET"],
  },
  {
    name: "Google Search Console",
    keys: ["NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"],
  },
  {
    name: "Firebase App Check",
    keys: ["NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY"],
  },
];

const requiredFiles = [
  "firestore.rules",
  "storage.rules",
  "public/llms.txt",
  "app/robots.ts",
  "app/sitemap.ts",
];

function missingKeys(group) {
  if (group.alternatives) {
    const configured = group.alternatives.some((alternative) =>
      alternative.every((key) => String(process.env[key] || "").trim())
    );
    return configured ? [] : [group.alternatives.map((alternative) => alternative.join(" + ")).join(" OU ")];
  }
  return group.keys.filter((key) => !String(process.env[key] || "").trim());
}

function printGroup(group, required) {
  const missing = missingKeys(group);
  const ok = missing.length === 0;
  const prefix = ok ? "OK" : required ? "FALTA" : "RECOMENDADO";
  console.log(`${prefix} - ${group.name}${ok ? "" : `: ${missing.join(", ")}`}`);
  return ok;
}

async function fileExists(path) {
  try {
    await access(path);
    console.log(`OK - arquivo ${path}`);
    return true;
  } catch {
    console.log(`FALTA - arquivo ${path}`);
    return false;
  }
}

async function run() {
  console.log("Prontidao SaaS (valores secretos nao sao exibidos)\n");
  const requiredEnvOk = requiredGroups.map((group) => printGroup(group, true)).every(Boolean);
  recommendedGroups.forEach((group) => printGroup(group, false));
  const filesOk = (await Promise.all(requiredFiles.map(fileExists))).every(Boolean);

  if (!requiredEnvOk || !filesOk) {
    console.error("\nGate local reprovado: complete os itens marcados como FALTA.");
    process.exit(1);
  }

  console.log("\nGate local aprovado. Ainda execute os testes externos documentados em docs/GO_LIVE_GATES_EXTERNOS.md.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
