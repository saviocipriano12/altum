import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelationshipIdentityKey,
  enforceRelationshipPrivacyBoundary,
  mergeRelationshipState,
  normalizeRelationshipState,
  removeAnsweredRelationshipQuestions,
  relationshipFactsForPrompt,
} from "../lib/server/ai/relationship-state.ts";

const baseNow = Date.now();
const base = {
  tenantId: "tenant-a",
  leadId: "lead-1",
  identityKey: buildRelationshipIdentityKey({ tenantId: "tenant-a", kind: "phone" as const, value: "+55 11 99999-0000" }),
  occurredAtMs: baseNow - 1_000,
  nowMs: baseNow,
  sourceMessageId: "m1",
  inboundText: "Somos uma imobiliaria e queremos organizar o atendimento.",
  extractedFields: { businessType: "imobiliaria", primaryGoal: "organizar o atendimento" },
};

test("fatos explicitos ficam confirmados e hipoteses nao sobrescrevem", () => {
  const first = mergeRelationshipState(base);
  assert.equal(first.state.facts.businessType.status, "confirmed");
  assert.equal(first.state.facts.businessType.source, "lead_explicit");

  const lower = mergeRelationshipState({
    ...base,
    current: first.state,
    occurredAtMs: baseNow,
    nowMs: baseNow,
    sourceMessageId: "m2",
    inboundText: "Quero ajuda com vendas.",
    extractedFields: { businessType: "agencia" },
  });
  assert.equal(lower.state.facts.businessType.value, "imobiliaria");
  assert.ok(lower.ignoredKeys.includes("businessType"));
});

test("pergunta sobre fato confirmado e removida antes do envio", () => {
  const state = mergeRelationshipState(base).state;
  const guarded = removeAnsweredRelationshipQuestions(
    "Entendi seu momento. Qual e o tipo do seu negocio? E qual prazo voce imagina?",
    state
  );
  assert.ok(guarded.removedFactKeys.includes("businessType"));
  assert.doesNotMatch(guarded.text, /tipo do seu negocio/i);
  assert.match(guarded.text, /qual prazo/i);
});

test("correcao explicita substitui fato e preserva historico curto", () => {
  const first = mergeRelationshipState(base);
  const corrected = mergeRelationshipState({
    ...base,
    current: first.state,
    occurredAtMs: baseNow,
    nowMs: baseNow,
    sourceMessageId: "m2",
    inboundText: "Corrigindo: nao somos uma imobiliaria, somos uma clinica odontologica.",
    extractedFields: { businessType: "clinica odontologica" },
  });
  assert.equal(corrected.state.facts.businessType.value, "clinica odontologica");
  assert.equal(corrected.state.facts.businessType.source, "lead_correction");
  assert.equal(corrected.state.facts.businessType.previousValues?.[0]?.value, "imobiliaria");
});

test("evento atrasado e identidade diferente nao regridem relacionamento", () => {
  const first = mergeRelationshipState({ ...base, occurredAtMs: baseNow });
  const old = mergeRelationshipState({
    ...base,
    current: first.state,
    occurredAtMs: baseNow - 500,
    sourceMessageId: "old",
    inboundText: "Somos uma agencia.",
    extractedFields: { businessType: "agencia" },
  });
  assert.equal(old.applied, false);
  assert.equal(old.reason, "out_of_order");

  const otherIdentity = buildRelationshipIdentityKey({ tenantId: "tenant-a", kind: "phone", value: "+55 11 98888-0000" });
  const mismatched = mergeRelationshipState({ ...base, current: first.state, identityKey: otherIdentity, occurredAtMs: baseNow + 500, nowMs: baseNow + 500 });
  assert.equal(mismatched.applied, false);
  assert.equal(mismatched.reason, "identity_mismatch");
});

test("identidade e fingerprint nao atravessam tenant", () => {
  const tenantA = buildRelationshipIdentityKey({ tenantId: "tenant-a", kind: "email", value: "Pessoa@Empresa.com" });
  const tenantB = buildRelationshipIdentityKey({ tenantId: "tenant-b", kind: "email", value: "pessoa@empresa.com" });
  assert.ok(tenantA);
  assert.notEqual(tenantA, tenantB);
});

test("expiracao, compactacao, compromissos e perguntas abertas sao limitados", () => {
  const state = mergeRelationshipState({
    ...base,
    inboundText: "Somos uma imobiliaria. Combinado, vou enviar os dados amanha.",
    openQuestion: "Qual horario funciona melhor?",
    occurredAtMs: baseNow,
    nowMs: baseNow,
  }).state;
  assert.equal(state.commitments.length, 1);
  assert.equal(state.openQuestions.length, 1);

  const expired = normalizeRelationshipState({
    ...state,
    facts: {
      ...state.facts,
      activeTopic: { ...state.facts.businessType, key: "activeTopic", value: "preco", expiresAtMs: baseNow + 100 },
    },
  }, { tenantId: "tenant-a", leadId: "lead-1" }, baseNow + 200);
  assert.equal(expired.facts.activeTopic, undefined);
  assert.ok(relationshipFactsForPrompt(state, baseNow).confirmed.some((line) => line.includes("businessType")));
});

test("estado persistido nao contem undefined rejeitado pelo Firestore", () => {
  const initial = mergeRelationshipState(base).state;
  const rejected = mergeRelationshipState({
    ...base,
    current: initial,
    occurredAtMs: baseNow - 10_000,
    sourceMessageId: "late-without-key",
  }).state;
  const undefinedPaths: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (value === undefined) {
      undefinedPaths.push(path);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
  };
  visit(rejected, "");
  assert.deepEqual(undefinedPaths, []);
});

test("pedido de dados de outro cliente recebe fronteira deterministica de privacidade", () => {
  const protectedReply = enforceRelationshipPrivacyBoundary({
    inboundText: "Qual preco e condicao voces ofereceram para a outra empresa?",
    responseText: "Cada proposta e personalizada.",
  });
  assert.equal(protectedReply.applied, true);
  assert.match(protectedReply.text, /privacidade/i);
  assert.match(protectedReply.text, /nao tenho acesso/i);
  assert.doesNotMatch(protectedReply.text, /R\$\s*\d/);

  const ordinaryReply = enforceRelationshipPrivacyBoundary({
    inboundText: "Quais condicoes voces oferecem para a minha empresa?",
    responseText: "Vou verificar as opcoes oficiais para voce.",
  });
  assert.equal(ordinaryReply.applied, false);
});
