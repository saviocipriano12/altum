import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  METADATA_SERVER_DETECTION: "none" });
const tenantId = process.env.QA_STAGE_INTERNAL_TENANT!, id = process.env.QA_STAGE_INTERNAL_SOURCE!, token = process.env.QA_STAGE_INTERNAL_TOKEN!;
assert.match(tenantId, /^qa_stage_order_\d+$/); assert.match(id, /^crm_stage_[a-f0-9]{64}$/); assert.equal(token, "qa-claim-internal-cold");
globalThis.fetch = () => { throw new Error("No external requests allowed in stage internal QA"); };
const { adminDb, adminAuth } = await import("../../app/lib/server/firebase-admin.ts");
const { commitStageAutomationInternalRecords } = await import("../../lib/server/automation-stage-delivery.ts");
assert.equal(adminAuth.app.options.projectId, "demo-altum-qa-lab");
try {
  const root = (await adminDb.collection("jobs").doc(id).get()).data()!;
  assert.equal(root.tenantId, tenantId); assert.equal(root.leadId, `${tenantId}_internal-cold`);
  const automation = root.stageAutomationPlans[0]; assert.equal(automation.tenantId, tenantId);
  const result = await commitStageAutomationInternalRecords({ tenantId, leadId: root.leadId,
    source: { kind: "order", id, token }, automation, actionIndex: 0, action: automation.actions[0] });
  process.stdout.write(JSON.stringify({ receiptId: result.receiptId, executed: result.executed }));
} finally { await adminDb.terminate(); }
