import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertSafeCommerceUrl } from "../lib/server/commerce/http.ts";
import { COMMERCE_PROVIDER_IDS } from "../lib/server/commerce/types.ts";

test("commerce provider catalog preserves every advertised platform", () => {
  assert.deepEqual(COMMERCE_PROVIDER_IDS, ["shopify", "nuvemshop", "woocommerce", "vtex", "tray", "loja_integrada"]);
  assert.equal(new Set(COMMERCE_PROVIDER_IDS).size, COMMERCE_PROVIDER_IDS.length);
});

test("commerce API URLs reject insecure and local targets", async () => {
  await assert.rejects(() => assertSafeCommerceUrl("http://example.com"), /commerce_store_https_required/);
  await assert.rejects(() => assertSafeCommerceUrl("https://localhost"), /commerce_store_url_blocked/);
  await assert.rejects(() => assertSafeCommerceUrl("https://127.0.0.1"), /commerce_store_url_blocked/);
});

test("native providers use their current official API contracts", () => {
  const shopify = readFileSync(resolve(process.cwd(), "lib/server/commerce/providers/shopify.ts"), "utf8");
  const nuvemshop = readFileSync(resolve(process.cwd(), "lib/server/commerce/providers/nuvemshop.ts"), "utf8");
  const woo = readFileSync(resolve(process.cwd(), "lib/server/commerce/providers/woocommerce.ts"), "utf8");
  assert.match(shopify, /graphql\.json/);
  assert.match(shopify, /X-Shopify-Access-Token/);
  assert.match(nuvemshop, /api\.nuvemshop\.com\.br\/v1/);
  assert.match(nuvemshop, /Authorization: `Bearer/);
  assert.match(woo, /wp-json\/wc\/v3/);
  assert.match(woo, /Basic/);
});
