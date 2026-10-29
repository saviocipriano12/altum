import assert from "node:assert/strict";
import { createRequire } from "node:module";
const startedAt = performance.now();
const checkpoint = (phase: string) => process.stderr.write(`${JSON.stringify({ qaStageSchedule: phase, elapsedMs: Math.round(performance.now() - startedAt) })}\n`);
checkpoint("bootstrap");
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  METADATA_SERVER_DETECTION: "none" });
const tenantId = process.env.QA_STAGE_SCHEDULE_TENANT!; assert.match(tenantId, /^qa_stage_order_\d+$/);
globalThis.fetch = () => { throw new Error("No external requests allowed in stage scheduler QA"); };
const { processPendingAutomationActions } = await import("../../lib/server/automations.ts");
checkpoint("runtime_loaded");
const { adminDb, adminAuth } = await import("../../app/lib/server/firebase-admin.ts");
checkpoint("database_loaded");
assert.equal(adminAuth.app.options.projectId, "demo-altum-qa-lab");
try {
  const result = await processPendingAutomationActions({ tenantId, limit: 100 });
  const ecommerceHandlerLoaded = Object.keys(createRequire(import.meta.url).cache).some(path => path.replaceAll("\\", "/").endsWith("/lib/server/ecommerce.ts"));
  process.stdout.write(JSON.stringify({ ...result, runtime: { ecommerceHandlerLoaded } })); checkpoint("consumer_finished");
}
finally { await adminDb.terminate(); }
