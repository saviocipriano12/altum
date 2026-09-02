import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("managed commerce OAuth keeps tenant authorization and entitlement guards", () => {
  for (const provider of ["shopify", "nuvemshop"]) {
    const route = source(`app/api/integrations/commerce/${provider}/start/route.ts`);
    assert.match(route, /requireRequestUser/);
    assert.match(route, /assertTenantAccess/);
    assert.match(route, /assertTenantModule\(tenantId, "commerce"\)/);
    assert.match(route, /assertTenantCapability\(membership, "manage_channels"\)/);
  }
});

test("Shopify callback validates HMAC, state and exact shop domain before token exchange", () => {
  const callback = source("app/api/integrations/commerce/shopify/callback/route.ts");
  const oauth = source("lib/server/commerce/oauth.ts");
  assert.match(callback, /verifyShopifyOAuthHmac/);
  assert.match(callback, /consumeCommerceOAuthState/);
  assert.match(callback, /shop !== oauthState\.shopDomain/);
  assert.match(oauth, /myshopify\\\.com\$\/\.test/);
  assert.match(oauth, /timingSafeEqual/);
});

test("scheduled commerce sync is bounded, entitlement-aware and observable", () => {
  const route = source("app/api/internal/jobs/commerce/sync/route.ts");
  assert.match(route, /COMMERCE_SYNC_TOKEN/);
  assert.match(route, /connectionLimit/);
  assert.match(route, /minimumIntervalMinutes/);
  assert.match(route, /hasTenantModule\(entitlements, "commerce"\)/);
  assert.match(route, /internal_job_runs/);
});
