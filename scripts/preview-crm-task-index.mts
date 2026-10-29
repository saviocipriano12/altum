import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getApps } from "firebase-admin/app";

// This preparation command cannot target production, load dotenv secrets or apply changes.
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
try {
  const args = process.argv.slice(2), flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!["--tenant", "--out", "--cursor", "--limit"].includes(key) || !value || value.startsWith("--") || flags.has(key)) throw new Error("Use --tenant qa_... [--out arquivo.json] [--cursor ID] [--limit 1..200]. Somente prévia local.");
    flags.set(key, value);
  }
  const tenantId = flags.get("--tenant");
  if (!tenantId) throw new Error("Informe a empresa fictícia com --tenant qa_...");
  const { previewTaskIndexPage } = await import("../lib/server/crm/task-index-migration.ts");
  const page = await previewTaskIndexPage({ tenantId, cursor: flags.get("--cursor"), limit: flags.has("--limit") ? Number(flags.get("--limit")) : undefined });
  const artifact = { kind: "crm-task-index-preview-v1", projectId: getApps()[0]?.options.projectId, createdAt: new Date().toISOString(), ...page };
  const output = flags.get("--out");
  if (output) {
    const path = resolve(output); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ path, inspected: page.entries.length, changes: page.entries.filter(row => row.action === "update").length,
      needsReview: page.entries.filter(row => row.action === "review").length, nextCursor: page.nextCursor, reachedEnd: page.reachedEnd,
      coverageComplete: page.coverageComplete, applied: false, indexedReaderReady: false }));
  } else console.log(JSON.stringify(artifact, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao preparar prévia local."); process.exitCode = 1;
} finally { await adminDb.terminate(); }
