import { adminDb } from "@/app/lib/server/firebase-admin";

export class ContactLinkError extends Error {}

export function isContactRecordId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 220 && value === value.trim() && !value.includes("/") && value !== "." && value !== "..";
}

export function contactLinkedLeadIds(row: FirebaseFirestore.DocumentData) {
  if (row.leadIds !== undefined && row.leadIds !== null && !Array.isArray(row.leadIds)) throw new ContactLinkError("Identidade conflitante: lista de negociacoes invalida.");
  const ids: unknown[] = [row.leadId, row.primaryLeadId].filter(value => value !== undefined && value !== null && value !== "");
  ids.push(...(Array.isArray(row.leadIds) ? row.leadIds : []));
  if (!ids.every(isContactRecordId)) throw new ContactLinkError("Identidade conflitante: negociacao vinculada invalida.");
  return [...new Set(ids)];
}

/** Read redirects within one company. Callers still have to verify reciprocal
 * commercial links and apply record/channel authorization before exposing data. */
export function contactLinkReader(tenantId: string, tx?: FirebaseFirestore.Transaction) {
  const cache = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  return async (contactId: unknown) => {
    let id = contactId;
    const visited = new Set<string>();
    for (let depth = 0; depth < 32; depth++) {
      if (!isContactRecordId(id) || visited.has(id)) throw new ContactLinkError("Identidade conflitante: vinculo do cliente invalido ou circular.");
      visited.add(id);
      let snapshot = cache.get(id);
      if (!snapshot) {
        const ref = adminDb.collection("contacts").doc(id);
        snapshot = tx ? await tx.get(ref) : await ref.get();
        cache.set(id, snapshot);
      }
      const row = snapshot.data();
      if (!row || row.tenantId !== tenantId) throw new ContactLinkError("Identidade conflitante: cliente ausente ou fora desta empresa.");
      if (!row.canonicalContactId || row.canonicalContactId === id) return snapshot;
      id = row.canonicalContactId;
    }
    throw new ContactLinkError("Identidade conflitante: redirecionamentos do cliente precisam de revisao.");
  };
}
