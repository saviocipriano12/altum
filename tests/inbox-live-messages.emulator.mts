import test from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { initializeApp, deleteApp } = await import("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import("firebase/auth");
const { getFirestore, connectFirestoreEmulator, collection, query, where, orderBy, Timestamp, onSnapshot, terminate } = await import("firebase/firestore");
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { GET } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts");
const { GET: getMedia } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/[messageId]/media/route.ts");
const app = initializeApp({ projectId: "demo-altum-qa-lab", apiKey: "qa-local-only" }, "live-messages-test");
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8080);
const tenantId = "qa-altum-alpha", chatId = `${tenantId}-chat-2`;
test.after(async () => { await terminate(db); await deleteApp(app); await adminDb.terminate(); });
test("authorized realtime captures delivery updates and late messages, and API returns protected content by IDs", async () => {
  const session = await signInWithEmailAndPassword(auth, "owner-alpha@qa.invalid", "QaLabLocalOnly2026!");
  const token = await session.user.getIdToken();
  const changed = new Set<string>();
  let resolveInitial!: () => void;
  let rejectInitial!: (error: unknown) => void;
  const initial = new Promise<void>((resolve, reject) => { resolveInitial = resolve; rejectInitial = reject; });
  const unsubscribe = onSnapshot(query(collection(db, "messages"), where("chatId", "==", chatId), where("createdAt", ">=", Timestamp.fromMillis(1000)), orderBy("createdAt")), (snapshot) => {
    snapshot.docChanges().forEach((change) => changed.add(change.doc.id)); resolveInitial();
  }, rejectInitial);
  const deadline = setTimeout(() => rejectInitial(new Error("Realtime initial snapshot timed out")), 20000);
  const lateId = `qa-live-late-${Date.now()}`;
  const mediaPath = `chat-media/${tenantId}/${chatId}/${lateId}.png`;
  const photoBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  const mediaFile = adminStorage.bucket("demo-altum-qa-lab.appspot.com").file(mediaPath);
  const existingId = `${chatId}-message-0220`;
  try {
    await initial;
    changed.clear();
    await mediaFile.save(photoBytes, { metadata: { contentType: "image/png" }, resumable: false });
    await adminDb.collection("messages").doc(existingId).update({ deliveryStatus: "read" });
    await adminDb.collection("messages").doc(lateId).set({ tenantId, chatId, type: "image", sender: "client", text: "Foto atrasada", createdAt: new Date(2000), mediaUrl: mediaPath });
    const until = Date.now() + 10000;
    while ((!changed.has(existingId) || !changed.has(lateId)) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(changed.has(existingId)); assert.ok(changed.has(lateId));
    const params = new URLSearchParams(); [existingId, lateId].forEach((id) => params.append("id", id));
    const res = await GET(new Request(`http://localhost/messages?${params}`, { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId, chatId }) });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.items.find((item: {id: string}) => item.id === existingId).deliveryStatus, "read");
    const photo = result.items.find((item: {id: string}) => item.id === lateId);
    assert.match(photo.mediaUrl, /^\/api\/tenant\/qa-altum-alpha\/chats\//);
    assert.equal(photo.mediaRecovery, undefined);
    const imageResponse = await getMedia(new Request(`http://localhost${photo.mediaUrl}`, { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId, chatId, messageId: lateId }) });
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), photoBytes);
    const foreign = await GET(new Request(`http://localhost/messages?id=qa-altum-beta-chat-1-message-0001`, { headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId, chatId }) });
    assert.equal(foreign.status, 403);
  } finally {
    clearTimeout(deadline); unsubscribe();
    await adminDb.collection("messages").doc(lateId).delete();
    await mediaFile.delete({ ignoreNotFound: true });
    await adminDb.collection("messages").doc(existingId).update({ deliveryStatus: "delivered" });
  }
});
