import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Fixed loopback only. Run qa-seed-lead-start.mjs first. Never dispatches a job.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const app = initializeApp({ projectId: "demo-altum-qa-lab" }, "qa-lead-start-http");
const db = getFirestore(app);
const tenantId = "qa-altum-alpha";
const leadId = "qa-altum-alpha-lead-start";
const channelId = "qa-altum-alpha-meta-start";
let token = "";
let jobCount = 0;
const body = { leadId, channelId, text: "QA local: preservar este rascunho sem enviar.", clientRequestId: "qa-http-template-start-0001" };
const request = (tenant: string, authenticated = true) => fetch(`http://127.0.0.1:3199/api/tenant/${tenant}/whatsapp/send`, {
  method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
});

before(async () => {
  const [channel, lead] = await Promise.all([
    db.collection("tenant_channels").doc(channelId).get(), db.collection("leads").doc(leadId).get(),
  ]);
  assert.equal(channel.data()?.qaFixture, "lead-start-template-v1");
  assert.equal(channel.data()?.provider, "meta_whatsapp");
  assert.equal(channel.data()?.accessToken, "qa-invalid-token-not-for-external-use");
  assert.equal(lead.data()?.qaFixture, "lead-start-template-v1");
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner-alpha@qa.invalid", password: "QaLabLocalOnly2026!", returnSecureToken: true }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  token = (await response.json()).idToken;
  assert.ok(token);
  jobCount = (await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count;
});
after(async () => { token = ""; await db.terminate(); await deleteApp(app); });

test("HTTP sem autenticacao nao inicia conversa", async () => {
  const response = await request(tenantId, false);
  assert.equal(response.status, 401);
});
test("HTTP operador alpha nao acessa empresa beta", async () => {
  const response = await request("qa-altum-beta");
  assert.equal(response.status, 403);
});
test("HTTP autenticado prepara template uma vez sem mensagem nem job", async () => {
  const first = await request(tenantId);
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.requiresTemplate, true);
  assert.equal(typeof result.chatId, "string");
  const second = await request(tenantId);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).chatId, result.chatId);
  const chat = await db.collection("chats").doc(result.chatId).get();
  assert.equal(chat.data()?.tenantId, tenantId);
  assert.equal(chat.data()?.channelId, channelId);
  assert.equal(chat.data()?.leadId, leadId);
  assert.equal(chat.data()?.requiresTemplate, true);
  assert.equal((await db.collection("chats").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get()).size, 1);
  assert.equal((await db.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", result.chatId).get()).size, 0);
  assert.equal((await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count, jobCount);
});
