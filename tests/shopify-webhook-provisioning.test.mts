import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Shopify OAuth provisions realtime commercial topics idempotently", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/server/commerce/shopify-webhooks.ts"), "utf8");
  const callback = readFileSync(resolve(process.cwd(), "app/api/integrations/commerce/shopify/callback/route.ts"), "utf8");
  for (const topic of ["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "ORDERS_CREATE", "ORDERS_UPDATED", "FULFILLMENTS_CREATE", "FULFILLMENTS_UPDATE"]) {
    assert.match(source, new RegExp(`"${topic}"`));
  }
  assert.match(source, /webhookSubscriptions\(first: 100, topics: \$topics\)/);
  assert.match(source, /webhookSubscriptionCreate/);
  assert.match(source, /alreadyPresent/);
  assert.match(callback, /ensureShopifyWebhookSubscriptions/);
});

test("Nuvemshop OAuth provisions specific events and enriches ID-only payloads", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/server/commerce/nuvemshop-webhooks.ts"), "utf8");
  const provider = readFileSync(resolve(process.cwd(), "lib/server/commerce/providers/nuvemshop.ts"), "utf8");
  const callback = readFileSync(resolve(process.cwd(), "app/api/integrations/commerce/nuvemshop/callback/route.ts"), "utf8");
  for (const event of ["product/created", "product/updated", "order/created", "order/paid", "order/packed", "order/fulfilled", "order/cancelled", "order/edited"]) {
    assert.match(source, new RegExp(`"${event}"`));
  }
  assert.match(source, /alreadyPresent/);
  assert.match(provider, /fetchNuvemshopWebhookResource/);
  assert.match(callback, /ensureNuvemshopWebhookSubscriptions/);
});
