import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-chat-outbound";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_outbound_${suffix}`;
const chatId = `chat_outbound_${suffix}`;

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.GCLOUD_PROJECT = PROJECT_ID;
Object.assign(process.env, { FIREBASE_PROJECT_ID: PROJECT_ID, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let queueTenantChatText: typeof import("../lib/server/chat-outbound.ts").queueTenantChatText;
let queueTenantChatMedia: typeof import("../lib/server/chat-outbound.ts").queueTenantChatMedia;
let processChatOutboundJobs: typeof import("../lib/server/chat-outbound.ts").processChatOutboundJobs;
let reprocessTenantChatOutboundJob: typeof import("../lib/server/chat-outbound.ts").reprocessTenantChatOutboundJob;

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  ({ queueTenantChatText, queueTenantChatMedia, processChatOutboundJobs, reprocessTenantChatOutboundJob } = await import("../lib/server/chat-outbound.ts"));
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", assignedTo: "user-a" });
});

after(async () => {
  for (const collection of ["chat_outbound_jobs", "chat_outbound_locks", "messages", "chat_state", "audit_logs", "chats"]) {
    const snapshots = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(snapshots.docs.map((doc) => doc.ref.delete()));
  }
});

test("20 envios concorrentes de texto criam uma unica operacao", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => queueTenantChatText({
    tenantId, chatId, text: "Ola, tudo bem?", clientRequestId: "request-text-12345678",
    actor: { id: "user-a", name: "Atendente" },
  })));
  assert.equal(new Set(results.map((item) => item.jobId)).size, 1);
  assert.equal(new Set(results.map((item) => item.messageId)).size, 1);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 1);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, 1);
});

test("reutilizar a chave com outro texto e bloqueado", async () => {
  await assert.rejects(() => queueTenantChatText({
    tenantId, chatId, text: "Conteudo alterado", clientRequestId: "request-text-12345678",
    actor: { id: "user-a", name: "Atendente" },
  }), /outro conteudo/);
});

test("midia repetida tambem preserva uma unica mensagem e job", async () => {
  const input = {
    tenantId, chatId, mediaType: "image" as const, storagePath: `chat-media/${tenantId}/${chatId}/image.jpg`,
    mediaSize: 1234, filename: "image.jpg", contentType: "image/jpeg", clientRequestId: "request-media-12345678",
    actor: { id: "user-a", name: "Atendente" },
  };
  const [first, second] = await Promise.all([queueTenantChatMedia(input), queueTenantChatMedia(input)]);
  assert.equal(first.jobId, second.jobId);
  assert.equal(first.messageId, second.messageId);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 2);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, 2);
});

test("jobs da mesma conversa formam uma cadeia ordenada", async () => {
  const orderedChatId = `chat_ordered_${suffix}`;
  await adminDb.collection("chats").doc(orderedChatId).set({ tenantId, channel: "whatsapp", assignedTo: "user-a" });
  const first = await queueTenantChatText({ tenantId, chatId: orderedChatId, text: "Primeira", clientRequestId: "ordered-request-0001", actor: { id: "user-a", name: "Atendente" } });
  const second = await queueTenantChatText({ tenantId, chatId: orderedChatId, text: "Segunda", clientRequestId: "ordered-request-0002", actor: { id: "user-a", name: "Atendente" } });
  const [firstJob, secondJob] = await Promise.all([
    adminDb.collection("chat_outbound_jobs").doc(first.jobId).get(),
    adminDb.collection("chat_outbound_jobs").doc(second.jobId).get(),
  ]);
  assert.equal(firstJob.data()?.sequence, 1);
  assert.equal(secondJob.data()?.sequence, 2);
  assert.equal(secondJob.data()?.predecessorJobId, first.jobId);
  const blocked = await processChatOutboundJobs({ jobId: second.jobId, limit: 1 });
  assert.equal(blocked.results[0]?.status, "skipped");
});

test("lease vencido e recuperado e falha permanente vai para dead letter", async () => {
  const leaseChatId = `chat_lease_${suffix}`;
  await adminDb.collection("chats").doc(leaseChatId).set({ tenantId, channel: "whatsapp", assignedTo: "user-a" });
  const queued = await queueTenantChatText({ tenantId, chatId: leaseChatId, text: "Teste de lease", clientRequestId: "lease-request-0001", actor: { id: "user-a", name: "Atendente" } });
  await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).set({ status: "processing", leaseUntil: new Date(Date.now() - 60_000), leaseToken: "worker-antigo",
    leaseDeliveryProtocolVersion: 1, leaseDeliveryProtocolToken: "worker-antigo" }, { merge: true });
  const processed = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(processed.results[0]?.status, "dead_letter");
  const job = await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get();
  assert.equal(job.data()?.recoveredLease, true);
  assert.equal(job.data()?.leaseUntil, null);
});

test("lease ativo impede um segundo worker de assumir o mesmo envio", async () => {
  const activeChatId = `chat_active_lease_${suffix}`;
  await adminDb.collection("chats").doc(activeChatId).set({ tenantId, channel: "whatsapp", assignedTo: "user-a" });
  const queued = await queueTenantChatText({ tenantId, chatId: activeChatId, text: "Lease ativo", clientRequestId: "active-lease-request-0001", actor: { id: "user-a", name: "Atendente" } });
  const jobRef = adminDb.collection("chat_outbound_jobs").doc(queued.jobId);
  await jobRef.set({ status: "processing", attempts: 1, leaseUntil: new Date(Date.now() + 120_000), leaseToken: "worker-ativo" }, { merge: true });
  const result = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(result.results[0]?.status, "skipped");
  assert.equal((await jobRef.get()).data()?.attempts, 1);
});

test("reprocessamento exige confirmacao quando o resultado do provedor e incerto", async () => {
  const job = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "dead_letter").limit(1).get()).docs[0];
  assert.ok(job);
  const retried = await reprocessTenantChatOutboundJob({ tenantId, jobId: job.id, actorId: "user-a", actorName: "Atendente" });
  assert.equal(retried.status, "ready");
  await job.ref.set({ status: "reconciliation_required" }, { merge: true });
  await assert.rejects(() => reprocessTenantChatOutboundJob({ tenantId, jobId: job.id, actorId: "user-a" }), /Confirme/);
  const confirmed = await reprocessTenantChatOutboundJob({ tenantId, jobId: job.id, actorId: "user-a", confirmedNotDelivered: true });
  assert.equal(confirmed.status, "ready");
});
