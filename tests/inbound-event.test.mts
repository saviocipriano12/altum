import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCanonicalInboundEvent,
  shouldAdvanceConversationCursor,
} from "../lib/server/messaging/inbound-event.ts";

const base = {
  tenantId: "tenant-a",
  channel: "instagram",
  channelId: "page-1",
  provider: "meta",
  providerEventId: "mid-123",
  senderExternalId: "person-9",
  recipientExternalId: "page-1",
  occurredAt: 1_700_000_000_000,
  receivedAt: 1_700_000_001_000,
  text: "Quero saber mais",
};

test("canonical identities isolate tenant, channel account and sender", () => {
  const first = normalizeCanonicalInboundEvent(base);
  const repeated = normalizeCanonicalInboundEvent(base);
  const otherTenant = normalizeCanonicalInboundEvent({ ...base, tenantId: "tenant-b" });
  const otherPage = normalizeCanonicalInboundEvent({ ...base, channelId: "page-2" });
  assert.equal(first.accepted, true);
  assert.equal(repeated.accepted, true);
  if (!first.accepted || !repeated.accepted || !otherTenant.accepted || !otherPage.accepted) return;
  assert.equal(first.event.eventKey, repeated.event.eventKey);
  assert.equal(first.event.messageDocumentId, repeated.event.messageDocumentId);
  assert.notEqual(first.event.conversationIdentityKey, otherTenant.event.conversationIdentityKey);
  assert.notEqual(first.event.conversationIdentityKey, otherPage.event.conversationIdentityKey);
});

test("missing provider ids use a deterministic fingerprint only when timestamp is available", () => {
  const withoutId = normalizeCanonicalInboundEvent({ ...base, providerEventId: "" });
  const repeated = normalizeCanonicalInboundEvent({ ...base, providerEventId: "" });
  assert.equal(withoutId.accepted, true);
  assert.equal(repeated.accepted, true);
  if (!withoutId.accepted || !repeated.accepted) return;
  assert.equal(withoutId.event.eventKey, repeated.event.eventKey);
  assert.ok(withoutId.event.normalizationNotes.includes("provider_event_id_missing_fingerprint_used"));

  const unsafe = normalizeCanonicalInboundEvent({ ...base, providerEventId: "", occurredAt: null });
  assert.deepEqual(unsafe, { accepted: false, reason: "missing_idempotency_identity" });
});

test("text, captions and every attachment survive normalization", () => {
  const result = normalizeCanonicalInboundEvent({
    ...base,
    text: "Veja os arquivos",
    attachments: [
      { type: "image", caption: "frente", url: "https://example.com/front.jpg" },
      { type: "file", name: "proposta.pdf", mimeType: "application/pdf" },
    ],
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.event.attachments.length, 2);
  assert.equal(result.event.messageType, "image");
  assert.match(result.event.text, /Veja os arquivos/);
  assert.match(result.event.text, /frente/);
  assert.match(result.event.text, /Imagem recebida/);
  assert.match(result.event.text, /Arquivo recebido/);
});

test("quoted message and campaign context are bounded and preserved", () => {
  const result = normalizeCanonicalInboundEvent({
    ...base,
    quotedMessage: { providerMessageId: "old-mid", senderExternalId: "page-1", text: "Oferta anterior" },
    campaign: { id: "campaign-1", name: "Black Friday", source: "meta", medium: "paid", adId: "ad-9" },
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.event.quotedMessage?.providerMessageId, "old-mid");
  assert.equal(result.event.campaign?.adId, "ad-9");
});

test("provider timestamps drive ordering and future clock skew is contained", () => {
  const delayed = normalizeCanonicalInboundEvent({
    ...base,
    occurredAt: 1_700_000_000_000,
    receivedAt: 1_700_001_000_000,
  });
  assert.equal(delayed.accepted, true);
  if (!delayed.accepted) return;
  assert.equal(delayed.event.deliveryClass, "delayed");
  assert.equal(delayed.event.orderingTimestampMs, 1_700_000_000_000);

  const future = normalizeCanonicalInboundEvent({
    ...base,
    occurredAt: 1_700_002_000_000,
    receivedAt: 1_700_000_000_000,
  });
  assert.equal(future.accepted, true);
  if (!future.accepted) return;
  assert.equal(future.event.deliveryClass, "future_clock_skew");
  assert.equal(future.event.orderingTimestampMs, 1_700_000_000_000);
});

test("conversation cursor never moves backwards for an older event", () => {
  assert.equal(shouldAdvanceConversationCursor({ incomingOccurredAtMs: 200 }), true);
  assert.equal(shouldAdvanceConversationCursor({ previousOccurredAtMs: 200, incomingOccurredAtMs: 200 }), true);
  assert.equal(shouldAdvanceConversationCursor({ previousOccurredAtMs: 300, incomingOccurredAtMs: 200 }), false);
});
