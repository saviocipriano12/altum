import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-tenant-trash";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_trash_${suffix}`;
const chatId = `chat_trash_${suffix}`;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.FIREBASE_STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
process.env.GCLOUD_PROJECT = PROJECT_ID;

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let adminStorage: typeof import("../app/lib/server/firebase-admin.ts").adminStorage;
let deleteTenantChat: typeof import("../lib/server/tenant-data-deletion.ts").deleteTenantChat;
let restoreTenantTrash: typeof import("../lib/server/tenant-data-deletion.ts").restoreTenantTrash;
let deleteTenantTrashPermanently: typeof import("../lib/server/tenant-data-deletion.ts").deleteTenantTrashPermanently;

before(async () => {
  ({ adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts"));
  ({ deleteTenantChat, restoreTenantTrash, deleteTenantTrashPermanently } = await import("../lib/server/tenant-data-deletion.ts"));
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, dataRetention: { trashDays: 45 } });
});

after(async () => {
  for (const name of ["tenant_trash", "messages", "chats", "deletion_certificates", "tenant_settings"]) {
    const snap = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    for (const doc of snap.docs) await adminDb.recursiveDelete(doc.ref);
  }
});

test("conversa com 2.001 mensagens e anexos restaura integralmente", async () => {
  const paths = [`chat-media/${tenantId}/${chatId}/a.jpg`, `chat-media/${tenantId}/${chatId}/b.pdf`];
  await Promise.all(paths.map((path, index) => adminStorage.bucket(process.env.FIREBASE_STORAGE_BUCKET!).file(path).save(Buffer.from(`file-${index}`))));
  await adminDb.collection("chats").doc(chatId).set({ tenantId, contactName: "Cliente restauravel" });
  const writer = adminDb.bulkWriter();
  for (let index = 0; index < 2001; index += 1) {
    writer.set(adminDb.collection("messages").doc(`trash_message_${suffix}_${String(index).padStart(4, "0")}`), {
      tenantId, chatId, text: `mensagem ${index}`, ...(index < paths.length ? { storagePath: paths[index] } : {}),
    });
  }
  await writer.close();
  const removed = await deleteTenantChat({ tenantId, chatId });
  assert.equal(removed.deleted, true);
  assert.equal((await adminDb.collection("messages").where("chatId", "==", chatId).get()).size, 0);
  const trash = await adminDb.collection("tenant_trash").doc(removed.trashId).get();
  assert.equal(trash.data()?.manifestComplete, true);
  assert.equal(trash.data()?.expectedDocumentCount, 2002);
  assert.equal(trash.data()?.storageObjectCount, 2);
  assert.equal(trash.data()?.retentionDays, 45);
  assert.equal(await adminStorage.bucket(process.env.FIREBASE_STORAGE_BUCKET!).file(paths[0]).exists().then(([exists]) => exists), true);
  const restored = await restoreTenantTrash({ tenantId, trashId: removed.trashId! });
  assert.equal(restored.restored, 2002);
  assert.equal((await adminDb.collection("messages").where("chatId", "==", chatId).get()).size, 2001);
  assert.equal((await adminDb.collection("chats").doc(chatId).get()).exists, true);
});

test("expurgo remove Firestore e Storage e gera comprovante", async () => {
  const removed = await deleteTenantChat({ tenantId, chatId });
  const result = await deleteTenantTrashPermanently({ tenantId, trashId: removed.trashId! });
  assert.equal(result.documentCount, 2002);
  assert.equal(result.storageObjectCount, 2);
  assert.equal((await adminDb.collection("deletion_certificates").doc(result.certificateId).get()).data()?.status, "completed");
  assert.equal((await adminStorage.bucket(process.env.FIREBASE_STORAGE_BUCKET!).file(`chat-media/${tenantId}/${chatId}/a.jpg`).exists())[0], false);
});

test("manifesto incompleto bloqueia restauracao e expurgo", async () => {
  const ref = adminDb.collection("tenant_trash").doc(`incomplete_${suffix}`);
  await ref.set({ tenantId, status: "incomplete", manifestComplete: false, expectedDocumentCount: 2 });
  await ref.collection("documents").doc("one").set({ collection: "chats", id: "x", data: { tenantId } });
  await assert.rejects(() => restoreTenantTrash({ tenantId, trashId: ref.id }), /Manifesto incompleto/);
  await assert.rejects(() => deleteTenantTrashPermanently({ tenantId, trashId: ref.id }), /Manifesto incompleto/);
});
