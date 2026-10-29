import test, { after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  METADATA_SERVER_DETECTION: "none" });
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("No network requests allowed in pipeline classifier QA"); };
const { TenantPipelineConfigurationError } = await import("../lib/server/crm/pipeline.ts");
const { isProposalAutomationAuthorizationError } = await import("../lib/server/automation-proposal-delivery.ts");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
after(async () => { globalThis.fetch = originalFetch; await adminDb.terminate(); });

test("scheduled proposal classifier recognizes genuine pipeline configuration denials", () => {
  assert.equal(isProposalAutomationAuthorizationError(new TenantPipelineConfigurationError("Funil invalido para mutacao.")), true);
});

test("scheduled proposal classifier does not infer an authorization denial from transport code or localized wording", () => {
  assert.equal(isProposalAutomationAuthorizationError(Object.assign(new Error("Funil invalido para mutacao."), { code: 14 })), false);
  assert.equal(isProposalAutomationAuthorizationError(new Error("Configuracao de outra empresa.")), false);
});
