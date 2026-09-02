import crypto from "crypto";
import type { CommerceProviderId } from "@/lib/server/commerce/types";

function clean(value: unknown, max = 12000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timingSafeTextEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyBase64HmacSha256(rawBody: string, providedSignature: string, secret: string) {
  const provided = clean(providedSignature, 1000);
  const key = clean(secret);
  if (!provided || !key) return false;
  const expected = crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  return timingSafeTextEqual(provided, expected);
}

export function verifyHexHmacSha256(rawBody: string, providedSignature: string, secret: string) {
  const provided = clean(providedSignature, 1000).toLowerCase();
  const key = clean(secret);
  if (!provided || !key) return false;
  const expected = crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  return timingSafeTextEqual(provided, expected);
}

/**
 * Returns null when the request does not present a provider-native signature,
 * allowing legacy/manual connections to use Altum's own webhook token.
 */
export function verifyNativeCommerceWebhook(input: {
  provider: CommerceProviderId;
  headers: Headers;
  rawBody: string;
  shopifyClientSecret?: string;
  nuvemshopClientSecret?: string;
  connectionWebhookSecret?: string;
}): boolean | null {
  if (input.provider === "shopify") {
    const signature = clean(input.headers.get("x-shopify-hmac-sha256"), 1000);
    if (!signature) return null;
    return verifyBase64HmacSha256(input.rawBody, signature, input.shopifyClientSecret || "");
  }
  if (input.provider === "woocommerce") {
    const signature = clean(input.headers.get("x-wc-webhook-signature"), 1000);
    if (!signature) return null;
    return verifyBase64HmacSha256(input.rawBody, signature, input.connectionWebhookSecret || "");
  }
  if (input.provider === "nuvemshop") {
    const signature = clean(input.headers.get("x-linkedstore-hmac-sha256"), 1000);
    if (!signature) return null;
    return verifyHexHmacSha256(input.rawBody, signature, input.nuvemshopClientSecret || "");
  }
  return null;
}
