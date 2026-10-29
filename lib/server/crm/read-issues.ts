import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { canReplaceCommercialReadState, commercialReadNotice, type CommercialReadState } from "@/lib/crm-read-state";

function sourceKey(state: CommercialReadState) {
  return createHash("sha256").update(JSON.stringify([state.chatId, state.messageId, state.sourceOrder || state.sourceCreatedAtMs])).digest("hex");
}

/** Call after authority/source reads and before any other transaction writes. */
export async function projectCommercialReadIssues(tx: Transaction, leadRef: DocumentReference, current: unknown, state: CommercialReadState, generation: string) {
  const previous = current && typeof current === "object" ? current as Record<string, unknown> : {};
  // Restoring the complete dossier retains its scope. Recreating only the parent
  // starts another scope, so orphaned children cannot contaminate a new customer.
  const scope = previous.issuesVersion === 1 && typeof previous.issuesScope === "string" ? previous.issuesScope : generation;
  const issues = leadRef.collection("commercial_read_issues");
  const key = (value: CommercialReadState) => createHash("sha256").update(`${scope}:${sourceKey(value)}`).digest("hex");
  const ref = issues.doc(key(state));
  const [existing, open] = await Promise.all([tx.get(ref), tx.get(issues.where("scope", "==", scope).where("resolved", "==", false).limit(2))]);
  const humanReviewed = existing.data()?.resolution === "manual" && !!state.sourceRevision && existing.data()?.reviewedSourceRevision === state.sourceRevision;
  const unresolved = state.status !== "checked" && !humanReviewed;
  let count = previous.issuesVersion === 1 && Number.isSafeInteger(previous.pendingCount) ? Math.max(0, Number(previous.pendingCount)) : 0;
  const wasOpen = existing.exists && existing.data()?.resolved === false;
  count += Number(unresolved) - Number(wasOpen);
  let representative = open.docs.find(doc => doc.id !== ref.id)?.data()?.state as CommercialReadState | undefined;

  // Preserve the pre-ledger warning on the first update after upgrading.
  const legacy = previous as unknown as CommercialReadState;
  if (previous.issuesVersion !== 1 && commercialReadNotice(previous) && typeof legacy.messageId === "string" &&
      typeof legacy.sourceCreatedAtMs === "number" && key(legacy) !== ref.id) {
    tx.set(issues.doc(key(legacy)), { state: legacy, scope, resolved: false, updatedAt: FieldValue.serverTimestamp() });
    count++;
    representative ||= legacy;
  }
  if (unresolved) representative = state;
  tx.set(ref, { state, scope, resolved: !unresolved, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const latest = canReplaceCommercialReadState(previous, state) ? state : previous;
  return { ...latest, checkedAt: FieldValue.serverTimestamp(), issuesVersion: 1, issuesScope: scope,
    pendingCount: Math.max(0, count), pendingSource: representative || null };
}
