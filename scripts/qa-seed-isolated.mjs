import net from "node:net";

const projectId = "demo-altum-qa-lab";
for (const port of [9099, 8080]) {
  const listening = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(1800);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
  if (!listening) throw new Error(`QA blocked: local emulator on port ${port} is not running.`);
}
// No dotenv loading, certificate, production app or imported demo seeder.
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
const app = initializeApp({ projectId }, "isolated-inbox-seed");
const auth = getAuth(app);
const db = getFirestore(app);
const password = "QaLabLocalOnly2026!";
for (const suffix of ["alpha", "beta"]) {
  const tenantId = `qa-altum-${suffix}`;
  const uid = `${tenantId}-owner`;
  const email = `owner-${suffix}@qa.invalid`;
  try { await auth.getUser(uid); }
  catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    await auth.createUser({ uid, email, password, emailVerified: true, displayName: `Operador QA ${suffix}` });
  }
  const common = { tenantId, qaFixture: "inbox-v1", updatedAt: Timestamp.now() };
  const name = `Empresa QA ${suffix}`;
  const batch = db.batch();
  const put = (collection, id, data) => batch.set(db.collection(collection).doc(id), { ...common, ...data });
  put("tenants", tenantId, { name, status: "active", billingStatus: "active", accessStatus: "active", clientId: tenantId });
  put("tenant_settings", tenantId, { name, ai: { enabled: false, responsePaused: true } });
  put("users", uid, { uid, email, name, role: "client_owner", status: "active" });
  put("client_portal_users", uid, { uid, email, name, tenantName: name, clientId: tenantId, role: "client_owner", status: "active" });
  put("tenant_users", `${tenantId}_${uid}`, { userId: uid, email, name, role: "client_owner", status: "active", isDefault: true });
  put("tenant_entitlements", tenantId, { version: 1, mode: "custom", modules: { inbox: true, crm: true, whatsapp: true, ai: true }, limits: {}, isLegacyFallback: false });
  for (const number of [1, 2]) {
    const chatId = `${tenantId}-chat-${number}`;
    const leadId = `${tenantId}-lead-${number}`;
    put("leads", leadId, { nome: `Contato QA ${suffix} ${number}`, stage: "new", pipelineStage: "new", ownerId: uid, channel: "whatsapp" });
    put("chats", chatId, { contactName: `Contato QA ${suffix} ${number}`, leadId, channel: "whatsapp", status: "open", assignedTo: uid,
      lastMessage: "Mensagem ficticia de teste", lastMessageTime: Timestamp.now(), createdAt: Timestamp.now() });
    put("chat_state", chatId, { chatId, aiEnabled: false });
    for (let index = 1; index <= 220; index += 1) {
      put("messages", `${chatId}-message-${String(index).padStart(4, "0")}`, {
        chatId, leadId, type: "text", sender: index % 2 ? "client" : "agent", text: `Mensagem QA ${suffix}/${number}/${index}`,
        createdAt: Timestamp.fromMillis(Date.now() - (221 - index) * 10000), status: "delivered" });
    }
  }
  // 453 documents: below Firestore's batch limit; every record has its tenant ID.
  await batch.commit();
  console.log(JSON.stringify({ seeded: true, projectId, tenantId, email, chats: 2, messages: 440 }));
}
const counts = {};
for (const suffix of ["alpha", "beta"]) {
  const tenantId = `qa-altum-${suffix}`;
  counts[tenantId] = (await db.collection("messages").where("tenantId", "==", tenantId).count().get()).data().count;
  if (counts[tenantId] !== 440) throw new Error("QA seed tenant preservation failed.");
}
console.log(JSON.stringify({ verifiedBothTenantsPreserved: true, counts }));
await db.terminate();
