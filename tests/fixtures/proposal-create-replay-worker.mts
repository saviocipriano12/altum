// Separate Node process: only the parent's fictitious Auth/Firestore fixture.
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname)); return originalFetch(url, init);
};
const tenantId = process.env.QA_PROPOSAL_TENANT!, leadId = process.env.QA_PROPOSAL_LEAD!, requestId = process.env.QA_PROPOSAL_REQUEST!;
assert.match(tenantId, /^qa_proposal_create_\d+$/); assert.ok(leadId.startsWith(`${tenantId}_`)); assert.match(requestId, /^qa-/);
const { POST } = await import("../../app/api/tenant/[tenantId]/budgets/route.ts");
const { adminDb } = await import("../../app/lib/server/firebase-admin.ts");
try {
  const response = await POST(new Request("http://127.0.0.1/qa-proposal", { method: "POST", headers: {
    authorization: `Bearer ${process.env.QA_PROPOSAL_TOKEN}`, "content-type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify({ leadId, titulo: "Compra ficticia", status: "Enviado", valorTotal: 100 }) }), { params: Promise.resolve({ tenantId }) });
  process.stdout.write(JSON.stringify({ status: response.status, payload: await response.json() }));
} finally { await adminDb.terminate(); }
