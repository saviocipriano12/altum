import test from "node:test";
import assert from "node:assert/strict";
import { InboxDraftStore, inboxDraftKey, INBOX_DRAFT_TTL_MS } from "../lib/inbox-drafts.ts";

function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  return { storage, values };
}
const key = inboxDraftKey("tenant", "user", "chat:1");

test("lead retries retain their original channel even when the dropdown changes", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage);
  store.setText(key, "Ola");
  store.beginAttempt(key, "Ola", null, () => "start-one", { channelId: "channel-a" });
  const retried = new InboxDraftStore(storage).beginAttempt(key, "Ola", null, () => "must-not-be-used", { channelId: "channel-b" });
  assert.equal(retried.attempt.id, "start-one");
  assert.equal(retried.attempt.channelId, "channel-a");
});

test("Meta preparation transfers the unsent lead draft rather than acknowledging it as sent", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage), target = inboxDraftKey("tenant", "user", "chat:prepared");
  store.setText(key, "  Quero conversar\n🙂  ");
  store.beginAttempt(key, "Quero conversar\n🙂", null, () => "start-one");
  assert.equal(store.completeLeadStart(key, target, "start-one", false).moved, true);
  assert.equal(new InboxDraftStore(storage).read(target).text, "  Quero conversar\n🙂  ");
  assert.equal(store.read(target).attempt, undefined);
  assert.equal(store.read(key).text, "");
});

test("a queued lead start clears only the acknowledged text and transfers a newer draft", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage), target = inboxDraftKey("tenant", "user", "chat:started");
  store.setText(key, "Texto original");
  store.beginAttempt(key, "Texto original", null, () => "start-one");
  store.setText(key, "Nova mensagem nao enviada");
  store.completeLeadStart(key, target, "start-one", true);
  assert.equal(store.read(target).text, "Nova mensagem nao enviada");
  assert.equal(store.read(target).attempt, undefined);
  assert.equal(store.read(key).text, "");
});

test("lead handoff never overwrites an existing destination draft or a newer attempt", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage), target = inboxDraftKey("tenant", "user", "chat:existing");
  store.setText(key, "Texto do lead"); store.setText(target, "Rascunho da conversa");
  store.beginAttempt(key, "Texto do lead", null, () => "start-one");
  assert.equal(store.completeLeadStart(key, target, "wrong-attempt", false).applied, false);
  assert.equal(store.completeLeadStart(key, target, "start-one", false).moved, false);
  assert.equal(store.read(key).text, "Texto do lead");
  assert.equal(store.read(target).text, "Rascunho da conversa");
});

test("blocked target persistence leaves the source draft intact", () => {
  const values = new Map<string, string>(), target = inboxDraftKey("tenant", "user", "chat:blocked");
  const storage = { getItem: (key: string) => values.get(key) || null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (name: string, value: string) => { if (name === target) throw new Error("quota"); values.set(name, value); } };
  const store = new InboxDraftStore(storage);
  store.setText(key, "Nao perder"); store.beginAttempt(key, "Nao perder", null, () => "start-one");
  const result = store.completeLeadStart(key, target, "start-one", false);
  assert.equal(result.persisted, false); assert.equal(result.moved, false);
  assert.equal(new InboxDraftStore(storage).read(key).text, "Nao perder");
});

test("draft text survives reload and conversation switches with exact whitespace", () => {
  const { storage } = fixture();
  const first = new InboxDraftStore(storage);
  first.setText(key, "  Ola\nproposta 🙂  ");
  first.setText(inboxDraftKey("tenant", "user", "chat:2"), "Outra conversa");
  assert.equal(new InboxDraftStore(storage).read(key).text, "  Ola\nproposta 🙂  ");
});
test("tenant, operator and delimiter-containing identities cannot share draft keys", () => {
  const keys = [inboxDraftKey("a:b", "c", "d"), inboxDraftKey("a", "b:c", "d"),
    inboxDraftKey("a:b", "other", "d"), inboxDraftKey("a:b", "c", "other")];
  assert.equal(new Set(keys).size, 4);
});
test("uncertain send reuses request ID and reply target after reload", () => {
  const { storage } = fixture();
  const first = new InboxDraftStore(storage);
  first.setText(key, "Ola");
  first.beginAttempt(key, "Ola", "message-replied", () => "request-1");
  const second = new InboxDraftStore(storage);
  assert.deepEqual(second.beginAttempt(key, "Ola", null, () => "must-not-be-used").attempt,
    { id: "request-1", text: "Ola", replyToId: "message-replied" });
});
test("acknowledgement clears only the matching attempt and its original draft", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage);
  const other = inboxDraftKey("tenant", "user", "chat:2");
  store.setText(key, "Ola"); store.setText(other, "Nao apagar");
  store.beginAttempt(key, "Ola", null, () => "one");
  assert.equal(store.acknowledge(key, "wrong").text, "Ola");
  assert.equal(store.acknowledge(key, "one").text, "");
  assert.equal(store.read(other).text, "Nao apagar");
  assert.equal(storage.getItem(key), null);
});
test("late acknowledgement preserves text edited while request was pending", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage);
  store.setText(key, "Primeira");
  store.beginAttempt(key, "Primeira", null, () => "one");
  store.setText(key, "Segunda");
  assert.equal(store.acknowledge(key, "one").text, "Segunda");
});
test("old acknowledgement cannot clear a newer send attempt", () => {
  const { storage } = fixture();
  const store = new InboxDraftStore(storage);
  store.setText(key, "Primeira"); store.beginAttempt(key, "Primeira", null, () => "one");
  store.setText(key, "Segunda"); store.beginAttempt(key, "Segunda", null, () => "two");
  assert.equal(store.acknowledge(key, "one").attempt?.id, "two");
});
test("blocked browser storage retains in-memory drafts and signals persistence failure", () => {
  const denied = () => { throw new Error("Storage denied"); };
  const store = new InboxDraftStore({ getItem: denied, setItem: denied, removeItem: denied });
  assert.equal(store.setText(key, "Nao perder").persisted, false);
  assert.equal(store.read(key).text, "Nao perder");
  const attempt = store.beginAttempt(key, "Nao perder", null, () => "one");
  assert.equal(attempt.persisted, false);
  assert.equal(store.beginAttempt(key, "Nao perder", null, () => "two").attempt.id, "one");
});
test("expired and malformed drafts are not restored", () => {
  const { storage, values } = fixture();
  let now = 100;
  const store = new InboxDraftStore(storage, () => now);
  store.setText(key, "Expira");
  now += INBOX_DRAFT_TTL_MS;
  assert.equal(store.read(key).text, "");
  values.set(key, "{invalid");
  assert.equal(new InboxDraftStore(storage).read(key).text, "");
  values.set(key, JSON.stringify({ version: 1, text: "bad", updatedAt: now, attempt: { id: 12 } }));
  assert.equal(new InboxDraftStore(storage, () => now).read(key).text, "");
});
