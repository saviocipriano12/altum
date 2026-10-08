import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { openClawMissionEnvelopeSchema, verifyOpenClawRuntimeBearer } from "@/lib/server/agent-os/openclaw-runtime";

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

  const candidates = await adminDb.collection("agent_runtime_dispatches")
    .where("status", "==", "queued")
    // Keep this query on a single indexed field. Requiring a manually-created
    // composite Firestore index would turn an otherwise healthy private
    // runtime into an opaque "no work" failure on a fresh deployment.
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
      transaction.set(current.ref, {
        status: "claimed",
        claimedAt: FieldValue.serverTimestamp(),
        deliveryAttempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return envelope.data;
    });
    if (claimed) return Response.json({ mission: claimed }, { headers: { "cache-control": "no-store" } });
  }

  // Reclaim only abandoned claims, never running jobs. The bridge normally
  // reports progress immediately; a claim without any callback after 15 minutes
  // is eligible for bounded redelivery. Consumers must deduplicate dispatchId.
  const staleBefore = Date.now() - 15 * 60 * 1_000;
  const abandoned = await adminDb.collection("agent_runtime_dispatches")
    .where("status", "==", "claimed").limit(24).get();
  for (const candidate of abandoned.docs) {
    const claimedAt = candidate.get("claimedAt");
    if (typeof claimedAt?.toMillis !== "function" || claimedAt.toMillis() > staleBefore) continue;
    const reclaimed = await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      const timestamp = current.get("claimedAt");
      const attempts = Number(current.get("deliveryAttempts") || 0);
      if (!current.exists || current.get("status") !== "claimed" ||
          current.get("runtime") !== "openclaw" ||
          typeof timestamp?.toMillis !== "function" || timestamp.toMillis() > staleBefore) return null;
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
        return null;
      }
      const envelope = openClawMissionEnvelopeSchema.safeParse(current.get("envelope"));
      if (!envelope.success) {
        transaction.set(current.ref, { status: "failed", failureCode: "invalid_persisted_mission_envelope", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return null;
      }
      transaction.set(current.ref, {
        claimedAt: FieldValue.serverTimestamp(),
        deliveryAttempts: FieldValue.increment(1),
        lastReclaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return envelope.data;
    });
    if (reclaimed) return Response.json({ mission: reclaimed }, { headers: { "cache-control": "no-store" } });
  }

  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
