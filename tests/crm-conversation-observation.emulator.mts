import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-crm-observer";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_crm_observer_${suffix}`;
const otherTenantId = `tenant_crm_observer_other_${suffix}`;
const leadId = `lead_crm_observer_${suffix}`;
const chatId = `chat_crm_observer_${suffix}`;

Object.assign(process.env, { FIREBASE_PROJECT_ID: PROJECT_ID, NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let crmObservationJobId: typeof import("../lib/server/crm/conversation-observation-queue.ts").crmObservationJobId;
let enqueueConversationCommercialObservation: typeof import("../lib/server/crm/conversation-observation-queue.ts").enqueueConversationCommercialObservation;
let processConversationCommercialObservationJobs: typeof import("../lib/server/crm/conversation-observation-queue.ts").processConversationCommercialObservationJobs;
let reprocessConversationCommercialObservationJob: typeof import("../lib/server/crm/conversation-observation-queue.ts").reprocessConversationCommercialObservationJob;
let reconcileTenantConversationCommercialObservations: typeof import("../lib/server/crm/conversation-observation-queue.ts").reconcileTenantConversationCommercialObservations;

async function seedMessage(id: string, sender: "client" | "agent" | "system", text: string, overrides: Record<string, unknown> = {}) {
  await adminDb.collection("messages").doc(id).set({
    tenantId,
    chatId,
    leadId,
    sender,
    text,
    createdAt: new Date(),
    ...overrides,
  });
}

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  ({
    crmObservationJobId,
    enqueueConversationCommercialObservation,
    processConversationCommercialObservationJobs,
    reprocessConversationCommercialObservationJob,
    reconcileTenantConversationCommercialObservations,
  } = await import("../lib/server/crm/conversation-observation-queue.ts"));
  await Promise.all([
    adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId }),
    adminDb.collection("leads").doc(leadId).set({
      tenantId,
      nome: "Lead de teste",
      status: "novo",
      stage: "captado",
      pipelineStage: "captado",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "whatsapp", createdAt: new Date() }),
  ]);
});

after(async () => {
  const events = await adminDb.collection("leads").doc(leadId).collection("events").get();
  await Promise.all(events.docs.map((doc) => doc.ref.delete()));
  for (const collection of [
    "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "lead_tasks",
    "messages", "chats", "audit_logs", "tenant_settings", "leads",
  ]) {
    const snapshots = await adminDb.collection(collection).where("tenantId", "in", [tenantId, otherTenantId]).get();
    await Promise.all(snapshots.docs.map((doc) => adminDb.recursiveDelete(doc.ref)));
  }
  await adminDb.terminate();
});

test("20 enfileiramentos concorrentes criam um unico recibo operacional", async () => {
  const messageId = `message_client_${suffix}`;
  await seedMessage(messageId, "client", "Quero uma proposta para minha empresa em Recife");
  const results = await Promise.all(Array.from({ length: 20 }, () => enqueueConversationCommercialObservation({
    tenantId, chatId, messageId, source: "inbound_message",
  })));
  assert.equal(new Set(results.map((item) => item.jobId)).size, 1);
  assert.equal((await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).get()).size, 1);
});

test("mensagem do cliente atualiza CRM uma vez e repeticao nao duplica evento", async () => {
  const messageId = `message_client_${suffix}`;
  const jobId = crmObservationJobId(tenantId, messageId);
  const first = await processConversationCommercialObservationJobs({ jobId, limit: 1 });
  assert.equal(first.results[0]?.status, "completed");
  const [job, receipt, lead, events] = await Promise.all([
    adminDb.collection("crm_observation_jobs").doc(jobId).get(),
    adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", messageId).get().then(snapshot => snapshot.docs[0]),
    adminDb.collection("leads").doc(leadId).get(),
    adminDb.collection("leads").doc(leadId).collection("events").where("evidenceMessageId", "==", messageId).get(),
  ]);
  assert.equal(job.data()?.status, "completed");
  assert.equal(receipt.data()?.status, "completed");
  assert.equal(lead.data()?.aiLastConversationMessageId, messageId);
  assert.equal(events.docs.filter(doc => doc.data().type === "crm_conversation_observed").length, 1);
  const historySize = (await adminDb.collection("leads").doc(leadId).collection("events").get()).size;
  const second = await processConversationCommercialObservationJobs({ jobId, limit: 1 });
  assert.equal(second.results[0]?.status, "skipped");
  assert.equal((await adminDb.collection("leads").doc(leadId).collection("events").get()).size, historySize);
});

