import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { matchesConversationCommercialFence, type ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import { inboundAnnotationFields, inboundOriginalFields, inboundSourceProof } from "@/lib/server/ai/inbound-enrichment-source";
import { prepareConversationCommercialObservation } from "@/lib/server/crm/conversation-observation-queue";

type Context = { tenantId: string; chatId: string; messageId: string; conversationFence?: ConversationCommercialFence };
const annotationFields = inboundAnnotationFields;
const annotations = (row: FirebaseFirestore.DocumentData) => Object.fromEntries(annotationFields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
const originalFields = inboundOriginalFields;
const correctFence = (input: Context) => !input.conversationFence || input.conversationFence.tenantId === input.tenantId && input.conversationFence.chatId === input.chatId && input.conversationFence.messageId === input.messageId;

/** The supplied message must be the persisted source, not model-generated data.
 * Check before media retrieval/model calls as well as before their result writes. */
export async function loadInboundEnrichmentSource(input: Context & { message: Record<string, unknown> }) {
  if (!correctFence(input)) return null;
  const source = await adminDb.collection("messages").doc(input.messageId).get(), row = source.data();
  if (!row || row.tenantId !== input.tenantId || row.chatId !== input.chatId || !isDeepStrictEqual(row, input.message)) return null;
  if (input.conversationFence && !await adminDb.runTransaction(tx => matchesConversationCommercialFence(tx, input.conversationFence!), { readOnly: true })) return null;
  return source;
}

/** An authorized enrichment may advance the message revision once. Rebase only
 * our own annotation write, with the same generation and unchanged source body.
 * Never take a fresh arbitrary revision after transcription and call it valid. */
export async function commitInboundMessageEnrichment(input: Context & { source: FirebaseFirestore.DocumentSnapshot; patch: Record<string, unknown> }) {
  if (!correctFence(input) || input.source.id !== input.messageId || !input.source.exists ||
      input.source.data()?.tenantId !== input.tenantId || input.source.data()?.chatId !== input.chatId) return { applied: false as const };
  if (Object.keys(input.patch).some(key => !annotationFields.includes(key))) throw new Error("INBOUND_ENRICHMENT_PATCH_INVALID");
  const token = randomUUID(), ref = input.source.ref;
  const committed = await adminDb.runTransaction(async tx => {
    if (input.conversationFence && !await matchesConversationCommercialFence(tx, input.conversationFence)) return false;
    const current = await tx.get(ref);
    if (current.data()?.tenantId !== input.tenantId || current.data()?.chatId !== input.chatId ||
        !current.createTime?.isEqual(input.source.createTime!) || !current.updateTime?.isEqual(input.source.updateTime!)) return false;
    const job = await prepareConversationCommercialObservation(tx, { ...input, source: "media_enrichment" });
    if (job.status !== "awaiting_context" && !job.sourceBinding) throw new Error("CRM_OBSERVATION_ENRICHMENT_BINDING_MISSING");
    tx.update(ref, { ...input.patch, aiMediaSourceProof: inboundSourceProof(input.source.data()!, input.source.createTime!),
      aiMediaWriteToken: token, aiMediaProcessedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    // Reopen even a completed observation: it may have run before the audio was transcribed.
    // Atomic with the annotation, so a crash cannot lose this second pass.
    if (job.status === "awaiting_context") tx.set(job.ref, job.write!, { merge: true });
    else {
      tx.set(job.ref, { ...(job.write || {}), status: "ready", attempts: 0, dueAt: new Date(), completedAt: null,
        sourceBinding: { ...job.sourceBinding!, messageRevision: null }, enrichmentToken: token,
        leaseToken: null, leaseUntil: null }, { merge: true });
    }
    return true;
  });
  if (!committed) return { applied: false as const };
  const accepted = await ref.get(), row = accepted.data();
  const expectedAnnotations = { ...annotations(input.source.data()!), ...input.patch };
  if (!row || !accepted.createTime?.isEqual(input.source.createTime!) || row.aiMediaWriteToken !== token ||
      !isDeepStrictEqual(row.aiMediaSourceProof, inboundSourceProof(input.source.data()!, input.source.createTime!)) ||
      !isDeepStrictEqual(originalFields(row), originalFields(input.source.data()!)) || !isDeepStrictEqual(annotations(row), expectedAnnotations)) return { applied: false as const };
  const conversationFence = input.conversationFence ? { ...input.conversationFence, messageVersion: accepted.updateTime! } : undefined;
  if (conversationFence && !await adminDb.runTransaction(tx => matchesConversationCommercialFence(tx, conversationFence), { readOnly: true })) return { applied: false as const };
  return { applied: true as const, conversationFence };
}
