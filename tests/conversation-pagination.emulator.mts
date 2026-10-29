import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-conversation-pagination";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_pagination_${suffix}`;
const chatId = `chat_history_${suffix}`;
const baseTime = 1_760_000_000_000;

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.GCLOUD_PROJECT = PROJECT_ID;

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let listRecentChats: typeof import("../lib/server/conversation-queries.ts").listRecentChats;
let listChatMessages: typeof import("../lib/server/conversation-queries.ts").listChatMessages;

async function commitRows(collection: string, rows: Array<{ id: string; data: Record<string, unknown> }>) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = adminDb.batch();
    for (const row of rows.slice(offset, offset + 400)) {
      batch.set(adminDb.collection(collection).doc(row.id), row.data);
    }
    await batch.commit();
  }
}

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  ({ listRecentChats } = await import("../lib/server/conversation-queries.ts"));
  ({ listChatMessages } = await import("../lib/server/conversation-queries.ts"));

  await commitRows("chats", Array.from({ length: 1501 }, (_, index) => ({
    id: `page_chat_${String(index).padStart(4, "0")}_${suffix}`,
    data: {
      tenantId,
      contactName: index === 1200 ? "Conversa numero 1201" : `Contato ${index}`,
      // Pairs deliberately share a timestamp to exercise the document-id tie breaker.
      lastMessageTime: new Date(baseTime + Math.floor(index / 2) * 1000),
    },
  })));
  await commitRows("messages", Array.from({ length: 2001 }, (_, index) => ({
    id: `page_message_${String(index).padStart(4, "0")}_${suffix}`,
    data: {
      tenantId,
      chatId,
      text: `Mensagem ${index}`,
      createdAt: new Date(baseTime + Math.floor(index / 3) * 1000),
    },
  })));
});

after(async () => {
  for (const collection of ["chats", "messages"]) {
    const snapshot = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
      const batch = adminDb.batch();
      snapshot.docs.slice(offset, offset + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
});

test("1,501 conversations are reachable exactly once through stable cursors", async () => {
  const ids: string[] = [];
  let cursor: { version: 1; timestampMs: number; documentId: string } | null = null;
  for (let page = 0; page < 30; page += 1) {
    const snapshot = await listRecentChats(tenantId, 100, cursor);
    const docs = snapshot.docs.slice(0, 100);
    ids.push(...docs.map((doc) => doc.id));
    if (snapshot.size <= 100) break;
    const last = docs[docs.length - 1];
    cursor = { version: 1, timestampMs: last.data().lastMessageTime.toDate().getTime(), documentId: last.id };
  }
  assert.equal(ids.length, 1501);
  assert.equal(new Set(ids).size, 1501);
  assert.ok(ids.includes(`page_chat_1200_${suffix}`));
});

test("2,001 historical messages load backwards without gaps or duplicates", async () => {
  const ids: string[] = [];
  let direction: "initial" | "older" = "initial";
  let cursor: { version: 1; timestampMs: number; documentId: string } | null = null;
  for (let page = 0; page < 20; page += 1) {
    const snapshot = await listChatMessages({ chatId, direction, cursor, legacySinceMs: null, limit: 200 });
    const docs = snapshot.docs.slice(0, 200);
    ids.push(...docs.map((doc) => doc.id));
    if (snapshot.size <= 200) break;
    const last = docs[docs.length - 1];
    cursor = { version: 1, timestampMs: last.data().createdAt.toDate().getTime(), documentId: last.id };
    direction = "older";
  }
  assert.equal(ids.length, 2001);
  assert.equal(new Set(ids).size, 2001);
});

test("a burst above 1,000 messages drains forwards without loss", async () => {
  const ids: string[] = [];
  let cursor: { version: 1; timestampMs: number; documentId: string } | null = {
    version: 1,
    timestampMs: baseTime - 1000,
    documentId: "before_first_message",
  };
  for (let page = 0; page < 20; page += 1) {
    const snapshot = await listChatMessages({ chatId, direction: "newer", cursor, legacySinceMs: null, limit: 200 });
    const docs = snapshot.docs.slice(0, 200);
    ids.push(...docs.map((doc) => doc.id));
    if (snapshot.size <= 200) break;
    const last = docs[docs.length - 1];
    cursor = { version: 1, timestampMs: last.data().createdAt.toDate().getTime(), documentId: last.id };
  }
  assert.equal(ids.length, 2001);
  assert.equal(new Set(ids).size, 2001);
});

