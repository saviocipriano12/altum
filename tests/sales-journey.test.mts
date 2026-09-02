import assert from "node:assert/strict";
import test from "node:test";
import { deriveSalesJourney, inferSalesMotion } from "../lib/sales-journey.ts";

const NOW = new Date("2026-08-23T15:00:00.000Z");

test("barbearia fecha oferecendo horarios, sem inventar reuniao", () => {
  const settings = { niche: "Barbearia", businessContext: { offer: { offeringType: "services" } } };
  assert.equal(inferSalesMotion({ lead: {}, settings }), "appointment");
  const result = deriveSalesJourney({
    now: NOW,
    settings,
    lead: { nome: "Joao", pipelineStage: "em_negociacao" },
    chats: [{ channel: "whatsapp", lastClientMessageAt: "2026-08-23T14:55:00.000Z" }],
  });
  assert.equal(result.action, "offer_time_slots");
  assert.equal(result.urgency, "now");
});

test("ecommerce retoma abandono com cadencia curta", () => {
  const result = deriveSalesJourney({
    now: NOW,
    settings: { niche: "E-commerce de roupas" },
    lead: { nome: "Ana", contactAttempts: 1 },
    chats: [{ channel: "whatsapp", lastAgentMessageAt: "2026-08-23T09:00:00.000Z", lastMessageTime: "2026-08-23T09:00:00.000Z" }],
  });
  assert.equal(result.motion, "direct_checkout");
  assert.equal(result.action, "follow_up");
  assert.equal(result.waitHours, 4);
});

test("objecao recebida vem antes do fechamento", () => {
  const result = deriveSalesJourney({
    now: NOW,
    lead: { aiDominantObjection: "preço", pipelineStage: "proposta_enviada" },
    chats: [{ lastClientMessageAt: "2026-08-23T14:00:00.000Z" }],
  });
  assert.equal(result.lifecycle, "objection");
  assert.equal(result.action, "handle_objection");
  assert.match(result.objective, /causa real/i);
});

test("apos muitas tentativas para de insistir", () => {
  const result = deriveSalesJourney({
    now: NOW,
    lead: {},
    chats: [{ followUpCount: 4, lastAgentMessageAt: "2026-08-19T12:00:00.000Z" }],
  });
  assert.equal(result.lifecycle, "nurture");
  assert.equal(result.action, "move_to_nurture");
});

test("pos-venda prioriza valor antes do upsell e depois sugere oferta", () => {
  const early = deriveSalesJourney({ now: NOW, lead: { pipelineStage: "fechado", wonAt: "2026-08-23T12:00:00.000Z" } });
  const mature = deriveSalesJourney({ now: NOW, lead: { pipelineStage: "fechado", wonAt: "2026-08-10T12:00:00.000Z" } });
  assert.equal(early.action, "post_sale_checkin");
  assert.equal(mature.action, "suggest_next_offer");
});

test("whatsapp fora de 24 horas sinaliza template aprovado", () => {
  const result = deriveSalesJourney({
    now: NOW,
    lead: {},
    chats: [{ channel: "whatsapp", lastClientMessageAt: "2026-08-20T10:00:00.000Z", lastAgentMessageAt: "2026-08-21T10:00:00.000Z" }],
  });
  assert.equal(result.requiresTemplate, true);
  assert.ok(result.guardrails.some((item) => /template aprovado/i.test(item)));
});
