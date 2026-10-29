import assert from "node:assert/strict";
import test, { after } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_PRIVATE_KEY: "", FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "synthetic-test-key" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enrichInboundMessageForAgent: enrich } = await import("../lib/server/ai/multimodal.ts");
const { observedMessageContent } = await import("../lib/server/ai/inbound-enrichment-source.ts");
const tenantId = `qa_media_errors_${Date.now()}`; let seq = 0;
const originalFetch = globalThis.fetch;
let response: unknown = { text: "" };
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/api\.openai\.com\/(?:v1\/audio\/transcriptions|v1\/chat\/completions)$/);
  assert.ok(init?.signal, "External media requests must have a timeout signal");
  return Response.json(response);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const name of ["leads", "chats", "messages", "crm_observation_jobs"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
});
async function fixture(type: "audio" | "image") {
  const id = `${tenantId}_${++seq}`, leadId = `${id}_lead`, chatId = `${id}_chat`, messageId = `${id}_message`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId });
  const message = adminDb.collection("messages").doc(messageId);
  await message.set({ tenantId, leadId, chatId, sender: "client", type, text: "", createdAt: new Date(),
    mediaUrl: `data:${type === "audio" ? "audio/wav" : "image/png"};base64,${Buffer.from("synthetic_media_for_mocked_transport").toString("base64")}` });
  const input = { tenantId, chatId, messageId };
  return { message, run: async () => enrich({ ...input, message: (await message.get()).data()! }) };
}
test("empty transcription is an explicit error, and a later success clears that error", async () => {
  const f = await fixture("audio"); response = { text: "" };
  assert.equal((await f.run()).source, "fallback");
  assert.equal((await f.message.get()).data()?.aiMediaProcessError, "audio_transcription_empty");
  response = { text: "Meu orçamento é 3000 reais" };
  assert.equal((await f.run()).source, "audio");
  const current = await f.message.get(); assert.equal(current.data()?.aiMediaProcessError, null);
  assert.equal(observedMessageContent(current.data()!, current.createTime).kind, "audio_transcription");
  assert.equal((await f.run()).source, "cached");
});
test("refused, truncated and invalid visual responses cannot become successful image interpretation", async () => {
  for (const choice of [
    { finish_reason: "length", message: { content: "{}" } },
    { finish_reason: "stop", message: { refusal: "not_available" } },
    { finish_reason: "stop", message: { content: "Not valid JSON" } },
    { finish_reason: "stop", message: { content: "{}" } },
  ]) {
    const f = await fixture("image"); response = { choices: [choice] };
    assert.equal((await f.run()).source, "fallback");
    const row = await f.message.get();
    assert.ok(row.data()?.aiMediaProcessError);
    assert.equal(observedMessageContent(row.data()!, row.createTime).mediaContext, null);
  }
});
test("valid visual interpretation is retained as reviewable context, never a buyer budget", async () => {
  const f = await fixture("image"); response = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
    summary: "Proposta de camiseta azul por R$ 1200", intent: "proof_or_document", category: "vestuário", colors: ["azul"],
    materials: [], styles: [], attributes: [], visibleText: "R$ 1200", searchQuery: "camiseta azul",
  }) } }] };
  assert.equal((await f.run()).source, "image");
  const row = await f.message.get(), content = observedMessageContent(row.data()!, row.createTime);
  assert.equal(content.text, ""); assert.equal(content.mediaContext?.kind, "image");
  assert.equal(content.mediaContext?.reviewRequired, true); assert.match(content.mediaContext?.text || "", /1200/);
});
