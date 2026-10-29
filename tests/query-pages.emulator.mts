import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readQueryPages } from "../lib/server/query-pages.ts";

// This suite cannot fall back to a real Firebase project.
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("Local Firestore emulator required");
const app = initializeApp({ projectId: "demo-altum-query-pages" }, `query-pages-${Date.now()}`);
const db = getFirestore(app);
const collection = db.collection(`qa_query_pages_${Date.now()}`);

before(async () => {
  for (let offset = 0; offset < 2101; offset += 400) {
    const batch = db.batch();
    for (let index = offset; index < Math.min(offset + 400, 2101); index++) {
      batch.set(collection.doc(String(index).padStart(5, "0")), {
        tenantId: index === 2100 ? "other" : "target",
        name: index === 2099 ? "Cliente além de todos os limites antigos" : `Contato ${index}`,
        ...(index % 2 ? { createdAt: new Date() } : {}),
      });
    }
    await batch.commit();
  }
});
after(async () => { await db.recursiveDelete(collection); await deleteApp(app); });

test("reads beyond 180/350/700/1800 without dropping undated records or crossing tenants", async () => {
  const result = await readQueryPages(collection.where("tenantId", "==", "target"));
  assert.equal(result.size, 2100);
  assert.equal(new Set(result.docs.map(doc => doc.id)).size, 2100);
  assert.equal(result.docs.at(-1)?.data().name, "Cliente além de todos os limites antigos");
  assert.equal(result.docs.filter(doc => !doc.data().createdAt).length, 1050);
  assert.ok(result.docs.every(doc => doc.data().tenantId === "target"));
});

test("handles an exact page multiple and an empty query", async () => {
  const full = await readQueryPages(collection.where("tenantId", "==", "target"), 300);
  assert.equal(full.size, 2100);
  const empty = await readQueryPages(collection.where("tenantId", "==", "missing"));
  assert.deepEqual(empty, { docs: [], size: 0, empty: true });
});

test("rejects invalid page sizes and an aborted request", async () => {
  await assert.rejects(readQueryPages(collection, 0), /INVALID_QUERY_PAGE_SIZE/);
  await assert.rejects(readQueryPages(collection, 1001), /INVALID_QUERY_PAGE_SIZE/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(readQueryPages(collection, 400, abort.signal), { name: "AbortError" });
});
