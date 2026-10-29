import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deleteTenantLead, deleteTenantChat, deleteTenantTrashPermanently, restoreTenantTrash, purgeExpiredTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const tenantId = `qa_crm_delete_race_${Date.now()}`;
after(async () => {
  for (const collection of ["leads", "chats", "messages", "lead_notes", "tenant_trash", "tenant_settings", "deletion_audits", "deletion_certificates", "tenant_users", "tenant_channels"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
});

async function seller(suffix: string, capability: "edit_leads" | "respond_inbox") {
  const userId = `${tenantId}_${suffix}`, ref = adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`);
  await ref.set({ tenantId, userId, role: "client_agent", status: "active", capabilities: [capability] });
  return { userId, ref, authority: { userId, capability } };
}
test("revoking the seller capability after preparation preserves the opportunity and its notes", async () => {
  const actor = await seller("revoked", "edit_leads"), leadId = `${tenantId}_revoked`;
  const lead = adminDb.collection("leads").doc(leadId), note = adminDb.collection("lead_notes").doc(`${leadId}_note`);
  await lead.set({ tenantId, ownerId: actor.userId }); await note.set({ tenantId, leadId, text: "Preservar" });
  const reset = await afterManifest(async () => { await actor.ref.update({ capabilities: [] }); });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId, authority: actor.authority }), /permiss|acesso|capacidade/i); }
  finally { reset(); }
  assert.ok((await lead.get()).exists); assert.ok((await note.get()).exists);
});
test("changing a personal channel owner after preparation overrides stale chat ownership", async () => {
  const actor = await seller("channel", "respond_inbox"), chatId = `${tenantId}_channel`, channelId = `${chatId}_channel`;
  const chat = adminDb.collection("chats").doc(chatId), message = adminDb.collection("messages").doc(`${chatId}_message`);
  const channel = adminDb.collection("tenant_channels").doc(channelId);
  await channel.set({ tenantId, channelScope: "personal", ownerUserId: actor.userId });
  await chat.set({ tenantId, channelId, assignedTo: actor.userId, channelScope: "personal", channelOwnerUserId: actor.userId });
  await message.set({ tenantId, chatId, text: "Preservar" });
  const reset = await afterManifest(async () => { await channel.update({ ownerUserId: "another-seller" }); });
  try { await assert.rejects(deleteTenantChat({ tenantId, chatId, authority: actor.authority }), /vendedor|acesso|permiss/i); }
  finally { reset(); }
  assert.ok((await chat.get()).exists); assert.ok((await message.get()).exists);
});
test("revocation between deletion pages stops the next page and preserves the parent", async () => {
  const actor = await seller("paged", "edit_leads"), leadId = `${tenantId}_paged`;
  const lead = adminDb.collection("leads").doc(leadId); await lead.set({ tenantId, ownerId: actor.userId });
  const batch = adminDb.batch();
  for (let index = 0; index < 220; index++) batch.set(adminDb.collection("lead_notes").doc(`${leadId}_${index}`), { tenantId, leadId, text: `${index}` });
  await batch.commit();
  const original = adminDb.runTransaction.bind(adminDb); let committed = false;
  const interceptor = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (!committed) { committed = true; await actor.ref.update({ capabilities: [] }); }
    return result;
  });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId, authority: actor.authority }), /permiss|acesso|capacidade/i); }
  finally { interceptor.mock.restore(); }
  assert.ok((await lead.get()).exists);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get()).size, 20);
});
async function afterManifest(callback: () => Promise<void>) {
  const writer = adminDb.bulkWriter(), prototype = Object.getPrototypeOf(writer);
  await writer.close();
  const original = prototype.close as FirebaseFirestore.BulkWriter["close"];
  let invoked = false;
  const interceptor = mock.method(prototype, "close", async function(this: FirebaseFirestore.BulkWriter) {
    await original.call(this);
    if (!invoked) { invoked = true; await callback(); }
  });
  return () => interceptor.mock.restore();
}
test("a reassignment during lead manifest preparation cannot delete the newly assigned contact", async () => {
  const leadId = `${tenantId}_owner`, ref = adminDb.collection("leads").doc(leadId);
  await ref.set({ tenantId, nome: "Contato ficticio", ownerId: "seller-a" });
  const reset = await afterManifest(async () => { await ref.update({ ownerId: "seller-b" }); });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /alterad|conflit/i); }
  finally { reset(); }
  assert.equal((await ref.get()).data()?.ownerId, "seller-b");
});
test("a note changed after archiving cannot be deleted and replaced by an old copy", async () => {
  const leadId = `${tenantId}_note`, lead = adminDb.collection("leads").doc(leadId), note = adminDb.collection("lead_notes").doc(`${leadId}_note`);
  await lead.set({ tenantId, nome: "Contato ficticio" });
  await note.set({ tenantId, leadId, text: "Original" });
  const reset = await afterManifest(async () => { await note.update({ text: "Correcao humana recente" }); });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /alterad|conflit/i); }
  finally { reset(); }
  assert.equal((await note.get()).data()?.text, "Correcao humana recente");
  assert.ok((await lead.get()).exists);
});
test("a conversation updated while its manifest is prepared stays intact with its messages", async () => {
  const chatId = `${tenantId}_chat`, chat = adminDb.collection("chats").doc(chatId), message = adminDb.collection("messages").doc(`${chatId}_message`);
  await chat.set({ tenantId, contactName: "Contato ficticio", lastMessage: "Original" });
  await message.set({ tenantId, chatId, text: "Original", sender: "client" });
  const reset = await afterManifest(async () => { await chat.update({ lastMessage: "Nova mensagem" }); });
  try { await assert.rejects(deleteTenantChat({ tenantId, chatId }), /alterad|conflit/i); }
  finally { reset(); }
  assert.equal((await chat.get()).data()?.lastMessage, "Nova mensagem"); assert.ok((await message.get()).exists);
  const trash = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", chatId).get();
  assert.equal(trash.size, 1); assert.equal(trash.docs[0].data().deletionState, "conflict");
  await assert.rejects(deleteTenantTrashPermanently({ tenantId, trashId: trash.docs[0].id }), /Exclusao incompleta/);
  assert.ok((await trash.docs[0].ref.get()).exists);
});

test("a record created after the snapshot keeps the parent alive instead of becoming orphaned", async () => {
  const leadId = `${tenantId}_new-note`, ref = adminDb.collection("leads").doc(leadId), note = adminDb.collection("lead_notes").doc(`${leadId}_note`);
  await ref.set({ tenantId, nome: "Contato ficticio" });
  const reset = await afterManifest(async () => { await note.set({ tenantId, leadId, text: "Nova informacao humana" }); });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /alterad|conflit/i); }
  finally { reset(); }
  assert.ok((await ref.get()).exists); assert.equal((await note.get()).data()?.text, "Nova informacao humana");
});

test("an interrupted paged deletion can restore every archived record while the original parent is still present", async () => {
  const leadId = `${tenantId}_partial`, ref = adminDb.collection("leads").doc(leadId);
  await ref.set({ tenantId, nome: "Contato ficticio", ownerId: "seller-a" });
  const batch = adminDb.batch();
  for (let index = 0; index < 220; index++) batch.set(adminDb.collection("lead_notes").doc(`${leadId}_${String(index).padStart(3, "0")}`), { tenantId, leadId, text: `Informacao ${index}` });
  await batch.commit();
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.delete;
  let deletes = 0;
  const interceptor = mock.method(Transaction.prototype, "delete", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith("lead_notes/") && ++deletes === 201) throw new Error("QA_DELETE_INTERRUPTED");
    return original.apply(this, args);
  });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /QA_DELETE_INTERRUPTED/); }
  finally { interceptor.mock.restore(); }
  assert.ok((await ref.get()).exists);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get()).size, 20);
  const trash = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", leadId).get();
  assert.equal(trash.size, 1); assert.equal(trash.docs[0].data().deletionState, "interrupted");
  await restoreTenantTrash({ tenantId, trashId: trash.docs[0].id });
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get()).size, 220);
  assert.equal((await ref.get()).data()?.ownerId, "seller-a");
});

test("partial recovery does not mistake a recreated identical contact for the original document", async () => {
  const leadId = `${tenantId}_recreated`, ref = adminDb.collection("leads").doc(leadId), data = { tenantId, nome: "Contato ficticio", ownerId: "seller-a" };
  await ref.set(data);
  const result = await deleteTenantLead({ tenantId, leadId }); assert.ok(result.trashId);
  await ref.set(data); const before = await ref.get();
  await assert.rejects(restoreTenantTrash({ tenantId, trashId: result.trashId }), /Cliente ja existe/);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
});

test("retention preserves an incomplete deletion without preventing another completed item from expiring", async () => {
  const incomplete = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", `${tenantId}_owner`).get();
  assert.equal(incomplete.size, 1); await incomplete.docs[0].ref.update({ expiresAt: new Date(0) });
  const leadId = `${tenantId}_expired`, ref = adminDb.collection("leads").doc(leadId);
  await ref.set({ tenantId, nome: "Contato ficticio" });
  const result = await deleteTenantLead({ tenantId, leadId }); assert.ok(result.trashId);
  const trashRef = adminDb.collection("tenant_trash").doc(result.trashId);
  await trashRef.update({ expiresAt: new Date(0) });
  const expired = await purgeExpiredTenantTrash({ tenantId });
  assert.ok(expired.purged >= 1); assert.ok(expired.needsReview >= 1);
  assert.equal((await trashRef.get()).exists, false); assert.equal((await incomplete.docs[0].ref.get()).exists, true);
});

test("overlapping deletion requests reserve one archive for the same original opportunity", async () => {
  const leadId = `${tenantId}_overlap`, lead = adminDb.collection("leads").doc(leadId);
  await lead.set({ tenantId, nome: "Contato ficticio" });
  const outcomes: Array<{ deleted: boolean } | Error> = [];
  const run = async () => { try { outcomes.push(await deleteTenantLead({ tenantId, leadId })); } catch (error) { outcomes.push(error as Error); } };
  const reset = await afterManifest(run);
  try { await run(); } finally { reset(); }
  const manifests = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", leadId).get();
  assert.equal(manifests.size, 1, "Concurrent requests must share a single durable reservation");
  assert.equal(outcomes.filter(result => !(result instanceof Error) && result.deleted).length, 1);
  assert.equal(outcomes.filter(result => result instanceof Error).length, 1);
  assert.equal(manifests.docs[0].data().deletionState, "completed");
  assert.equal((await lead.get()).exists, false);
});

test("recreating identical data during archiving cannot authorize deleting the new document generation", async () => {
  const leadId = `${tenantId}_generation`, lead = adminDb.collection("leads").doc(leadId), data = { tenantId, nome: "Contato ficticio" };
  await lead.set(data); const original = await lead.get();
  const reset = await afterManifest(async () => { await lead.delete(); await lead.create(data); });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /alterad|conflit/i); }
  finally { reset(); }
  const current = await lead.get(); assert.ok(current.exists); assert.equal(current.createTime!.isEqual(original.createTime!), false);
  assert.deepEqual(current.data(), data);
});

test("successful recovery permits a later deletion without reusing the previous archive", async () => {
  const leadId = `${tenantId}_delete-again`, lead = adminDb.collection("leads").doc(leadId);
  await lead.set({ tenantId, nome: "Contato ficticio" });
  const first = await deleteTenantLead({ tenantId, leadId }); assert.ok(first.trashId);
  await restoreTenantTrash({ tenantId, trashId: first.trashId });
  const second = await deleteTenantLead({ tenantId, leadId }); assert.ok(second.deleted); assert.ok(second.trashId);
  assert.notEqual(second.trashId, first.trashId);
  assert.equal((await adminDb.collection("tenant_trash").doc(first.trashId).get()).exists, false);
  await restoreTenantTrash({ tenantId, trashId: second.trashId }); assert.ok((await lead.get()).exists);
});

test("lost archive preparation acknowledgement preserves originals and keeps the exclusive reservation", async () => {
  const leadId = `${tenantId}_prepare-failure`, lead = adminDb.collection("leads").doc(leadId);
  await lead.set({ tenantId, nome: "Contato ficticio" });
  const reset = await afterManifest(async () => { throw new Error("QA_ARCHIVE_PREPARATION_ACK_LOST"); });
  try { await assert.rejects(deleteTenantLead({ tenantId, leadId }), /QA_ARCHIVE_PREPARATION_ACK_LOST/); }
  finally { reset(); }
  assert.ok((await lead.get()).exists);
  await assert.rejects(deleteTenantLead({ tenantId, leadId }), /Ja existe uma exclusao/);
  const manifests = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).where("entityId", "==", leadId).get();
  assert.equal(manifests.size, 1); assert.equal(manifests.docs[0].data().manifestComplete, false);
  await assert.rejects(deleteTenantTrashPermanently({ tenantId, trashId: manifests.docs[0].id }), /Manifesto incompleto/);
});
