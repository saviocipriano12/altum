import test from "node:test";
import assert from "node:assert/strict";
import { commerceJsonPayload } from "../lib/commerce-payload.ts";

test("Shopify orders without fulfillment or customer fields remain valid JSON", () => {
  const input = {
    id: "gid://shopify/Order/123",
    tracking_number: undefined,
    tracking_url: undefined,
    customer: { id: undefined, email: null, phone: undefined },
    line_items: [{ product_id: undefined, quantity: 1, price: "0.00" }],
    attribution: { source: "", campaign: "test" },
  };
  assert.deepEqual(commerceJsonPayload(input), {
    id: "gid://shopify/Order/123",
    customer: { email: null },
    line_items: [{ quantity: 1, price: "0.00" }],
    attribution: { source: "", campaign: "test" },
  });
  assert.equal(input.tracking_number, undefined);
  assert.equal(Object.hasOwn(input, "tracking_number"), true);
});

test("JSON conversion preserves false, zero, null, lists and tracking data", () => {
  const payload = { active: false, total: 0, customer: null, tags: [], tracking_number: "BR123", nested: [{ stock: 0 }] };
  assert.deepEqual(commerceJsonPayload(payload), payload);
});
