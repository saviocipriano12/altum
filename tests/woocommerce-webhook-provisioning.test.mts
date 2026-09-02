import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("WooCommerce credentials provision and rotate realtime subscriptions", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/server/commerce/woocommerce-webhooks.ts"), "utf8");
  const createRoute = readFileSync(resolve(process.cwd(), "app/api/tenant/[tenantId]/ecommerce/connections/route.ts"), "utf8");
  const updateRoute = readFileSync(resolve(process.cwd(), "app/api/tenant/[tenantId]/ecommerce/connections/[connectionId]/route.ts"), "utf8");
  for (const topic of ["product.created", "product.updated", "order.created", "order.updated"]) {
    assert.match(source, new RegExp(`"${topic}"`));
  }
  assert.match(source, /rotateExistingSecret/);
  assert.match(source, /method: "PUT"/);
  assert.match(createRoute, /ensureWooCommerceWebhookSubscriptions/);
  assert.match(updateRoute, /body\.rotateWebhookSecret/);
});
