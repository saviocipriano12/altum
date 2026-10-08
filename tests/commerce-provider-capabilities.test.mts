import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCE_PROVIDER_IDS } from "../lib/server/commerce/types.ts";
import { commerceProviderMeta } from "../lib/server/commerce/registry.ts";

test("every commerce provider declares the complete capability contract", () => {
  const expectedCapabilities = [
    "catalog_products",
    "product_variants",
    "inventory_aggregate",
    "inventory_by_location",
    "customers",
    "orders",
    "payments",
    "fulfillments",
    "tracking",
    "refunds",
    "returns",
    "abandoned_checkouts",
    "webhooks",
    "api_sync",
  ];

  for (const providerId of COMMERCE_PROVIDER_IDS) {
    const meta = commerceProviderMeta(providerId);
    assert.deepEqual(Object.keys(meta.capabilityMatrix).sort(), [...expectedCapabilities].sort());
  }
});

test("Shopify exposes current strengths without claiming planned coverage", () => {
  const shopify = commerceProviderMeta("shopify");
  assert.equal(shopify.capabilityMatrix.catalog_products, "available");
  assert.equal(shopify.capabilityMatrix.tracking, "available");
  assert.equal(shopify.capabilityMatrix.abandoned_checkouts, "available");
  assert.equal(shopify.capabilityMatrix.inventory_by_location, "planned");
  assert.equal(shopify.capabilityMatrix.refunds, "partial");
  assert.ok(shopify.availableCapabilities.includes("api_sync"));
  assert.ok(shopify.unavailableCapabilities.includes("returns"));
});

test("webhook-only providers do not advertise API synchronization", () => {
  for (const providerId of ["vtex", "tray", "loja_integrada", "checkout_externo"] as const) {
    const meta = commerceProviderMeta(providerId);
    assert.equal(meta.connectionMode, "webhook");
    assert.equal(meta.capabilityMatrix.api_sync, "unsupported");
    assert.equal(meta.capabilityMatrix.webhooks, "available");
  }
});
