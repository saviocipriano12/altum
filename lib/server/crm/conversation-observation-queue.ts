import { createHash, randomUUID } from "node:crypto";
import { crmObservationIdentity, isExactCrmRecordId } from "@/lib/crm-observation-identity";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { observeConversationCommercialState } from "@/lib/server/crm/conversation-intelligence";
import { readObservationSourceBinding, normalizeObservationBinding, sameObservationOccurrence, versionAfter } from "./observation-source-binding";
import { observationSnapshotVersion } from "./observation-receipt-identity";
import { withoutAiExecutionAuthority } from "@/lib/server/ai/execution-authority";
import { hasCurrentInboundEnrichment } from "@/lib/server/ai/inbound-enrichment-source";

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timestampMs(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  return 0;
}

export function crmObservationJobId(tenantId: string, messageId: string) {
  return `crmobs_${createHash("sha256").update(JSON.stringify(["crm-observation-v1", tenantId, messageId])).digest("hex").slice(0, 48)}`;
}

export type ConversationObservationInput = {
  tenantId: string;
  chatId: string;
  messageId: string;
  actorId?: string | null;
  actorName?: string | null;
  source?: string | null;
  /** Persisted creation version of a delayed producer, never a caller's clock. */
  originNotAfter?: string;
};

export function buildConversationCommercialObservationJob(input: ConversationObservationInput) {
  const identity = crmObservationIdentity(input);
  if (!identity) throw new Error("CRM_OBSERVATION_INVALID_IDENTITY");
  const { tenantId, chatId, messageId } = identity;
  const jobId = crmObservationJobId(tenantId, messageId);
  return { jobId, data: {
    tenantId, chatId, messageId,
    actorId: clean(input.actorId, 180) || null,
    actorName: clean(input.actorName, 180) || null,
    source: clean(input.source, 80) || "conversation",
    status: "ready", attempts: 0, dueAt: new Date(),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  } };
}

/** Preparation performs all reads; callers may atomically write the plan with an inbound event. */
export async function prepareConversationCommercialObservation(transaction: FirebaseFirestore.Transaction, input: ConversationObservationInput) {
  const { jobId, data } = buildConversationCommercialObservationJob(input);
  const ref = adminDb.collection("crm_observation_jobs").doc(jobId);
  const [current, source] = await Promise.all([transaction.get(ref), readObservationSourceBinding(transaction, data)]);
  if (current.exists && (current.data()?.tenantId !== input.tenantId || current.data()?.chatId !== input.chatId || current.data()?.messageId !== input.messageId))
    throw new Error("CRM_OBSERVATION_JOB_IDENTITY_CONFLICT");
  const previous = normalizeObservationBinding(current.data()?.sourceBinding);
  if (input.originNotAfter && (!source || versionAfter(source.binding.bornAt, input.originNotAfter) ||
      versionAfter(source.binding.messageRevision!, input.originNotAfter)))
    return { jobId, ref, sourceBinding: previous, created: false, status: "skipped", write: null };
  const legacyProven = current.exists && current.data()?.sourceBinding === undefined && source && source.explicitLead && !versionAfter(source.binding.bornAt, observationSnapshotVersion(current.createTime));
  const blocked = !source || current.exists && (previous ? !sameObservationOccurrence(previous, source.binding) : !legacyProven);
  if (blocked) return { jobId, ref, sourceBinding: previous, created: !current.exists, status: "awaiting_context", write: {
    ...(current.exists ? {} : data), status: "awaiting_context", errorCode: "CRM_OBSERVATION_SOURCE_CHANGED", dueAt: null,
    leaseToken: null, leaseUntil: null, updatedAt: FieldValue.serverTimestamp() } as FirebaseFirestore.DocumentData };
  if (current.exists && previous && previous.messageRevision === source.binding.messageRevision)
    return { jobId, ref, sourceBinding: source.binding, created: false, status: clean(current.data()?.status, 40) || "ready", write: null };
  return { jobId, ref, sourceBinding: source.binding, created: !current.exists, status: "ready", write: { ...data, sourceBinding: source.binding,
    createdAt: current.exists ? current.data()?.createdAt || current.createTime : data.createdAt,
    leaseToken: null, leaseUntil: null, completedAt: null, error: "", errorCode: "" } as FirebaseFirestore.DocumentData };
}
export async function enqueueConversationCommercialObservation(input: ConversationObservationInput) {
  return adminDb.runTransaction(async transaction => {
    const plan = await prepareConversationCommercialObservation(transaction, input);
    if (plan.write) transaction.set(plan.ref, plan.write, { merge: true });
    return { jobId: plan.jobId, created: plan.created, status: plan.status };
  });
}

