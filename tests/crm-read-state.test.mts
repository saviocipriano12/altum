import assert from "node:assert/strict";
import test from "node:test";
import { commercialReadNotice, commercialReadStatus, canReplaceCommercialReadState } from "../lib/crm-read-state.ts";

test("a completed check adds no decorative notice, but a failure points to the actual conversation", () => {
  assert.equal(commercialReadNotice({ status: "checked", chatId: "one" }), null);
  const notice = commercialReadNotice({ status: "media_failed", chatId: "one & two" });
  assert.equal(notice?.title, "Não foi possível interpretar a mídia");
  assert.equal(notice?.href, "/cliente/painel/inbox?chatId=one%20%26%20two");
});
test("missing interpretation, media error and semantic limit do not look like a successful analysis", () => {
  assert.equal(commercialReadStatus({ mediaType: "audio", mediaError: false, mediaInterpreted: false, semanticStatus: "no_customer_text" }), "awaiting_media");
  assert.equal(commercialReadStatus({ mediaType: "image", mediaError: true, mediaInterpreted: false, semanticStatus: "completed" }), "media_failed");
  assert.equal(commercialReadStatus({ mediaType: "text", mediaError: false, mediaInterpreted: false, semanticStatus: "budget_exhausted" }), "limited");
  assert.equal(commercialReadStatus({ mediaType: "text", mediaError: false, mediaInterpreted: false, semanticStatus: "review_required" }), "needs_review");
  assert.equal(commercialReadStatus({ mediaType: "audio", mediaError: false, mediaInterpreted: true, semanticStatus: "completed" }), "checked");
});
test("older activity cannot replace the notice for a more recent source, including a sub-millisecond tie", () => {
  const current = { status: "checked" as const, messageId: "new", chatId: "chat", occurredAtMs: 1000, sourceCreatedAtMs: 2000, sourceOrder: "000000000002:000900000" };
  assert.equal(canReplaceCommercialReadState(current, { ...current, status: "needs_review", occurredAtMs: 999 }), false);
  assert.equal(canReplaceCommercialReadState(current, { ...current, status: "needs_review", sourceOrder: "000000000002:000800000" }), false);
  assert.equal(canReplaceCommercialReadState(current, { ...current, status: "needs_review", occurredAtMs: 1001 }), true);
});
test("unrecognized or malformed source metadata creates no misleading banner", () => {
  for (const status of ["constructor", "toString", "unknown", "checked"]) assert.equal(commercialReadNotice({ status, chatId: "chat" }), null);
  assert.equal(commercialReadNotice({ status: "needs_review", chatId: "wrong/path" }), null);
  assert.equal(commercialReadNotice({ status: "needs_review" }), null);
});
