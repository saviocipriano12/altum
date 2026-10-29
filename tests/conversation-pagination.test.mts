import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeConversationCursor, encodeConversationCursor } from "../lib/server/conversation-pagination.ts";

test("conversation cursors preserve timestamp and document identity", () => {
  const encoded = encodeConversationCursor(1_760_000_000_123, "message_same_timestamp_b");
  assert.ok(encoded);
  assert.deepEqual(decodeConversationCursor(encoded), {
    version: 1,
    timestampMs: 1_760_000_000_123,
    documentId: "message_same_timestamp_b",
  });
  assert.equal(decodeConversationCursor("not-a-valid-cursor"), null);
  assert.equal(encodeConversationCursor(0, "message"), null);
});

test("chat pagination is stable and never degrades to an unordered slice", async () => {
  const source = await readFile("app/api/tenant/[tenantId]/chats/route.ts", "utf8");
  const queries = await readFile("lib/server/conversation-queries.ts", "utf8");
  assert.match(queries, /orderBy\("lastMessageTime", "desc"\)/);
  assert.match(queries, /orderBy\(FieldPath\.documentId\(\), "desc"\)/);
  assert.match(queries, /startAfter\(Timestamp\.fromMillis\(cursor\.timestampMs\), cursor\.documentId\)/);
  assert.match(source, /import \{ listRecentChats \} from "@\/lib\/server\/conversation-queries"/);
  assert.match(source, /coverageComplete/);
  assert.doesNotMatch(source, /Indice de ordenacao da inbox indisponivel; usando fallback/);
});

test("message history supports older pages and drains every newer page", async () => {
  const route = await readFile("app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts", "utf8");
  const queries = await readFile("lib/server/conversation-queries.ts", "utf8");
  const inbox = await readFile("app/cliente/painel/inbox/page.tsx", "utf8");
  assert.match(queries, /type MessagePageDirection = "initial" \| "older" \| "newer"/);
  assert.match(queries, /orderBy\(FieldPath\.documentId\(\), ascending \? "asc" : "desc"\)/);
  assert.match(queries, /limit\(input\.limit \+ 1\)/);
  assert.match(route, /listChatMessages\(\{ chatId, direction, cursor, legacySinceMs, limit: pageLimit \}\)/);
  assert.doesNotMatch(route, /Indice de historico de mensagens indisponivel; usando fallback/);
  assert.match(inbox, /while \(hasMoreNewer && continuationCursor && drainedPages < 50\)/);
  assert.match(inbox, /Carregar mensagens anteriores/);
});

