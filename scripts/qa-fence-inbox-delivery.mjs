// Isolated UI fixtures only. Prevent after() workers from reaching any provider.
import { createHash } from "node:crypto";
Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { initializeApp, deleteApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-altum-qa-lab" }, "qa-inbox-delivery-fence");
const db = getFirestore(app);
try {
  for (const suffix of ["alpha", "beta"]) {
    const tenantId = `qa-altum-${suffix}`;
    for (const number of [1, 2]) {
      const chatId = `${tenantId}-chat-${number}`;
      const id = createHash("sha256").update(JSON.stringify(["chat-outbound-lock-v1", tenantId, chatId])).digest("hex").slice(0, 48);
      await db.runTransaction(async (transaction) => {
        const chatRef = db.collection("chats").doc(chatId), lockRef = db.collection("chat_outbound_locks").doc(id);
        const [chat, lock] = await transaction.getAll(chatRef, lockRef);
        if (!chat.exists || chat.data()?.tenantId !== tenantId || chat.data()?.qaFixture !== "inbox-v1") throw new Error("QA fixture not verified; no write permitted.");
        if (lock.exists && lock.data()?.jobId !== "qa-ui-dispatch-blocked") throw new Error("Another worker owns the lock; no write permitted.");
        transaction.set(lockRef, { tenantId, chatId, jobId: "qa-ui-dispatch-blocked", leaseToken: "qa-ui-only",
          qaFixture: "inbox-v1", leaseUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) });
        transaction.update(chatRef, { contactPhone: suffix === "alpha" ? `551100000000${number}` : `551100000001${number}` });
      });
    }
  }
  console.log(JSON.stringify({ projectId: "demo-altum-qa-lab", qaDispatchFences: 4, validHours: 2, externalDispatchBlockedByFence: true }));
} finally { await db.terminate(); await deleteApp(app); }
