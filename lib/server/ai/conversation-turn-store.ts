import { adminDb } from "@/app/lib/server/firebase-admin";
import { CONVERSATION_TURN_COLLECTION, getConversationTurnDocId, getLegacyConversationTurnDocId } from "./turn-coordinator";

/** A legacy key is usable only with its exact persisted owner. A colliding key
 * never supplies another conversation's latest message or processing lock. */
export async function prepareConversationTurn(tx: FirebaseFirestore.Transaction, tenantId: string, chatId: string, admission = false) {
  const ref = adminDb.collection(CONVERSATION_TURN_COLLECTION).doc(getConversationTurnDocId(tenantId, chatId));
  const legacyRef = adminDb.collection("ai_conversation_turns").doc(getLegacyConversationTurnDocId(tenantId, chatId));
  const [current, legacy] = await Promise.all([tx.get(ref), tx.get(legacyRef)]);
  const owned = (row: FirebaseFirestore.DocumentData | undefined) => row?.tenantId === tenantId && row?.chatId === chatId;
  if (current.exists && !owned(current.data())) throw new Error("AI_TURN_IDENTITY_CONFLICT");
  const legacyOwned = legacy.exists && owned(legacy.data());
  if (!admission && !current.exists && legacy.exists && !legacyOwned) throw new Error("AI_TURN_LEGACY_IDENTITY_CONFLICT");
  const currentAt = current.updateTime, legacyAt = legacy.updateTime;
  const legacyAdvanced = legacyOwned && currentAt && legacyAt &&
    (legacyAt.seconds > currentAt.seconds || legacyAt.seconds === currentAt.seconds && legacyAt.nanoseconds > currentAt.nanoseconds) &&
    typeof legacy.data()?.latestMessageId === "string" && legacy.data()?.latestMessageId !== current.data()?.latestMessageId;
  const migrateLegacy = legacyOwned && (!current.exists || Boolean(legacyAdvanced));
  return { ref, current, legacyRef, legacy, legacyOwned, tenantId, chatId,
    migrateLegacy, snapshot: migrateLegacy ? legacy : current };
}

export function writeConversationTurn(tx: FirebaseFirestore.Transaction, prepared: Awaited<ReturnType<typeof prepareConversationTurn>>, patch: FirebaseFirestore.DocumentData, mirrorLegacy = true) {
  const owner = { tenantId: prepared.tenantId, chatId: prepared.chatId };
  tx.set(prepared.ref, { ...(prepared.migrateLegacy || !prepared.current.exists ? prepared.snapshot.data() || {} : {}), ...patch, ...owner, coordinationProtocolVersion: 2 }, { merge: true });
  if (mirrorLegacy && (!prepared.legacy.exists || prepared.legacyOwned)) tx.set(prepared.legacyRef, { ...patch, ...owner }, { merge: true });
}

export async function readConversationTurnWithVersions(tenantId: string, chatId: string) {
  const prepared = await adminDb.runTransaction(async tx => {
    const plan = await prepareConversationTurn(tx, tenantId, chatId);
    if (plan.migrateLegacy) writeConversationTurn(tx, plan, {}, false);
    return plan;
  });
  const snapshot = prepared.migrateLegacy ? await prepared.ref.get() : prepared.snapshot;
  return { snapshot, versions: [snapshot, ...(prepared.legacyOwned ? [prepared.legacy] : [])] };
}
export async function readConversationTurn(tenantId: string, chatId: string) {
  return (await readConversationTurnWithVersions(tenantId, chatId)).snapshot;
}
