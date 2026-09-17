import test from "node:test";
import assert from "node:assert/strict";
import { getClientBillingRedirect } from "../lib/client-billing-redirect.ts";
test("expired subscription keeps tenant context for renewal", () => { const href = getClientBillingRedirect({code:"trial_expired",tenantId:"tenant-b"},402); assert.equal(href,"/cliente/assinatura?reason=trial_expired&tenantId=tenant-b"); });
test("billing block directs to subscription but member block never does", () => { assert.ok(getClientBillingRedirect({code:"tenant_billing_blocked"},403)); assert.equal(getClientBillingRedirect({code:"blocked_portal_user"},403),null); assert.equal(getClientBillingRedirect({code:"invalid_token"},401),null); });
