import assert from "node:assert/strict";
import test from "node:test";
import { mergeRelationshipState } from "../lib/server/ai/relationship-state.ts";
import {
  AI_SPECIALIST_SUPERVISOR_VERSION,
  specialistSupervisorInstruction,
  superviseAiSpecialist,
} from "../lib/server/ai/specialist-supervisor.ts";
import type { AltumLeadMemory } from "../lib/server/ai/runtime-state.ts";

const relationshipState = mergeRelationshipState({
  tenantId: "tenant-a",
  leadId: "lead-a",
  occurredAtMs: 10_000,
  nowMs: 10_000,
  sourceMessageId: "known-context",
  inboundText: "Somos uma clinica e queremos reduzir demora no atendimento.",
  extractedFields: { businessType: "clinica", primaryGoal: "reduzir demora no atendimento" },
}).state;
const memory = {
  tenantId: "tenant-a",
  leadId: "lead-a",
  businessType: "clinica",
  primaryGoal: "reduzir demora no atendimento",
  relationshipState,
} as AltumLeadMemory;

function decision(input: Partial<Parameters<typeof superviseAiSpecialist>[0]> = {}) {
  return superviseAiSpecialist({
    tenantId: "tenant-a",
    chatId: "chat-a",
    messageId: "message-a",
    configuredRole: "sdr",
    inboundText: "Pode continuar.",
    runtimeState: null,
    leadMemory: memory,
    ...input,
  });
}

test("supervisor transfere SDR qualificado para closer sem perder memoria", () => {
  const result = decision({ inboundText: "Quero fechar. Pode preparar a proposta?" });
  assert.equal(result.schemaVersion, AI_SPECIALIST_SUPERVISOR_VERSION);
  assert.equal(result.selectedSpecialist, "closer");
  assert.equal(result.mode, "transfer");
  assert.equal(result.reason, "qualified_closing_intent");
  assert.deepEqual(result.continuity.confirmedFactKeys, ["businessType", "primaryGoal"]);
  assert.equal(result.continuity.relationshipRevision, 1);
  assert.match(specialistSupervisorInstruction(result), /sem reiniciar descoberta/i);
});

test("pedido de fechamento sem contexto permanece em qualificacao segura", () => {
  const result = decision({ inboundText: "Quanto custa? Quero fechar.", leadMemory: null });
  assert.equal(result.selectedSpecialist, "sdr");
  assert.equal(result.reason, "closing_requires_qualification");
  assert.equal(result.mode, "stay");
});

test("incidente de cliente ativo vai para pos-venda antes de expansao", () => {
  const result = decision({
    configuredRole: "sales",
    inboundText: "Ja sou cliente e minha implantacao nao funciona.",
  });
  assert.equal(result.selectedSpecialist, "post_sales");
  assert.equal(result.reason, "post_sale_continuity");
  assert.equal(result.mode, "transfer");
});

test("suporte nao pode ser desviado para closer por pedido comercial", () => {
  const result = decision({ configuredRole: "support", inboundText: "Quero saber o preco e fechar." });
  assert.equal(result.selectedSpecialist, "support");
  assert.equal(result.mode, "stay");
});

test("pedido humano vence qualquer roteamento interno", () => {
  const result = decision({ inboundText: "Quero falar com um atendente humano agora." });
  assert.equal(result.mode, "human_handoff");
  assert.equal(result.selectedSpecialist, null);
  assert.equal(result.confidence, 0.99);
});

test("variacoes reais de pedido humano, incidente e closer ativo sao classificadas", () => {
  assert.equal(decision({ inboundText: "Quero falar com uma pessoa agora, por favor." }).mode, "human_handoff");
  assert.equal(
    decision({ configuredRole: "support", inboundText: "Meu acesso parou de funcionar depois da atualizacao." }).reason,
    "active_support_incident"
  );
  assert.equal(
    decision({ configuredRole: "closer", leadMemory: null, inboundText: "A proposta faz sentido. Como comecamos hoje?" }).reason,
    "qualified_closing_intent"
  );
});

test("decisao e idempotente e isolada por tenant", () => {
  const first = decision({ inboundText: "Quero fechar." });
  const replay = decision({ inboundText: "Quero fechar." });
  const otherTenant = decision({ tenantId: "tenant-b", inboundText: "Quero fechar." });
  assert.equal(first.idempotencyKey, replay.idempotencyKey);
  assert.notEqual(first.idempotencyKey, otherTenant.idempotencyKey);
});

test("continuidade curta permanece no especialista ativo sem oscilar para o papel inicial", () => {
  const result = decision({
    inboundText: "Pode continuar.",
    runtimeState: { tenantId: "tenant-a", chatId: "chat-a", activeSpecialist: "closer" },
  });
  assert.equal(result.selectedSpecialist, "closer");
  assert.equal(result.mode, "stay");
  assert.equal(result.continuity.previousSpecialist, "closer");
});
