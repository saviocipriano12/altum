import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

/** Read the complete tenant catalogue in one transaction. Callers bound the
 * accepted event plans; unrelated definitions must not consume that limit. */
export async function visitTenantAutomationCatalogue(
  tx: FirebaseFirestore.Transaction,
  tenantId: string,
  visit: (id: string, data: FirebaseFirestore.DocumentData, snapshot: FirebaseFirestore.QueryDocumentSnapshot) => void,
  assertActive: () => void,
) {
  const query = adminDb.collection("automations").where("tenantId", "==", tenantId)
    .orderBy(FieldPath.documentId()).limit(100);
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    assertActive();
    const page = await tx.get(cursor ? query.startAfter(cursor) : query);
    assertActive();
    for (const doc of page.docs) visit(doc.id, doc.data(), doc);
    if (page.size < 100) return;
    cursor = page.docs[page.docs.length - 1];
  }
}
