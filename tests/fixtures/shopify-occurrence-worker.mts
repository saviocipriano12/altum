// Fresh process, only the parent's admitted fictitious Shopify events.
import assert from "node:assert/strict";
const startedAt = performance.now();
function phase(name: string) {
  process.stderr.write(`QA_OCCURRENCE_PHASE ${name}:${Math.round(performance.now() - startedAt)}ms\n`);
}
phase("entry");
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
globalThis.fetch = () => { throw new Error("No external requests in occurrence recovery QA"); };
const tenantId = process.env.QA_SHOPIFY_OCCURRENCE_TENANT!;
assert.match(tenantId, /^qa_ecommerce_projection_\d+$/);
const importWatch = setInterval(() => {
  const cpu = process.cpuUsage(), memory = process.memoryUsage();
  process.stderr.write(`QA_OCCURRENCE_IMPORT elapsed=${Math.round(performance.now() - startedAt)}ms cpu=${Math.round((cpu.user + cpu.system) / 1000)}ms rss=${Math.round(memory.rss / 1048576)}MB\n`);
}, 3000);
importWatch.unref();
let processPendingAutomationActions: typeof import("../../lib/server/automations.ts").processPendingAutomationActions;
try { ({ processPendingAutomationActions } = await import("../../lib/server/automations.ts")); }
finally { clearInterval(importWatch); }
phase("automations_loaded");
const { adminDb } = await import("../../app/lib/server/firebase-admin.ts");
phase("firebase_loaded");
try {
  const result = await processPendingAutomationActions({ tenantId, limit: 100 });
  phase("processing_complete");
  process.stdout.write(JSON.stringify(result));
} finally { await adminDb.terminate(); phase("terminated"); }
