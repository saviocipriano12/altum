import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  METADATA_SERVER_DETECTION: "none" });
const tenantId = process.env.QA_PROPOSAL_INTERNAL_TENANT!, leadId = process.env.QA_PROPOSAL_INTERNAL_LEAD!;
const id = process.env.QA_PROPOSAL_INTERNAL_SOURCE!, token = process.env.QA_PROPOSAL_INTERNAL_TOKEN!;
assert.match(tenantId, /^qa_proposal_update_\d+$/);
assert.equal(leadId, `${tenantId}_internal-cold-records_lead`);
assert.match(id, /^budget_mutation_[a-f0-9]{64}$/);
assert.equal(token, "qa-internal-claim");
globalThis.fetch = () => { throw new Error("No external requests allowed in internal proposal QA"); };
const { runLeadAutomations } = await import("../../lib/server/automations.ts");
const { adminDb, adminAuth } = await import("../../app/lib/server/firebase-admin.ts");
assert.equal(adminAuth.app.options.projectId, "demo-altum-qa-lab");
try { process.stdout.write(JSON.stringify(await runLeadAutomations({ tenantId, leadId, trigger: "budget_approved",
  strictErrors: true, proposalClaim: { id, token } }))); }
finally { await adminDb.terminate(); }
