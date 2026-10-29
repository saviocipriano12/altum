import assert from "node:assert/strict";
import test from "node:test";
import { conversationSourceHref, selectReferencedMessage, referencedMessageChanged } from "../lib/conversation-source-link.ts";
test("CRM source links encode exact message and generation while legacy conversation links still work", () => {
  const href = conversationSourceHref("chat & one", "message ? one", "001234567890:000000001")!;
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("chatId"), "chat & one"); assert.equal(url.searchParams.get("messageId"), "message ? one");
  assert.equal(url.searchParams.get("messageGeneration"), "001234567890:000000001");
  assert.equal(conversationSourceHref("chat"), "/cliente/painel/inbox?chatId=chat");
  assert.equal(conversationSourceHref("invalid/path", "message"), null);
  assert.equal(conversationSourceHref("chat", "invalid/path"), "/cliente/painel/inbox?chatId=chat");
  const longId = "m".repeat(300);
  assert.equal(new URL(conversationSourceHref("chat", longId)!, "http://localhost").searchParams.get("messageId"), longId);
  assert.equal(selectReferencedMessage({ items: [{ id: longId }] }, longId).id, longId);
  assert.throws(() => selectReferencedMessage({ items: [{ id: `${longId}x` }] }, `${longId}x`), /não está disponível/);
});
test("a changed message revision is explicit while timestamp padding does not invent a change", () => {
  assert.equal(referencedMessageChanged("001234567890:000000001", "1234567890:1"), false);
  assert.equal(referencedMessageChanged("001234567890:000000002", "1234567890:1"), true);
  assert.equal(referencedMessageChanged(undefined, "1234567890:1"), true);
  assert.equal(referencedMessageChanged("001234567890:000000001", undefined), false);
});
test("direct lookup accepts only the requested single source and refuses a recreated message", () => {
  const message = { id: "source", generation: "001234567890:000000001", text: "Mensagem fictícia" };
  assert.equal(selectReferencedMessage({ items: [message] }, "source", message.generation), message);
  for (const items of [[], [{ ...message, id: "other" }], [message, message]])
    assert.throws(() => selectReferencedMessage({ items }, "source"), /não está disponível/);
  assert.throws(() => selectReferencedMessage({ items: [message] }, "source", "001234567890:000000002"), /foi substituída/);
  assert.throws(() => selectReferencedMessage({ items: [{ id: "source" }] }, "source", message.generation), /foi substituída/);
  assert.throws(() => selectReferencedMessage({ items: [message] }, "../other"), /não está disponível/);
});
