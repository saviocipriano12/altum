import test, { after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { recordAiConversationMessage } = await import("../lib/server/ai/agent.ts");
const tenantId = `qa_ai_history_${Date.now()}`, chatId = `${tenantId}_chat`;
const input = { tenantId, chatId, sender: "agent" as const, channel: "whatsapp", senderName: "Assistente ficticio" };
await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", commerceConversationContext: { productId: "qa-product", connectionId: "qa-store" } });
after(async () => {
  for (const collection of ["messages", "chats", "crm_observation_jobs", "crm_observation_receipts", "crm_observation_locks"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("actual AI history writer preserves a long formatted catalog response and its final URL", async () => {
  const text = `  Modelos encontrados:\n\n${Array.from({ length: 40 }, (_, index) => `${index + 1}) Camisa ficticia — modelo ${index + 1}\n   Tamanho G: a confirmar.\n`).join("\n")}\nVeja os detalhes: https://qa.invalid/products/final-model\n🙂  `;
  assert.ok(text.length > 1800);
  const id = await recordAiConversationMessage({ ...input, text, metaMessageId: "wamid.qa-history-only" });
  assert.ok(id);
  const row = (await adminDb.collection("messages").doc(id).get()).data()!;
  assert.equal(row.text, text);
  assert.equal(row.metaMessageId, "wamid.qa-history-only");
  assert.equal(row.aiGenerated, true);
  const chat = (await adminDb.collection("chats").doc(chatId).get()).data()!;
  assert.equal(chat.lastMessage, text);
  assert.deepEqual(chat.commerceConversationContext, { productId: "qa-product", connectionId: "qa-store" });
  const observations = await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).get();
  assert.equal(observations.size, 1);
  assert.equal(observations.docs[0].data().messageId, id);
});

test("text history accepts no empty message but retains audio-only records and format", async () => {
  const before = (await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size;
  assert.equal(await recordAiConversationMessage({ ...input, text: " \n\t " }), undefined);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, before);
  const id = await recordAiConversationMessage({ ...input, text: "", type: "audio", mediaUrl: "qa-only/audio.ogg", voiceReply: true });
  assert.ok(id);
  const audio = (await adminDb.collection("messages").doc(id).get()).data()!;
  assert.equal(audio.text, ""); assert.equal(audio.type, "audio"); assert.equal(audio.voiceReply, true);
  const systemText = "  Operacao ficticia\n  Segunda linha  ";
  const systemId = await recordAiConversationMessage({ ...input, sender: "system", text: systemText });
  assert.ok(systemId);
  assert.equal((await adminDb.collection("messages").doc(systemId).get()).data()?.text, systemText);
});
