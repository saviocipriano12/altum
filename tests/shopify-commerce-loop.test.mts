import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Shopify paid orders use an order-level conversion key and never masquerade as new leads", () => {
  const ecommerce = readFileSync(resolve(process.cwd(), "lib/server/ecommerce.ts"), "utf8");
  const conversions = readFileSync(resolve(process.cwd(), "lib/server/pixels/conversions.ts"), "utf8");

  assert.match(ecommerce, /skipLeadCreatedWorkflows: true/);
  assert.match(ecommerce, /skipConversionDispatch: true/);
  assert.match(ecommerce, /conversionKey: `shopify:\$\{input\.connectionId\}:\$\{order\.externalOrderId\}`/);
  assert.match(ecommerce, /conversionValue: order\.totalPrice \?\? 0/);
  assert.match(ecommerce, /orderId: order\.externalOrderId/);
  assert.match(conversions, /conversionKey\?: string/);
  assert.match(conversions, /orderId: clean\(input\.orderId, 180\) \|\| input\.eventId/);
});

test("Shopify checkout abandonment is collected through both realtime hooks and API sync", () => {
  const provider = readFileSync(resolve(process.cwd(), "lib/server/commerce/providers/shopify.ts"), "utf8");
  const webhooks = readFileSync(resolve(process.cwd(), "lib/server/commerce/shopify-webhooks.ts"), "utf8");

  assert.match(provider, /abandonedCheckouts\(first:/);
  assert.match(provider, /topic: "checkouts\/abandoned"/);
  assert.match(provider, /abandoned_checkouts: "available"/);
  assert.match(webhooks, /"CHECKOUTS_CREATE"/);
  assert.match(webhooks, /"CHECKOUTS_UPDATE"/);
});
