import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Meta and WhatsApp webhooks use the canonical inbound contract", async () => {
  const [meta, whatsapp] = await Promise.all([
    readFile(new URL("../app/api/webhooks/meta/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/webhooks/whatsapp/route.ts", import.meta.url), "utf8"),
  ]);

  for (const source of [meta, whatsapp]) {
    assert.match(source, /normalizeCanonicalInboundEvent/);
    assert.match(source, /inbound\.eventKey/);
    assert.match(source, /inbound\.messageDocumentId/);
    assert.match(source, /providerOccurredAtMs/);
    assert.match(source, /conversationIdentityKey/);
    assert.match(source, /recordInboundEventMetricSafe/);
    assert.match(source, /processed_out_of_order/);
  }
});

test("Meta conversation lookup distinguishes channel accounts", async () => {
  const [meta, identity] = await Promise.all([
    readFile(new URL("../app/api/webhooks/meta/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/social-chat-identity.ts", import.meta.url), "utf8"),
  ]);
  assert.match(meta, /resolveCanonicalSocialChat/);
  assert.match(identity, /clean\(document\.data\(\)\.channelId\) === input\.channelId/);
  assert.match(identity, /socialChatIdentityId/);
  assert.match(meta, /lastInboundOccurredAtMs/);
  assert.match(meta, /attachments: inbound\.attachments/);
  assert.doesNotMatch(meta, /eventId: messageId \|\| `\$\{senderId\}_\$\{recipientId\}_\$\{timestamp \|\| Date\.now\(\)\}`/);
});

test("WhatsApp official and gateway paths share channel-scoped chat identity", async () => {
  const whatsapp = await readFile(new URL("../app/api/webhooks/whatsapp/route.ts", import.meta.url), "utf8");
  const calls = whatsapp.match(/resolveCanonicalWhatsAppChat\(/g) || [];
  assert.ok(calls.length >= 2);
  assert.match(whatsapp, /channelId: channel\.id/);
  assert.doesNotMatch(whatsapp, /`generic_\$\{Date\.now\(\)\}_\$\{from\}`/);
});
