import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLATFORM_PLANS,
  PLATFORM_TRIAL_ACCESS,
  platformLimitsFromAllowances,
} from "../lib/platform-plans.ts";

test("limites executaveis permanecem derivados do catalogo comercial", () => {
  for (const plan of DEFAULT_PLATFORM_PLANS) {
    assert.deepEqual(plan.limits, platformLimitsFromAllowances(plan.allowances), plan.id);
    assert.equal(plan.limits.storageMb, plan.allowances.storageGb * 1_000, plan.id);
  }
});

test("todo plano ativo possui contrato, modulos e limites validos", () => {
  for (const plan of DEFAULT_PLATFORM_PLANS.filter((item) => item.active)) {
    assert.ok(plan.catalogVersion, plan.id);
    assert.ok(plan.features.length >= 5, plan.id);
    assert.ok(Object.values(plan.modules).some(Boolean), plan.id);
    assert.ok(Object.values(plan.limits).every((value) => Number.isFinite(value) && value >= 0), plan.id);
    if (plan.checkoutEnabled) assert.ok(plan.monthlyPrice && plan.monthlyPrice > 0, plan.id);
  }
});

test("trial possui prazo e limites finitos", () => {
  assert.ok(PLATFORM_TRIAL_ACCESS.days > 0);
  assert.ok(Object.values(PLATFORM_TRIAL_ACCESS.limits).every((value) => Number.isFinite(value) && value > 0));
});
