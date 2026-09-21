import test from "node:test";
import assert from "node:assert/strict";
import { requiresWhatsAppTemplate } from "../lib/whatsapp-service-window.ts";

test("WhatsApp por sessão nunca herda bloqueio de templates da API oficial", () => {
  for (const provider of ["evolution", "evolution_api", "whatsapp_qr", "whatsapp_session", ""]) {
    assert.equal(requiresWhatsAppTemplate({ provider, requiresTemplate: true, lastInboundAt: 1, now: 100_000_000 }), false);
  }
});

test("API oficial mantém texto livre até completar 24 horas", () => {
  const lastInboundAt = 1_000_000;
  assert.equal(requiresWhatsAppTemplate({ provider: "meta_whatsapp", lastInboundAt, now: lastInboundAt + 23.75 * 3_600_000 }), false);
  assert.equal(requiresWhatsAppTemplate({ provider: "meta_whatsapp", lastInboundAt, now: lastInboundAt + 24 * 3_600_000 }), true);
});

test("API oficial sem mensagem recebida exige template, outros canais não", () => {
  assert.equal(requiresWhatsAppTemplate({ provider: "meta_whatsapp" }), true);
  assert.equal(requiresWhatsAppTemplate({ provider: "meta_whatsapp", channel: "instagram" }), false);
});
