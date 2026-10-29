import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deleteTenantLead, restoreTenantTrash, listTenantTrash, purgeExpiredTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const tenantId = `qa_trash_preparation_${Date.now()}`;
after(async () => {
  for (const collection of ["leads", "lead_notes", "tenant_trash", "deletion_audits"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
});
async function failedPreparation(suffix: string, removeSnapshot = false) {
  const leadId = `${tenantId}_${suffix}`, lead = adminDb.collection("leads").doc(leadId), note = adminDb.collection("lead_notes").doc(`${leadId}_note`);
  await lead.set({ tenantId, nome: "Contato ficticio" }); await note.set({ tenantId, leadId, text: "Informacao preservada" });
  const writer = adminDb.bulkWriter(), prototype = Object.getPrototypeOf(writer); await writer.close();
  const original = prototype.close as FirebaseFirestore.BulkWriter["close"];
  const interceptor = mock.method(prototype, "close", async function(this: FirebaseFirestore.BulkWriter) {
    await original.call(this);
    if (removeSnapshot) {
      const manifest = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", leadId).get();
      const documents = await manifest.docs[0].ref.collection("documents").get(); await documents.docs[0].ref.delete();
    }
    throw new Error("QA_PREPARATION_ACK_LOST");
  });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /QA_PREPARATION_ACK_LOST/); }
  finally { interceptor.mock.restore(); }
  const manifests = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", leadId).get();
  assert.equal(manifests.size, 1);
  return { leadId, lead, note, manifest: manifests.docs[0].ref };
}
test("a fully persisted preparation with lost acknowledgement can be recovered and deleted again", async () => {
  const item = await failedPreparation("complete");
  await restoreTenantTrash({ tenantId, trashId: item.manifest.id });
  assert.ok((await item.lead.get()).exists); assert.equal((await item.note.get()).data()?.text, "Informacao preservada");
  assert.equal((await item.manifest.get()).exists, false);
  const second = await deleteTenantLead({ tenantId, leadId: item.leadId }); assert.ok(second.deleted);
});
test("an incomplete preparation stays protected and is explained in the trash listing", async () => {
  const item = await failedPreparation("incomplete", true);
  await assert.rejects(restoreTenantTrash({ tenantId, trashId: item.manifest.id }), /incomplet/i);
  assert.ok((await item.lead.get()).exists); assert.ok((await item.note.get()).exists); assert.ok((await item.manifest.get()).exists);
  const listed = (await listTenantTrash(tenantId)).find(row => row.id === item.manifest.id);
  assert.equal(listed?.canPurge, false); assert.equal(listed?.needsReview, true);
  assert.ok(listed?.recoveryMessage);
});
test("recovering a prepared copy cannot overwrite a human edit made after the failure", async () => {
  const item = await failedPreparation("edited");
  await item.note.update({ text: "Correcao recente" });
  await assert.rejects(restoreTenantTrash({ tenantId, trashId: item.manifest.id }), /alterad|concil/i);
  assert.equal((await item.note.get()).data()?.text, "Correcao recente"); assert.ok((await item.manifest.get()).exists);
});

test("retention reaches completed items beyond a full page of protected incomplete copies", async () => {
  const batch = adminDb.batch();
  for (let index = 0; index < 205; index++) batch.set(adminDb.collection("tenant_trash").doc(`${tenantId}_pending_${index}`), {
    tenantId, entity: "lead", entityId: `pending_${index}`, label: "Copia ficticia pendente", status: "incomplete",
    manifestComplete: false, deletionState: "preparation_failed", expiresAt: new Date(1),
  });
  await batch.commit();
  const leadId = `${tenantId}_retention`; await adminDb.collection("leads").doc(leadId).set({ tenantId });
  const item = await deleteTenantLead({ tenantId, leadId }); assert.ok(item.trashId);
  const ref = adminDb.collection("tenant_trash").doc(item.trashId); await ref.update({ expiresAt: new Date(2000) });
  const result = await purgeExpiredTenantTrash({ tenantId });
  assert.equal(result.coverageComplete, true); assert.ok(result.needsReview >= 205);
  assert.equal((await ref.get()).exists, false);
  assert.ok((await adminDb.collection("tenant_trash").doc(`${tenantId}_pending_0`).get()).exists);
});
