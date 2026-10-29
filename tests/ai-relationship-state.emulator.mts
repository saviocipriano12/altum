import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-relationship-state";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_relationship_${suffix}`;
const leadId = `lead_${suffix}`;
const chatId = `chat_${suffix}`;
Object.assign(process.env, { FIREBASE_PROJECT_ID: PROJECT_ID, NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "",
  FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let runtime: typeof import("../lib/server/ai/runtime-state.ts");
let relationship: typeof import("../lib/server/ai/relationship-state.ts");

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  runtime = await import("../lib/server/ai/runtime-state.ts");
  relationship = await import("../lib/server/ai/relationship-state.ts");
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "site_chat" });
});

after(async () => {
  await Promise.all([
    adminDb.collection("ai_lead_memory").doc(runtime.getLeadMemoryDocId(tenantId, leadId)).delete(),
    adminDb.collection("ai_conversation_state").doc(runtime.getConversationRuntimeDocId(tenantId, chatId)).delete(),
    adminDb.collection("chats").doc(chatId).delete(),
  ]);
  await adminDb.terminate();
});

test("memoria transacional isola identidade, aplica correcao e rejeita evento atrasado", async () => {
  const now = Date.now();
  const identityA = relationship.buildRelationshipIdentityKey({ tenantId, kind: "phone", value: "+5511999990000" });
  const identityB = relationship.buildRelationshipIdentityKey({ tenantId, kind: "phone", value: "+5511888880000" });

  await runtime.upsertLeadMemory({
    tenantId,
    leadId,
    inboundText: "Somos uma imobiliaria.",
    extractedFields: { businessType: "imobiliaria" },
    sourceOccurredAtMs: now,
    sourceMessageId: "m-new",
    identityKey: identityA,
  });
  const first = await runtime.getLeadMemory(tenantId, leadId, identityA);
  assert.equal(first?.businessType, "imobiliaria");
  assert.equal(first?.relationshipState?.revision, 1);
  assert.equal(await runtime.getLeadMemory(tenantId, leadId, identityB), null);

  const late = await runtime.upsertLeadMemory({
    tenantId,
    leadId,
    inboundText: "Corrigindo: somos uma agencia.",
    extractedFields: { businessType: "agencia" },
    sourceOccurredAtMs: now - 10_000,
    sourceMessageId: "m-old",
    identityKey: identityA,
  });
  assert.equal(late.applied, false);
  assert.equal(late.reason, "out_of_order");
  assert.equal((await runtime.getLeadMemory(tenantId, leadId, identityA))?.businessType, "imobiliaria");

  const corrected = await runtime.upsertLeadMemory({
    tenantId,
    leadId,
    inboundText: "Corrigindo: nao somos uma imobiliaria, somos uma clinica odontologica.",
    extractedFields: { businessType: "clinica odontologica" },
    sourceOccurredAtMs: now + 10_000,
    sourceMessageId: "m-correction",
    identityKey: identityA,
  });
  assert.equal(corrected.applied, true);
  const current = await runtime.getLeadMemory(tenantId, leadId, identityA);
  assert.equal(current?.businessType, "clinica odontologica");
  assert.equal(current?.relationshipState?.facts.businessType.previousValues?.[0]?.value, "imobiliaria");
});

test("estado da conversa nao regride com escrita concorrente fora de ordem", async () => {
  const now = Date.now();
  await runtime.upsertConversationRuntimeState({
    tenantId,
    chatId,
    leadId,
    inboundText: "Quero a proposta final.",
    decision: "respond",
    reason: "ready",
    stage: "proposal_path",
    sourceOccurredAtMs: now,
    sourceMessageId: "turn-new",
    activeSpecialist: "closer",
    specialistSupervisorVersion: "specialist-supervisor-v1",
    specialistTransferReason: "qualified_closing_intent",
    specialistDecisionKey: "decision-new",
  });
  const late = await runtime.upsertConversationRuntimeState({
    tenantId,
    chatId,
    leadId,
    inboundText: "Oi",
    decision: "respond",
    reason: "late",
    stage: "greeting",
    sourceOccurredAtMs: now - 5_000,
    sourceMessageId: "turn-old",
  });
  assert.equal(late.applied, false);
  const state = await runtime.getConversationRuntimeState(tenantId, chatId);
  assert.equal(state?.stage, "proposal_path");
  assert.equal(state?.activeSpecialist, "closer");
  assert.equal(state?.specialistDecisionKey, "decision-new");
});
