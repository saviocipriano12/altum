import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { openClawMissionEnvelopeSchema, verifyOpenClawRuntimeBearer } from "@/lib/server/agent-os/openclaw-runtime";
import { executionLeaseExpiresAt, isExecutionLeaseExpired } from "@/lib/server/agent-os/task-execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Runtime não autorizado." }, { status: 401 });
}

/**
 * Private OpenClaw runtimes poll this endpoint instead of exposing their
 * gateway to the internet. A Firestore transaction grants each dispatch to
 * exactly one poller; execution progress is then recorded by the signed
 * callback endpoint.
 */
export async function GET(request: Request) {
  const secret = process.env.ALTUM_OPENCLAW_SHARED_SECRET?.trim() || "";
  if (!verifyOpenClawRuntimeBearer(request.headers.get("authorization"), secret)) return unauthorized();

  const controlOnly = new URL(request.url).searchParams.get("controlOnly") === "1";
  let queueQuery = adminDb.collection("agent_runtime_dispatches")
    .where("status", "==", "queued");
  // A busy worker can claim stop commands without accepting more business work.
  if (controlOnly) queueQuery = queueQuery.where("operation", "in", ["pause", "cancel"]);
  const candidates = await queueQuery
    .limit(24)
    .get();

  for (const candidate of candidates.docs) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists || current.get("status") !== "queued" || current.get("runtime") !== "openclaw") return null;
      const envelope = openClawMissionEnvelopeSchema.safeParse(current.get("envelope"));
      if (!envelope.success) {
        transaction.set(current.ref, {
          status: "failed",
          failureCode: "invalid_persisted_mission_envelope",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return null;
      }
      if (controlOnly && !["pause", "cancel"].includes(envelope.data.operation)) return null;
      transaction.set(current.ref, {
        status: "claimed",
        claimedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: executionLeaseExpiresAt(),
        deliveryAttempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(adminDb.collection("agent_task_executions").doc(current.id), {
        dispatchId: current.id,
        missionId: envelope.data.mission.id,
        tenantId: envelope.data.mission.tenantId,
        taskId: envelope.data.task?.id || null,
        taskTitle: envelope.data.task?.title || null,
        runtime: "openclaw",
        status: "claimed",
        attempt: Math.max(1, Number(current.get("deliveryAttempts") || 0) + 1),
        agentCandidateId: envelope.data.task?.agentCandidateId || null,
        claimedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: executionLeaseExpiresAt(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return envelope.data;
    });
    if (claimed) return Response.json({ mission: claimed }, { headers: { "cache-control": "no-store" } });
  }
  if (controlOnly) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

  // Reclaim only abandoned claims, never running jobs. The bridge normally
  // reports progress immediately; a claim without any callback after 15 minutes
  // is eligible for bounded redelivery. Consumers must deduplicate dispatchId.
  const abandoned = await adminDb.collection("agent_runtime_dispatches")
    .where("status", "==", "claimed").limit(24).get();
  for (const candidate of abandoned.docs) {
    const claimedAt = candidate.get("claimedAt");
    const leaseExpiresAt = candidate.get("leaseExpiresAt");
    if (!isExecutionLeaseExpired(leaseExpiresAt) && typeof claimedAt?.toMillis === "function") continue;
    const reclaimed = await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      const timestamp = current.get("claimedAt");
      const currentLease = current.get("leaseExpiresAt");
      const attempts = Number(current.get("deliveryAttempts") || 0);
      if (!current.exists || current.get("status") !== "claimed" ||
          current.get("runtime") !== "openclaw" ||
          (typeof currentLease?.toMillis === "function"
            ? !isExecutionLeaseExpired(currentLease)
            : (typeof timestamp?.toMillis === "function" && timestamp.toMillis() > Date.now() - 15 * 60 * 1_000))) return null;
      if (attempts >= 3) {
        // Delivery may have succeeded before the worker crashed. Do not claim
        // that the business operation failed or start a fresh dispatch blindly.
        transaction.set(current.ref, {
          status: "needs_reconciliation",
          failureCode: "claim_retry_exhausted",
          reconciliationReason: "The private worker may have executed this dispatch; inspect its durable receipt and callback history before retrying.",
          reconciliationRequiredAt: FieldValue.serverTimestamp(),
          reconciliationStatus: "pending_operator_review",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection("agent_task_executions").doc(current.id), {
          status: "needs_reconciliation",
          reconciliationRequiredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return null;
      }
      const envelope = openClawMissionEnvelopeSchema.safeParse(current.get("envelope"));
      if (!envelope.success) {
        transaction.set(current.ref, { status: "failed", failureCode: "invalid_persisted_mission_envelope", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return null;
      }
      transaction.set(current.ref, {
        claimedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: executionLeaseExpiresAt(),
        deliveryAttempts: FieldValue.increment(1),
        lastReclaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(adminDb.collection("agent_task_executions").doc(current.id), {
        status: "claimed",
        attempt: attempts + 1,
        claimedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: executionLeaseExpiresAt(),
        lastReclaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return envelope.data;
    });
    if (reclaimed) return Response.json({ mission: reclaimed }, { headers: { "cache-control": "no-store" } });
  }

  // A running dispatch may already have performed work before its worker
  // vanished. Unlike an unstarted claim, never replay it automatically after
  // the lease expires: preserve the evidence gap and require reconciliation.
  const stalledRuns = await adminDb.collection("agent_runtime_dispatches")
    .where("status", "==", "running").limit(24).get();
  for (const candidate of stalledRuns.docs) {
    if (!isExecutionLeaseExpired(candidate.get("leaseExpiresAt"))) continue;
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists || current.get("status") !== "running" || !isExecutionLeaseExpired(current.get("leaseExpiresAt"))) return;
      transaction.set(current.ref, {
        status: "needs_reconciliation",
        failureCode: "running_lease_expired",
        reconciliationReason: "O executor parou de renovar a lease durante a execução. Confirme a evidência e o efeito externo antes de liberar nova tentativa.",
        reconciliationRequiredAt: FieldValue.serverTimestamp(),
        reconciliationStatus: "pending_operator_review",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(adminDb.collection("agent_task_executions").doc(current.id), {
        status: "needs_reconciliation",
        reconciliationRequiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
