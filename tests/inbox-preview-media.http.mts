import test, { before } from "node:test";
import assert from "node:assert/strict";

// Exercise the actual local Next router as well as the handler. Direct handler
// tests cannot detect an absent route in a running development server.
const origin = "http://127.0.0.1:3199";
const tenantId = "qa-conversation-preview-20261020", chatId = `${tenantId}-marina`;
let token = "";
before(async () => {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ email: "conversas@qa.invalid", password: "AltumDemo2026!", returnSecureToken: true }),
  });
  assert.equal(response.status, 200, "Seed the isolated preview before this check");
  token = (await response.json()).idToken;
});
test("every preview attachment URL returned by the real messages API serves its actual file", async () => {
  const response = await fetch(`${origin}/api/tenant/${tenantId}/chats/${chatId}/messages?limit=100`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(180000),
  });
  assert.equal(response.status, 200);
  const items = (await response.json()).items.filter((item: { type: string }) => ["audio", "image"].includes(item.type));
  assert.equal(items.length, 2);
  for (const item of items) {
    const url = new URL(item.mediaUrl, origin);
    assert.equal(url.origin, origin); assert.ok(url.pathname.startsWith(`/api/tenant/${tenantId}/chats/${chatId}/`));
    const media = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(180000) });
    assert.equal(media.status, 200, `${item.type}: ${media.status} ${media.headers.get("content-type")}`);
    const bytes = Buffer.from(await media.arrayBuffer());
    if (item.type === "audio") { assert.match(media.headers.get("content-type") || "", /^audio\/wav/); assert.equal(bytes.subarray(0, 4).toString(), "RIFF"); }
    else { assert.match(media.headers.get("content-type") || "", /^image\/svg\+xml/); assert.match(bytes.toString(), /<svg/); }
  }
});
test("the real media route still refuses an unauthenticated download", async () => {
  const response = await fetch(`${origin}/api/tenant/${tenantId}/chats/${chatId}/messages/${chatId}-message-3/media`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 401); assert.match(response.headers.get("content-type") || "", /application\/json/);
});
