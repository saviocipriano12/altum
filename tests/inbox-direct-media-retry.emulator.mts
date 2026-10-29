import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage as adminStorage } from "firebase-admin/storage";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getStorage, connectStorageEmulator, ref, uploadBytesResumable, getMetadata } from "firebase/storage";
import { sendInboxDirectMedia, waitForInboxUpload } from "../lib/inbox-upload.ts";

Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199" });

test("real authenticated create-only Storage permits retry only when completed upload is reused", { timeout: 60000 }, async () => {
  const projectId = "demo-altum-qa-lab";
  const tenantId = `qa_direct_retry_${Date.now()}`;
  const uid = `${tenantId}_owner`, chatId = `${tenantId}_chat`;
  const path = `chat-media/${tenantId}/${chatId}/${uid}/request-one.txt`;
  const admin = initializeAdmin({ projectId }, tenantId);
  const db = getFirestore(admin);
  const authAdmin = adminAuth(admin);
  const bucket = adminStorage(admin).bucket(`${projectId}.appspot.com`);
  const client = initializeApp({ projectId, apiKey: "qa-local-only", storageBucket: `${projectId}.appspot.com` }, tenantId);
  const auth = getAuth(client);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const storage = getStorage(client);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  storage.maxUploadRetryTime = 5000;
  const membership = db.collection("tenant_users").doc(`${tenantId}_${uid}`);
  try {
    await authAdmin.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaLocalRetry2026!" });
    await membership.set({ tenantId, userId: uid, status: "active", role: "client_owner" });
    await signInWithEmailAndPassword(auth, `${uid}@qa.invalid`, "QaLocalRetry2026!");
    const bytes = new TextEncoder().encode("Original immutable fixture");
    const target = ref(storage, path);
    const upload = () => waitForInboxUpload(uploadBytesResumable(target, bytes, {
      contentType: "text/plain", customMetadata: { tenantId, chatId, uploadedBy: uid },
    }), () => {}, 10000);
    let uploads = 0, dispatches = 0;
    const input = { attempt: Object.freeze({ caption: "", replyToId: null, composerText: null }), file: bytes, storagePath: path,
      upload: async () => { uploads++; await upload(); },
      sendStored: async () => { if (++dispatches === 1) throw new Error("simulated lost API acknowledgement"); return "same-job"; },
      sendPanel: async () => { throw new Error("transport must not change"); }, allowPanelFallback: true };
    await assert.rejects(sendInboxDirectMedia(input), /lost API acknowledgement/);
    const before = await getMetadata(target);
    // Reproduce the previous UI algorithm against the actual current rules.
    await assert.rejects(upload(), (error: unknown) => (error as { code?: string }).code === "storage/unauthorized");
    assert.equal(await sendInboxDirectMedia(input), "same-job");
    const after = await getMetadata(target);
    assert.equal(after.generation, before.generation);
    assert.deepEqual((await bucket.file(path).download())[0], Buffer.from(bytes));
    assert.deepEqual([uploads, dispatches], [1, 2]);
    assert.equal((await bucket.getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 1);
  } finally {
    await signOut(auth);
    await bucket.file(path).delete({ ignoreNotFound: true });
    await membership.delete();
    await authAdmin.deleteUser(uid).catch((error: { code?: string }) => { if (error.code !== "auth/user-not-found") throw error; });
    await deleteApp(client); await db.terminate(); await deleteAdmin(admin);
  }
});
