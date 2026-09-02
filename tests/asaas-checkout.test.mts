import test from "node:test";
import assert from "node:assert/strict";
import { buildAsaasRecurringCheckoutPayload, formatAsaasDateTime } from "../lib/asaas-checkout.ts";

test("formata data do checkout no contrato exigido pelo Asaas", () => {
  assert.equal(formatAsaasDateTime(new Date("2026-09-01T20:05:06.000Z")), "2026-09-01 17:05:06");
});

test("gera checkout recorrente com identificacao e retorno ao painel", () => {
  const payload = buildAsaasRecurringCheckoutPayload({
    plan: { id: "operacao", name: "Operacao", description: "Plano", monthlyPrice: 997 },
    siteUrl: "https://www.altumia.com.br",
    externalReference: "altum:tenant:operacao:ref",
    customerData: { name: "Cliente", email: "cliente@altum.test", cpfCnpj: "52998224725" },
    now: new Date("2026-09-01T20:00:00.000Z"),
  });

  assert.deepEqual(payload.billingTypes, ["CREDIT_CARD", "PIX"]);
  assert.deepEqual(payload.chargeTypes, ["RECURRENT"]);
  assert.equal(payload.subscription.nextDueDate, "2026-09-01 17:05:00");
  assert.equal(payload.customerData.cpfCnpj, "52998224725");
  assert.equal(payload.callback.successUrl, "https://www.altumia.com.br/cliente/painel/configuracoes/faturamento?checkout=success");
});
