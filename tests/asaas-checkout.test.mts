import test from "node:test";
import assert from "node:assert/strict";
import { buildAsaasCheckoutUrl, buildAsaasRecurringCheckoutPayload, formatAsaasDateTime } from "../lib/asaas-checkout.ts";

test("formata data do checkout no contrato exigido pelo Asaas", () => {
  assert.equal(formatAsaasDateTime(new Date("2026-09-01T20:05:06.000Z")), "2026-09-01 17:05:06");
});

test("gera checkout recorrente com identificacao e retorno ao painel", () => {
  const payload = buildAsaasRecurringCheckoutPayload({
    plan: { id: "operacao", name: "Operacao", description: "Plano", monthlyPrice: 697 },
    siteUrl: "https://www.altumia.com.br",
    externalReference: "altum:tenant:operacao:ref",
    now: new Date("2026-09-01T20:00:00.000Z"),
  });

  assert.deepEqual(payload.billingTypes, ["CREDIT_CARD"]);
  assert.deepEqual(payload.chargeTypes, ["RECURRENT"]);
  assert.equal(payload.subscription.nextDueDate, "2026-09-01 17:05:00");
  assert.equal("customerData" in payload, false);
  assert.equal("customer" in payload, false);
  assert.equal(payload.callback.successUrl, "https://www.altumia.com.br/cliente/painel/configuracoes/faturamento?checkout=success");
});

test("monta link hospedado pelo ID no ambiente correto", () => {
  assert.equal(buildAsaasCheckoutUrl("checkout-123", "https://api.asaas.com/v3"), "https://asaas.com/checkoutSession/show?id=checkout-123");
  assert.equal(buildAsaasCheckoutUrl("checkout-123", "https://api-sandbox.asaas.com/v3"), "https://sandbox.asaas.com/checkoutSession/show?id=checkout-123");
  assert.equal(buildAsaasCheckoutUrl("", "https://api.asaas.com/v3"), "");
  assert.equal(buildAsaasCheckoutUrl("../bad", "https://api.asaas.com/v3"), "");
  assert.equal(buildAsaasCheckoutUrl("checkout-123", "https://example.com/v3"), "");
});
