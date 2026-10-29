// Fixed emulator-only UI fixture. Never dispatch or call a messaging provider.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp, deleteApp } = await import("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = await import("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-altum-qa-lab" }, "qa-verify-lead-start-ui");
const db = getFirestore(app);
const tenantId = "qa-altum-alpha";
const leadId = "qa-altum-alpha-lead-start-ui";
try {
  if (process.argv.includes("--simulate-inbound") && process.argv.includes("--close-window")) throw new Error("Conflicting QA actions");
  const lead = await db.collection("leads").doc(leadId).get();
  if (lead.data()?.qaFixture !== "lead-start-template-v1") throw new Error("Wrong QA fixture");
  const chats = await db.collection("chats").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get();
  if (chats.size !== 1) throw new Error("Expected one canonical chat");
  const chat = chats.docs[0];
  if (chat.data()?.channelId !== "qa-altum-alpha-meta-start" || chat.data()?.contactPhone !== "5511000000098") throw new Error("Wrong QA destination");
  const messages = await db.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", chat.id).get();
  const jobs = await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get();
  if (messages.size || jobs.size) throw new Error("Unexpected message/job in isolated QA tenant");
  if (process.argv.includes("--simulate-inbound")) {
    await chat.ref.update({ requiresTemplate: false, lastClientMessageAt: Timestamp.now() });
  }
  if (process.argv.includes("--close-window")) {
    await chat.ref.update({ requiresTemplate: true, lastClientMessageAt: FieldValue.delete() });
  }
  console.log(JSON.stringify({ projectId: "demo-altum-qa-lab", tenantId, chats: chats.size,
    messages: messages.size, jobs: jobs.size, simulatedInboundWindow: process.argv.includes("--simulate-inbound"), closedWindow: process.argv.includes("--close-window") }));
} finally { await db.terminate(); await deleteApp(app); }
