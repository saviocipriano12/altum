import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { CreativeExecutionAttempt } from "@/lib/server/agent-os/creative-executor";

/**
 * Execution evidence is the authoritative health signal for media providers.
 * A saved key is not enough: a provider is cooled down after an actual quota,
 * validation or availability failure, and earns its healthy state back only
 * when it accepts a real approved job.
 */
export async function recordCreativeConnectionAttempts(attempts: CreativeExecutionAttempt[]) {
  if (!attempts.length) return;
  const batch = adminDb.batch();
  const now = Date.now();
  for (const attempt of attempts) {
    if (!attempt.connectionId) continue;
    const ref = adminDb.collection("tool_connections").doc(attempt.connectionId);
    if (attempt.status === "submitted" || attempt.status === "completed") {
      batch.set(ref, {
        status: "healthy",
        health: {
          status: "healthy",
          lastSucceededAt: FieldValue.serverTimestamp(),
          lastExecutionStatus: attempt.status,
          cooldownUntil: null,
          consecutiveFailures: 0,
        },
        lastHealthAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }
    if (attempt.status === "failed") {
      // A short provider-specific circuit breaker prevents the same exhausted
      // route from delaying every new request. It remains recoverable: the next
      // explicit health test or later successful job clears it.
      batch.set(ref, {
        health: {
          status: "degraded",
          lastFailedAt: FieldValue.serverTimestamp(),
          lastExecutionStatus: "failed",
          lastFailureReason: (attempt.reason || "provider_unavailable").slice(0, 500),
          cooldownUntil: new Date(now + 2 * 60_000),
          consecutiveFailures: FieldValue.increment(1),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  await batch.commit();
}
