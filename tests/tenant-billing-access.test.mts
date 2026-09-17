import test from "node:test";
import assert from "node:assert/strict";
import { getTenantBillingAccessDenial } from "../lib/tenant-billing-access.ts";
const now = Date.parse("2026-09-16T12:00:00Z");
test("trial expiry and scheduled cancellation block operation at the boundary", () => {
 assert.equal(getTenantBillingAccessDenial({ billingStatus: "trial", trialEndsAt: new Date(now) }, now)?.code, "trial_expired");
 assert.equal(getTenantBillingAccessDenial({ billingStatus: "cancel_scheduled", accessEndsAt: { _seconds: now / 1000 } }, now)?.code, "subscription_ended");
});
test("payment grace permits operation until its actual deadline", () => {
 assert.equal(getTenantBillingAccessDenial({billingStatus:"past_due",billingBlockAt:now+1},now),null);
 assert.equal(getTenantBillingAccessDenial({billingStatus:"past_due",billingBlockAt:now},now)?.code,"billing_grace_expired");
});
test("paid subscription is not blocked by an old trial date", () => {
 assert.equal(getTenantBillingAccessDenial({billingStatus:"active",trialEndsAt:now-1},now),null);
 assert.equal(getTenantBillingAccessDenial({billingStatus:"paid",trialEndsAt:now-1},now),null);
});
