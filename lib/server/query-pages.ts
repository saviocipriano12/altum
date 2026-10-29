import { FieldPath, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Read the entire scoped query. A page size is never a limit on business data. */
export async function readQueryPages<T extends DocumentData>(query: Query<T>, pageSize = 400, signal?: AbortSignal) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("INVALID_QUERY_PAGE_SIZE");
  }
  const docs: QueryDocumentSnapshot<T>[] = [];
  const ordered = query.orderBy(FieldPath.documentId());
  let cursor: QueryDocumentSnapshot<T> | undefined;
  for (;;) {
    signal?.throwIfAborted();
    const page = await (cursor ? ordered.startAfter(cursor) : ordered).limit(pageSize).get();
    signal?.throwIfAborted();
    docs.push(...page.docs);
    if (page.size < pageSize) break;
    const next = page.docs[page.docs.length - 1];
    if (!next || next.id === cursor?.id) throw new Error("QUERY_CURSOR_DID_NOT_ADVANCE");
    cursor = next;
  }
  return { docs, size: docs.length, empty: docs.length === 0 };
}
