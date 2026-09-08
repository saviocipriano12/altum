import test from "node:test";
import assert from "node:assert/strict";
import {
  canReuseAsaasCheckout,
  checkoutSubscriptionFields,
  hasManagedAsaasSubscription,
} from "../lib/asaas-checkout-state.ts";

test("bloqueia segundo checkout quando a assinatura ja e gerenciada", () => {
  assert.equal(hasManagedAsaasSubscription({ subscriptionId: "sub_123", billingStatus: "active" }), true);
  assert.equal(hasManagedAsaasSubscription({ subscriptionId: "sub_123", billingStatus: "past_due" }), true);
  assert.equal(hasManagedAsaasSubscription({ subscriptionId: "", billingStatus: "active" }), false);
});

test("reutiliza checkout somente para o mesmo contrato comercial vigente", () => {
  const base = {
    checkoutUrl: "https://asaas.example/checkout",
    checkoutCreatedAt: 1_000_000,
    pendingPlan: "operacao",
    pendingMonthlyPrice: 697,
    catalogVersion: "2026-09-launch",
    planId: "operacao",
    monthlyPrice: 697,
    expectedCatalogVersion: "2026-09-launch",
    now: 1_001_000,
  };
  assert.equal(canReuseAsaasCheckout(base), true);
  assert.equal(canReuseAsaasCheckout({ ...base, monthlyPrice: 797 }), false);
  assert.equal(canReuseAsaasCheckout({ ...base, expectedCatalogVersion: "2026-10" }), false);
  assert.equal(canReuseAsaasCheckout({ ...base, now: 1_700_000 }), false);
});

test("webhook sem assinatura nao apaga identificadores ja persistidos", () => {
  assert.deepEqual(checkoutSubscriptionFields({}), {});
  assert.deepEqual(checkoutSubscriptionFields({ subscription: "sub_string" }), { asaasSubscriptionId: "sub_string" });
  assert.deepEqual(checkoutSubscriptionFields({ subscription: { id: "sub_123", nextDueDate: "2026-10-01" } }), {
    asaasSubscriptionId: "sub_123",
    asaasNextDueDate: "2026-10-01",
  });
});
