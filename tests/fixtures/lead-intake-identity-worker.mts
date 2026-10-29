// Separate process, limited to the parent's fictitious local Shopify fixture.
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
globalThis.fetch = () => { throw new Error("No external calls in intake restart QA"); };
const tenantId = process.env.QA_INTAKE_TENANT!, email = process.env.QA_INTAKE_EMAIL!;
assert.match(tenantId, /^qa_intake_\d+$/); assert.match(email, /^[a-z0-9-]+@qa\.invalid$/);
const { recordInboundLead } = await import("../../lib/server/lead-intake.ts");
const { adminDb } = await import("../../app/lib/server/firebase-admin.ts");
try {
  process.stdout.write(JSON.stringify(await recordInboundLead({ tenantId, email, sourceType: "shopify_order", channel: "ecommerce",
    sourceLabel: "Shopify QA", nome: "Cliente ficticio", defaultOwnerId: "qa-default", skipLeadCreatedWorkflows: true })));
} finally { await adminDb.terminate(); }
