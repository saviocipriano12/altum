import assert from "node:assert/strict";
import test from "node:test";
import {
  getBillingBlockAt,
  isPlanUpgrade,
  isWithinRefundWindow,
} from "../lib/platform-subscription-policy.ts";

test("overdue access receives exactly three calendar days of grace", () => {
  assert.equal(
    getBillingBlockAt("2026-08-31").toISOString(),
    "2026-09-03T03:00:00.000Z"
  );
});

test("refund is accepted through day seven and refused afterwards", () => {
  const paidAt = "2026-08-01T12:00:00.000Z";
  assert.equal(isWithinRefundWindow(paidAt, new Date("2026-08-08T12:00:00.000Z")), true);
  assert.equal(isWithinRefundWindow(paidAt, new Date("2026-08-08T12:00:01.000Z")), false);
});

test("only a higher commercial tier is an upgrade", () => {
  assert.equal(isPlanUpgrade("essencial", "operacao"), true);
  assert.equal(isPlanUpgrade("operacao", "essencial"), false);
  assert.equal(isPlanUpgrade("operacao", "operacao"), false);
});
