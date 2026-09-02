import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyBase64HmacSha256, verifyHexHmacSha256, verifyNativeCommerceWebhook } from "../lib/server/commerce/webhook-security.ts";

test("validates Shopify-compatible base64 HMAC over the exact raw body", () => {
  const rawBody = '{"id":123,"name":"Pedido"}';
  const secret = "shopify-secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  assert.equal(verifyBase64HmacSha256(rawBody, signature, secret), true);
  assert.equal(verifyBase64HmacSha256(`${rawBody} `, signature, secret), false);
});

test("uses native Shopify and WooCommerce signature headers when present", () => {
  const rawBody = '{"id":456}';
  const shopifySecret = "shopify-secret";
  const wooSecret = "woo-secret";
  const shopifyHeaders = new Headers({
    "x-shopify-hmac-sha256": crypto.createHmac("sha256", shopifySecret).update(rawBody).digest("base64"),
  });
  const wooHeaders = new Headers({
    "x-wc-webhook-signature": crypto.createHmac("sha256", wooSecret).update(rawBody).digest("base64"),
  });
  assert.equal(verifyNativeCommerceWebhook({ provider: "shopify", headers: shopifyHeaders, rawBody, shopifyClientSecret: shopifySecret }), true);
  assert.equal(verifyNativeCommerceWebhook({ provider: "woocommerce", headers: wooHeaders, rawBody, connectionWebhookSecret: wooSecret }), true);
  assert.equal(verifyNativeCommerceWebhook({ provider: "nuvemshop", headers: new Headers(), rawBody }), null);
});

test("validates Nuvemshop hexadecimal app-secret signature", () => {
  const rawBody = '{"store_id":123,"event":"order/paid","id":456}';
  const secret = "nuvemshop-secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const headers = new Headers({ "x-linkedstore-hmac-sha256": signature });
  assert.equal(verifyHexHmacSha256(rawBody, signature, secret), true);
  assert.equal(verifyNativeCommerceWebhook({ provider: "nuvemshop", headers, rawBody, nuvemshopClientSecret: secret }), true);
});
