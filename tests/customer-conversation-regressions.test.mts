import test from "node:test";
import assert from "node:assert/strict";
import { parseEvolutionWebhook } from "../lib/server/messaging/evolution-webhook.ts";
import { normalizeCanonicalInboundEvent } from "../lib/server/messaging/inbound-event.ts";
import { getMediaCaption, isMediaPlaceholder } from "../lib/message-media-placeholder.ts";
import { mergeMessageRevision } from "../lib/inbox-message-revision.ts";
import { buildAiPipelineContext, resolveAiPipelineProposal } from "../lib/ai-pipeline-context.ts";
import { suggestPipelineStageForAiAction } from "../lib/ai-next-actions.ts";
import { compileTenantAiContext } from "../lib/server/ai/tenant-context.ts";
import type { PipelineStageDefinition } from "../lib/pipeline.ts";
import { normalizePipelineStages } from "../lib/pipeline.ts";

const event = (fromMe: boolean, message: unknown, name = "messages.upsert") => ({ event: name, data: {
  key: { id: "qa-regression", remoteJid: "5511000000001@s.whatsapp.net", fromMe },
  pushName: "Nome do vendedor", messageTimestamp: 1792500000, message,
} });
test("own-device and SEND_MESSAGE events are preserved as outgoing without using the seller name as contact", () => {
  for (const name of ["messages.upsert", "SEND_MESSAGE"]) {
    const parsed = parseEvolutionWebhook(event(true, { conversation: "Respondi no celular" }, name));
    assert.equal(parsed?.kind, "message");
    if (parsed?.kind !== "message") throw new Error("Missing message");
    assert.equal(parsed.fromMe, true);
    assert.equal(parsed.contactName, "5511000000001");
    assert.equal(parsed.text, "Respondi no celular");
  }
});
test("a slow earlier HTTP response cannot undo a realtime delivery or restored image", () => {
  const delivered = { revision: "001792500000:000000200", status: "delivered", mediaUrl: "/protected/image" };
  const queued = { revision: "001792500000:000000100", status: "queued", mediaUrl: "" };
  assert.deepEqual(mergeMessageRevision(delivered, queued), delivered);
  assert.deepEqual(mergeMessageRevision(queued, delivered), delivered);
});
test("real audio pipeline produces one placeholder and legacy variants are not transcripts", () => {
  const parsed = parseEvolutionWebhook(event(false, { audioMessage: { mimetype: "audio/ogg" } }));
  if (parsed?.kind !== "message") throw new Error("Missing audio");
  const result = normalizeCanonicalInboundEvent({ tenantId: "qa", channelId: "qa", channel: "whatsapp", provider: "evolution",
    senderExternalId: parsed.from, providerEventId: parsed.messageId, text: parsed.text, attachments: [{ type: parsed.messageType, caption: parsed.text }] });
  assert.ok(result.accepted);
  assert.equal(result.event.text, "[Áudio recebido]");
  for (const text of ["[Áudio recebido]", "[Audio recebido] [Áudio recebido]", "[Áudio recebido] [Áudio recebido]"]) assert.equal(isMediaPlaceholder("audio", text), true);
  assert.equal(isMediaPlaceholder("audio", "Quero ouvir o áudio recebido ontem"), false);
});
test("media captions preserve the customer words while hiding generated trailing labels", () => {
  assert.equal(getMediaCaption("image", "Resultado [Imagem recebida]"), "Resultado");
  assert.equal(getMediaCaption("audio", "Quero duas camisas [Áudio recebido] [Audio recebido]"), "Quero duas camisas");
  assert.equal(getMediaCaption("audio", "[Áudio recebido] [Audio recebido]"), "");
  assert.equal(getMediaCaption("text", "[Imagem recebida]"), "[Imagem recebida]");
  assert.equal(getMediaCaption("image", "[Imagem recebida] é o texto que aparece"), "[Imagem recebida] é o texto que aparece");
});
const stages: PipelineStageDefinition[] = [
  { id: "entrada", label: "Novo cliente", description: "Interesse inicial", color: "blue", position: 0 },
  { id: "provador", label: "Escolha de peças", description: "Cliente em negociação de modelos e tamanhos", color: "blue", position: 1 },
  { id: "encerrado", label: "Venda ganha", description: "Pagamento confirmado", isTerminal: true, color: "green", position: 2 },
];
test("custom stage names and descriptions inform suggestions; no arbitrary second-column fallback", () => {
  assert.equal(suggestPipelineStageForAiAction("preparar_proposta_comercial", stages), "provador");
  assert.match(buildAiPipelineContext(stages), /Escolha de peças/);
  assert.match(buildAiPipelineContext(stages), /negociação de modelos/);
  assert.equal(suggestPipelineStageForAiAction("aprofundar_oportunidade", stages.map((stage) => ({ ...stage, id: `id-${stage.position}`, label: "Etapa", description: "" }))), null);
  assert.equal(suggestPipelineStageForAiAction("aprofundar_oportunidade", stages), null, "A discovery turn must not mean negotiation merely because that is the next column");
});
test("a new custom funnel never inherits stage meaning or terminal state from column position", () => {
  const customized = normalizePipelineStages(Array.from({ length: 7 }, (_, position) => ({ id: `custom-${position}`, label: `Etapa ${position}`, position })));
  assert.equal(customized.length, 7);
  for (const stage of customized) { assert.equal(stage.description, ""); assert.equal(stage.isTerminal, false); }
});
test("semantic model proposal needs an exact active ID and literal evidence; terminal stages remain protected", () => {
  const proposal = { id: "provador", evidence: "Quero escolher as camisas", confidence: 0.95 };
  assert.equal(resolveAiPipelineProposal(proposal, stages, "Quero escolher as camisas tamanho M"), "provador");
  for (const invalid of [{ ...proposal, id: "inventada" }, { ...proposal, id: "encerrado" }, { ...proposal, confidence: 0.5 }, { ...proposal, evidence: "Fechei o pedido" }]) {
    assert.equal(resolveAiPipelineProposal(invalid, stages, "Quero escolher as camisas tamanho M"), null);
  }
});
test("editing a funnel changes the tenant prompt and its fingerprint", () => {
  const input = { tenantId: "qa", agentName: "Altum", assistantRole: "sales" as const, businessSummary: "Loja", objective: "Atender", toneOfVoice: "claro", commercialBrain: {}, guardrails: [], mandatoryQuestions: [], escalationTopics: [], pipelineStages: stages };
  const first = compileTenantAiContext(input);
  const next = compileTenantAiContext({ ...input, pipelineStages: stages.map((stage) => ({ ...stage, description: "Nova regra de atendimento" })) });
  assert.notEqual(first.fingerprint, next.fingerprint);
  assert.match(next.businessPrompt, /Nova regra de atendimento/);
});
