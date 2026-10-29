import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { AiActionPlanStep } from "@/lib/server/ai/action-plan";

export const AI_ACTION_EXECUTION_VERSION = "ai-action-execution-v1" as const;
const COLLECTION = "ai_action_executions";

export type AiActionClaim =
  | { status: "claimed"; token: string; attempt: number }
  | { status: "already_completed"; token: null; attempt: number }
  | { status: "busy"; token: null; attempt: number };

function docId(tenantId: string, idempotencyKey: string) {
  return `${tenantId}_${idempotencyKey}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240);
}

export async function claimAiActionExecution(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  leadId?: string | null;
  planFingerprint: string;
  step: AiActionPlanStep;
  leaseMs?: number;
}): Promise<AiActionClaim> {
  const ref = adminDb.collection(COLLECTION).doc(docId(input.tenantId, input.step.idempotencyKey));
  const nowMs = Date.now();
  const leaseMs = Math.max(5_000, Math.min(input.leaseMs || 60_000, 10 * 60_000));
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    if (snapshot.exists && data.tenantId !== input.tenantId) throw new Error("action_execution_tenant_mismatch");
    const attempt = typeof data.attempt === "number" ? data.attempt : 0;
    if (data.status === "completed" || data.status === "skipped_precondition") {
      return { status: "already_completed", token: null, attempt };
    }
    const leaseUntilMs = data.leaseUntil instanceof Timestamp ? data.leaseUntil.toMillis() : 0;
    if (data.status === "running" && leaseUntilMs > nowMs) return { status: "busy", token: null, attempt };

    const token = randomUUID();
    transaction.set(ref, {
      schemaVersion: AI_ACTION_EXECUTION_VERSION,
      tenantId: input.tenantId,
      chatId: input.chatId,
      messageId: input.messageId,
      leadId: input.leadId || null,
      planFingerprint: input.planFingerprint,
      stepId: input.step.id,
      kind: input.step.kind,
      risk: input.step.risk,
      idempotencyKey: input.step.idempotencyKey,
      status: "running",
      attempt: attempt + 1,
      claimToken: token,
      leaseUntil: Timestamp.fromMillis(nowMs + leaseMs),
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { status: "claimed", token, attempt: attempt + 1 };
  });
}

export async function completeAiActionExecution(input: {
  tenantId: string;
  idempotencyKey: string;
  token: string;
  evidence?: string[];
}) {
  const ref = adminDb.collection(COLLECTION).doc(docId(input.tenantId, input.idempotencyKey));
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as Record<string, unknown> | undefined;
    if (!snapshot.exists || data?.tenantId !== input.tenantId || data?.claimToken !== input.token) {
      throw new Error("action_execution_claim_lost");
    }
    transaction.set(ref, {
      status: "completed",
      evidence: (input.evidence || []).slice(0, 24),
      leaseUntil: null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function failAiActionExecution(input: {
  tenantId: string;
  idempotencyKey: string;
  token: string;
  error: string;
  retryable?: boolean;
  compensationStatus?: "not_required" | "pending" | "completed";
}) {
  const ref = adminDb.collection(COLLECTION).doc(docId(input.tenantId, input.idempotencyKey));
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as Record<string, unknown> | undefined;
    if (!snapshot.exists || data?.tenantId !== input.tenantId || data?.claimToken !== input.token) return;
    transaction.set(ref, {
      status: input.retryable === false ? "failed" : "retryable",
      error: input.error.replace(/\s+/g, " ").trim().slice(0, 500),
      compensationStatus: input.compensationStatus || "not_required",
      leaseUntil: null,
      failedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function skipAiActionExecution(input: {
  tenantId: string;
  idempotencyKey: string;
  token: string;
  reason: string;
  evidence?: string[];
}) {
  const ref = adminDb.collection(COLLECTION).doc(docId(input.tenantId, input.idempotencyKey));
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as Record<string, unknown> | undefined;
    if (!snapshot.exists || data?.tenantId !== input.tenantId || data?.claimToken !== input.token) {
      throw new Error("action_execution_claim_lost");
    }
    transaction.set(ref, {
      status: "skipped_precondition",
      skipReason: input.reason.replace(/\s+/g, " ").trim().slice(0, 240),
      evidence: (input.evidence || []).slice(0, 24),
      leaseUntil: null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}
