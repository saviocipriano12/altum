// Prior claimWaitingReplyRuntime, extracted before the receipt migration.
// Source lib/server/automations.ts SHA256:
// aa923251625ddf293c7e4eda474c6892e6298194404cadc99ede8292fe422547
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../app/lib/server/firebase-admin.ts";
const AUTOMATION_WAITING_REPLY_RUNTIME_TYPE = "automation_waiting_reply_runtime";
function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `automation_${Date.now()}`;
}
export async function claimWaitingReplyRuntimeV2(input: {
  tenantId: string;
  automationId: string;
  chatId: string;
  waitingKey: string;
  leadId: string;
}) {
  const legacyRuntimeId = sanitizeId(
    `${input.tenantId}_${input.automationId}_${input.chatId}_${input.waitingKey}`,
    240
  );
  const runtimeId = `waiting_runtime_${createHash("sha256").update(JSON.stringify([input.tenantId, input.automationId, input.chatId, input.waitingKey])).digest("hex")}`;
  const runtimeRef = adminDb.collection("jobs").doc(runtimeId), legacyRef = adminDb.collection("jobs").doc(legacyRuntimeId);

  return adminDb.runTransaction(async (tx) => {
    const [snap, legacy] = await Promise.all([tx.get(runtimeRef), tx.get(legacyRef)]);
    const sameOccurrence = (row: FirebaseFirestore.DocumentData) => row.tenantId === input.tenantId && row.automationId === input.automationId && row.chatId === input.chatId && row.leadId === input.leadId && row.waitingKey === input.waitingKey;
    if (snap.exists) {
      if (!sameOccurrence(snap.data()!) || snap.data()?.runtimeProtocolVersion !== 2) throw new Error("Identidade da automacao de espera alterada.");
      return null;
    }
    if (legacy.exists && sameOccurrence(legacy.data()!)) return null;

    tx.set(runtimeRef, {
      tenantId: input.tenantId,
      type: AUTOMATION_WAITING_REPLY_RUNTIME_TYPE,
      runtimeProtocolVersion: 2,
      automationId: input.automationId,
      chatId: input.chatId,
      leadId: input.leadId,
      waitingKey: input.waitingKey,
      status: "claimed",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Fence old consumers atomically too. A legacy truncation collision never
    // overwrites the other occurrence; its exact hashed identity stays separate.
    if (!legacy.exists) tx.create(legacyRef, { tenantId: input.tenantId, type: "automation_waiting_reply_legacy_fence", automationId: input.automationId,
      chatId: input.chatId, leadId: input.leadId, waitingKey: input.waitingKey, status: "claimed", runtimeCanonicalId: runtimeId,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

    return runtimeRef;
  });
}