export async function processConversationCommercialObservationJobs(input?: { jobId?: string; limit?: number }) {
  return withoutAiExecutionAuthority(() => processConversationCommercialObservationJobsInWorker(input));
}

async function processConversationCommercialObservationJobsInWorker(input?: { jobId?: string; limit?: number }) {
  if (input?.jobId !== undefined && !isExactCrmRecordId(input.jobId, 300)) throw new Error("CRM_OBSERVATION_INVALID_IDENTITY");
  const limit = Math.max(1, Math.min(50, Number(input?.limit || 10)));
  const docs = input?.jobId
    ? [await adminDb.collection("crm_observation_jobs").doc(input.jobId).get()].filter((doc) => doc.exists)
    : (await Promise.all(["ready", "retrying", "processing"].map((status) =>
        adminDb.collection("crm_observation_jobs").where("status", "==", status).limit(limit * 5).get()
      ))).flatMap((snapshot) => snapshot.docs);
  const results: Array<{ jobId: string; status: "completed" | "awaiting_context" | "retrying" | "dead_letter" | "skipped"; error?: string }> = [];
  for (const candidate of docs) {
    if (results.length >= limit) break;
    const leaseToken = randomUUID();
    const admission = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(candidate.ref);
      if (!fresh.exists) return null;
      const data = fresh.data() || {};
      const status = clean(data.status, 40);
      if (!["ready", "retrying", "processing"].includes(status)) return null;
      if (status === "processing" && timestampMs(data.leaseUntil) > Date.now()) return null;
      if (timestampMs(data.dueAt) > Date.now()) return null;
      if (!crmObservationIdentity(data)) {
        transaction.set(candidate.ref, { status: "dead_letter", errorCode: "CRM_OBSERVATION_INVALID_IDENTITY",
          error: "Origem inválida; nenhuma conversa foi processada.", leaseToken: null, leaseUntil: null, dueAt: null,
          updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { kind: "invalid" as const };
      }
      const source = await readObservationSourceBinding(transaction, crmObservationIdentity(data)!);
      let binding = normalizeObservationBinding(data.sourceBinding);
      if (data.sourceBinding === undefined && !binding && source?.explicitLead && !versionAfter(source.binding.bornAt, observationSnapshotVersion(fresh.createTime)) &&
          !versionAfter(source.binding.messageRevision!, observationSnapshotVersion(fresh.createTime))) binding = source.binding;
      const pendingEnrichment = binding?.messageRevision === null && source && data.enrichmentToken === source.message.data()?.aiMediaWriteToken &&
        hasCurrentInboundEnrichment(source.message.data()!, source.message.createTime);
      if (!source || !binding || !sameObservationOccurrence(binding, source.binding) ||
          binding.messageRevision !== source.binding.messageRevision && !pendingEnrichment) {
        transaction.set(candidate.ref, { status: "awaiting_context", errorCode: "CRM_OBSERVATION_SOURCE_CHANGED", dueAt: null,
          leaseToken: null, leaseUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { kind: "context_changed" as const };
      }
      transaction.set(candidate.ref, {
        sourceBinding: source.binding,
        status: "processing",
        attempts: FieldValue.increment(1),
        leaseToken,
        leaseUntil: new Date(Date.now() + LEASE_MS),
        recoveredLease: status === "processing",
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { kind: "claimed" as const, job: data as Record<string, unknown>, binding: source.binding };
    });
    if (!admission) {
      if (input?.jobId) results.push({ jobId: candidate.id, status: "skipped" });
      continue;
    }
    if (admission.kind === "invalid") { results.push({ jobId: candidate.id, status: "dead_letter" }); continue; }
    if (admission.kind === "context_changed") { results.push({ jobId: candidate.id, status: "awaiting_context" }); continue; }
    const job = admission.job;
    const finalize = async (patch: Record<string, unknown>) => {
      return adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(candidate.ref);
        if (!current.exists || clean(current.data()?.leaseToken, 180) !== leaseToken) return "skipped" as const;
        const source = await readObservationSourceBinding(transaction, crmObservationIdentity(job)!);
        if (!source || !sameObservationOccurrence(admission.binding, source.binding) || admission.binding.messageRevision !== source.binding.messageRevision) {
          transaction.set(candidate.ref, { status: "awaiting_context", completedAt: null, dueAt: null,
            errorCode: "CRM_OBSERVATION_SOURCE_CHANGED", leaseToken: null, leaseUntil: null,
            updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return "awaiting_context" as const;
        }
        transaction.set(candidate.ref, { ...patch, leaseToken: null, leaseUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return patch.status as "completed" | "awaiting_context" | "retrying" | "dead_letter";
      });
    };
    try {
      const receipt = await observeConversationCommercialState({
        ...crmObservationIdentity(job)!,
        expectedSourceBinding: admission.binding,
        actorId: clean(job.actorId, 180) || "crm_conversation_observer",
        actorName: clean(job.actorName, 180) || "Inteligencia Comercial Altum",
      });
      if (!receipt.observed && "reason" in receipt && ["opportunity_context_required", "contact_identity_review", "conversation_commercial_context_changed"].includes(String(receipt.reason))) {
        const status = await finalize({ status: "awaiting_context", receipt, completedAt: null, dueAt: null, error: "", errorCode: "CRM_COMMERCIAL_CONTEXT_REQUIRED" });
        results.push({ jobId: candidate.id, status });
        continue;
      }
      const status = await finalize({ status: "completed", receipt, completedAt: FieldValue.serverTimestamp(), error: "", errorCode: "" });
      results.push({ jobId: candidate.id, status });
    } catch (error) {
      const attempt = Number(job.attempts || 0) + 1;
      const terminal = attempt >= MAX_ATTEMPTS;
      const message = error instanceof Error ? clean(error.message, 500) : "Falha ao atualizar CRM.";
      const status = await finalize({
        status: terminal ? "dead_letter" : "retrying",
        error: message,
        errorCode: terminal ? "CRM_OBSERVATION_EXHAUSTED" : "CRM_OBSERVATION_RETRY",
        dueAt: terminal ? null : new Date(Date.now() + Math.min(15 * 60_000, 10_000 * 2 ** Math.max(0, attempt - 1))),
        failedAt: FieldValue.serverTimestamp(),
      });
      results.push({ jobId: candidate.id, status, error: message });
    }
  }
  return { processed: results.length, results };
}

export async function getConversationCommercialObservationHealth() {
  const limit = 1000;
  const snapshot = await adminDb.collection("crm_observation_jobs").limit(limit).get();
  const counts: Record<string, number> = { ready: 0, processing: 0, retrying: 0, awaiting_context: 0, dead_letter: 0, completed: 0 };
  let oldestPendingAtMs: number | null = null;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const status = clean(data.status, 40);
    counts[status] = (counts[status] || 0) + 1;
    if (["ready", "processing", "retrying"].includes(status)) {
      const createdAtMs = timestampMs(data.createdAt);
      if (createdAtMs && (oldestPendingAtMs === null || createdAtMs < oldestPendingAtMs)) oldestPendingAtMs = createdAtMs;
    }
  }
  return { counts, totalInspected: snapshot.size, coverageComplete: snapshot.size < limit, oldestPendingAt: oldestPendingAtMs ? new Date(oldestPendingAtMs).toISOString() : null };
}

export async function getTenantConversationCommercialObservationHealth(tenantIdValue: string) {
  const tenantId = tenantIdValue;
  if (!isExactCrmRecordId(tenantId)) throw new Error("CRM_OBSERVATION_INVALID_IDENTITY");
  const limit = 500;
  const snapshot = await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).limit(limit).get();
  const counts: Record<string, number> = { ready: 0, processing: 0, retrying: 0, awaiting_context: 0, dead_letter: 0, completed: 0 };
  snapshot.docs.forEach((doc) => {
    const status = clean(doc.data().status, 40);
    counts[status] = (counts[status] || 0) + 1;
  });
  return { counts, totalInspected: snapshot.size, coverageComplete: snapshot.size < limit, healthy: counts.dead_letter === 0 && counts.awaiting_context === 0 };
}

export async function reprocessConversationCommercialObservationJob(input: { tenantId: string; jobId: string; actorId: string }) {
  if (!isExactCrmRecordId(input.tenantId) || !isExactCrmRecordId(input.jobId, 300)) throw new Error("CRM_OBSERVATION_INVALID_IDENTITY");
  const { tenantId, jobId } = input;
  const ref = adminDb.collection("crm_observation_jobs").doc(jobId);
  return adminDb.runTransaction(async (transaction) => {
    const job = await transaction.get(ref);
    if (!job.exists || job.data()?.tenantId !== tenantId || !crmObservationIdentity(job.data()!)) throw new Error("Observacao nao encontrada para esta empresa.");
    if (clean(job.data()?.status, 40) !== "dead_letter") throw new Error("Somente uma observacao em dead letter pode ser reprocessada manualmente.");
    transaction.set(ref, {
      status: "ready", attempts: 0, dueAt: new Date(), leaseToken: null, leaseUntil: null,
      error: "", errorCode: "", lastReprocessedBy: input.actorId,
      lastReprocessedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(adminDb.collection("audit_logs").doc(`crm_observation_reprocess_${jobId}_${Number(job.data()?.attempts || 0)}`), {
      tenantId,
      action: "crm_observation_reprocessed",
      targetType: "crm_observation_job",
      targetId: jobId,
      actorId: clean(input.actorId, 180) || "unknown",
      previousStatus: "dead_letter",
      nextStatus: "ready",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { jobId, status: "ready" as const };
  });
}

export async function reconcileTenantConversationCommercialObservations(tenantIdValue: string, limitValue = 100) {
  const tenantId = tenantIdValue;
  const limit = Math.max(1, Math.min(200, Number(limitValue || 100)));
  if (!isExactCrmRecordId(tenantId)) throw new Error("CRM_OBSERVATION_INVALID_IDENTITY");
  const [chats, messages] = await Promise.all([
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(300).get(),
    adminDb.collection("messages").where("tenantId", "==", tenantId).limit(1000).get(),
  ]);
  const commercialChats = new Set(chats.docs.filter((doc) => clean(doc.data().leadId, 180)).map((doc) => doc.id));
  const candidates = messages.docs.filter((doc) => {
    const data = doc.data();
    return !!crmObservationIdentity({ tenantId, chatId: data.chatId, messageId: doc.id }) && commercialChats.has(data.chatId) && ["client", "agent"].includes(clean(data.sender, 30));
  });
  const jobs = await Promise.all(candidates.map((message) => adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(tenantId, message.id)).get()));
  let created = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    if (created >= limit) break;
    if (jobs[index].exists) continue;
    const message = candidates[index];
    const queued = await enqueueConversationCommercialObservation({
      tenantId, chatId: message.data().chatId, messageId: message.id,
      actorId: "crm_reconciler", actorName: "Reconciliador CRM Altum", source: "reconciliation",
    });
    if (queued.created) created += 1;
  }
  return {
    inspectedMessages: candidates.length,
    createdJobs: created,
    chatCoverageComplete: chats.size < 300,
    messageCoverageComplete: messages.size < 1000 && created < limit,
  };
}
