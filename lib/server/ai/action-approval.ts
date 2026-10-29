import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { AiActionPlan } from "@/lib/server/ai/action-plan";

export const AI_ACTION_APPROVAL_VERSION = "ai-action-approval-v1" as const;

function approvalId(tenantId: string, idempotencyKey: string) {
  return `${tenantId}_${idempotencyKey}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240);
}

export async function ensureAiActionApprovals(plan: AiActionPlan) {
  const pendingSteps = plan.steps.filter((step) => step.authorization === "approval_required");
  await Promise.all(pendingSteps.map(async (step) => {
    const ref = adminDb.collection("ai_action_approvals").doc(approvalId(plan.tenantId, step.idempotencyKey));
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const data = snapshot.data() as Record<string, unknown>;
        if (data.tenantId !== plan.tenantId) throw new Error("action_approval_tenant_mismatch");
        return;
      }
      transaction.create(ref, {
        schemaVersion: AI_ACTION_APPROVAL_VERSION,
        tenantId: plan.tenantId,
        chatId: plan.chatId,
        messageId: plan.messageId,
        leadId: plan.leadId,
        planFingerprint: plan.fingerprint,
        stepId: step.id,
        actionKind: step.kind,
        risk: step.risk,
        reason: step.authorizationReason,
        preconditions: step.preconditions,
        expectedEvidence: step.expectedEvidence,
        compensation: step.compensation,
        idempotencyKey: step.idempotencyKey,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }));
  return pendingSteps.map((step) => step.kind);
}
