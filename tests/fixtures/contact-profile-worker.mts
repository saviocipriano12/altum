import assert from "node:assert/strict";
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-omnichannel-identity", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-omnichannel-identity", GCLOUD_PROJECT: "demo-altum-omnichannel-identity",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", METADATA_SERVER_DETECTION: "none",
});
const tenantId = process.env.QA_CONTACT_TENANT!, worker = process.env.QA_CONTACT_WORKER!;
assert.match(tenantId, /^tenant_identity_\d+_[a-z0-9]+$/); assert.match(worker, /^[a-d]$/);
globalThis.fetch = () => { throw new Error("No external services in contact identity QA"); };
const { upsertContactProfile } = await import("../../lib/server/contact-profile.ts");
const { adminDb, adminAuth } = await import("../../app/lib/server/firebase-admin.ts");
assert.equal(adminAuth.app.options.projectId, "demo-altum-omnichannel-identity");
try {
  process.stdout.write(JSON.stringify(await Promise.all(Array.from({ length: 5 }, (_, index) => upsertContactProfile({
    tenantId, channel: "instagram", externalProfileId: "distributed-profile", leadId: `distributed-${worker}-${index}`,
  })))));
} finally { await adminDb.terminate(); }
