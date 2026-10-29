// Emulator-only fixtures for the authenticated lead -> Inbox template gate.
const projectId = "demo-altum-qa-lab";
for (const key of Object.keys(process.env)) {
  if (/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY|CLIENT_EMAIL/.test(key)) delete process.env[key];
}
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp, deleteApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const app = initializeApp({ projectId }, "qa-lead-start");
const db = getFirestore(app);
const tenantId = "qa-altum-alpha";
const fixture = "lead-start-template-v1";
const fixtures = [
  ["tenant_channels", "qa-altum-alpha-meta-start", {
    type: "whatsapp", provider: "meta_whatsapp", status: "active", channelScope: "shared",
    displayName: "WhatsApp Meta QA — sem envio real", phoneNumberId: "qa-invalid-number-id",
    accessToken: "qa-invalid-token-not-for-external-use",
  }],
  ["leads", "qa-altum-alpha-lead-start", {
    nome: "Cliente ficticio QA — iniciar conversa", telefone: "5511000000099",
    ownerId: "qa-altum-alpha-owner", channel: "whatsapp", stage: "new", pipelineStage: "new",
  }],
  ["leads", "qa-altum-alpha-lead-start-ui", {
    nome: "Cliente ficticio QA — rascunho visual", telefone: "5511000000098",
    ownerId: "qa-altum-alpha-owner", channel: "whatsapp", stage: "new", pipelineStage: "new",
  }],
];
try {
  await db.runTransaction(async (transaction) => {
    const refs = fixtures.map(([collection, id]) => db.collection(collection).doc(id));
    const snapshots = await transaction.getAll(...refs);
    for (let index = 0; index < refs.length; index += 1) {
      const existing = snapshots[index];
      if (existing.exists) {
        if (existing.data()?.tenantId !== tenantId || existing.data()?.qaFixture !== fixture) {
          throw new Error("QA fixture collision; no changes permitted.");
        }
      } else transaction.create(refs[index], { tenantId, qaFixture: fixture, ...fixtures[index][2] });
    }
  });
  console.log(JSON.stringify({ projectId, tenantId, fixturesReady: fixtures.map(([collection, id]) => `${collection}/${id}`) }));
} finally {
  await db.terminate();
  await deleteApp(app);
}