test("mensagens humanas e da IA tambem alimentam o CRM com evidencia correta", async () => {
  const humanId = `message_human_${suffix}`;
  const aiId = `message_ai_${suffix}`;
  await seedMessage(humanId, "agent", "Enviei a proposta comercial para voce");
  await seedMessage(aiId, "agent", "Posso agendar uma reuniao para demonstracao", { aiGenerated: true });
  for (const [messageId, source] of [[humanId, "human_outbound"], [aiId, "ai_outbound"]] as const) {
    const queued = await enqueueConversationCommercialObservation({ tenantId, chatId, messageId, source });
    const processed = await processConversationCommercialObservationJobs({ jobId: queued.jobId, limit: 1 });
    assert.equal(processed.results[0]?.status, "completed");
    const receipt = (await adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", messageId).get()).docs[0];
    assert.equal(receipt.data()?.source, "agent");
  }
  const lead = await adminDb.collection("leads").doc(leadId).get();
  assert.equal(lead.data()?.aiFieldEvidence?.["custom.cidade"]?.source, "customer_message");
});

test("lease vencido e recuperado sem dois workers processarem juntos", async () => {
  const messageId = `message_lease_${suffix}`;
  await seedMessage(messageId, "client", "Gostaria de marcar uma reuniao");
  const queued = await enqueueConversationCommercialObservation({ tenantId, chatId, messageId });
  const ref = adminDb.collection("crm_observation_jobs").doc(queued.jobId);
  await ref.set({ status: "processing", leaseToken: "worker-antigo", leaseUntil: new Date(Date.now() - 60_000) }, { merge: true });
  const result = await processConversationCommercialObservationJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(result.results[0]?.status, "completed");
  assert.equal((await ref.get()).data()?.recoveredLease, true);
});

test("dead letter pode ser reprocessada manualmente e deixa trilha de auditoria", async () => {
  const messageId = `message_dead_${suffix}`;
  await seedMessage(messageId, "client", "Preciso falar com uma pessoa");
  const queued = await enqueueConversationCommercialObservation({ tenantId, chatId, messageId });
  const ref = adminDb.collection("crm_observation_jobs").doc(queued.jobId);
  await ref.set({ status: "dead_letter", attempts: 5, error: "falha simulada" }, { merge: true });
  const reset = await reprocessConversationCommercialObservationJob({ tenantId, jobId: queued.jobId, actorId: "user-a" });
  assert.equal(reset.status, "ready");
  const audits = await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).where("targetId", "==", queued.jobId).get();
  assert.equal(audits.size, 1);
});

test("reconciliacao recupera mensagens sem job e respeita tenant e mensagens de sistema", async () => {
  const missingId = `message_missing_${suffix}`;
  const systemId = `message_system_${suffix}`;
  const foreignId = `message_foreign_${suffix}`;
  await seedMessage(missingId, "client", "Meu orcamento e de cinco mil reais");
  await seedMessage(systemId, "system", "Conversa criada");
  await adminDb.collection("messages").doc(foreignId).set({ tenantId: otherTenantId, chatId, leadId, sender: "client", text: "Outro tenant" });
  const result = await reconcileTenantConversationCommercialObservations(tenantId, 100);
  assert.ok(result.createdJobs >= 1);
  assert.equal((await adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(tenantId, missingId)).get()).exists, true);
  assert.equal((await adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(tenantId, systemId)).get()).exists, false);
  assert.equal((await adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(otherTenantId, foreignId)).get()).exists, false);
});
