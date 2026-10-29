import test from "node:test";
import assert from "node:assert/strict";
import { normalizeShopifyStore, missingShopifyScopes, commerceConnectionState } from "../lib/shopify-connection.ts";

test("Shopify connection accepts merchant dashboard links and permanent store domains", () => {
  for (const value of ["LF-LOJA", " lf-loja.myshopify.com ", "https://lf-loja.myshopify.com/admin", "https://admin.shopify.com/store/lf-loja/orders", "admin.shopify.com/store/lf-loja"]) {
    assert.equal(normalizeShopifyStore(value), "lf-loja.myshopify.com");
  }
});

test("Shopify connection rejects empty, custom, insecure and spoofed domains", () => {
  for (const value of [undefined, "", "  ", "http://loja.myshopify.com", "minhaloja.com.br", "loja.myshopify.com.attacker.test", "https://loja.myshopify.com@attacker.test", "https://user@loja.myshopify.com", "https://loja.myshopify.com:8443", "admin.shopify.com", "admin.shopify.com/store/", "-loja.myshopify.com"]) {
    assert.equal(normalizeShopifyStore(value), "", String(value));
  }
});

test("Shopify scope validation allows stronger write grants but detects missing read permissions", () => {
  assert.deepEqual(missingShopifyScopes("read_products,read_orders", "write_products,read_orders"), []);
  assert.deepEqual(missingShopifyScopes("read_products,read_orders,read_customers", "read_products,read_orders"), ["read_customers"]);
  assert.deepEqual(missingShopifyScopes("write_orders", "read_orders"), ["write_orders"]);
});

test("An active registration without API access or verified events remains pending", () => {
  assert.equal(commerceConnectionState({ status: "active", connectionStatus: "webhook_ready" }).label, "Conexão pendente");
  assert.equal(commerceConnectionState({ status: "active", connectionStatus: "connected", hasApiCredentials: true }).label, "Conectada");
  assert.equal(commerceConnectionState({ status: "active", connectionStatus: "receiving_events", lastEventAt: "2026-10-13" }).label, "Conectada");
  assert.equal(commerceConnectionState({ status: "paused", connectionStatus: "connected", hasApiCredentials: true }).label, "Pausada");
  assert.equal(commerceConnectionState({ status: "active", connectionStatus: "error", hasApiCredentials: true }).tone, "danger");
});
