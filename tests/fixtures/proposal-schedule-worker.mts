import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const tenantId = process.env.QA_PROPOSAL_SCHEDULE_TENANT!;
assert.match(tenantId, /^qa_proposal_update_\d+$/);
globalThis.fetch = () => { throw new Error("No external requests allowed in proposal scheduler QA"); };
const { processPendingAutomationActions } = await import("../../lib/server/automations.ts");
const { adminDb } = await import("../../app/lib/server/firebase-admin.ts");
try { process.stdout.write(JSON.stringify(await processPendingAutomationActions({ tenantId, limit: 100 }))); }
finally { await adminDb.terminate(); }
