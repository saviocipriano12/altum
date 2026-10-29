import { adminDb } from "@/app/lib/server/firebase-admin";
import { ChatOutboundIdempotencyError, ChatOutboundRequestIdError } from "@/lib/server/chat-outbound-idempotency";
import { readStageHookProgress, canReplayStageAutomationHook, canReplayApprovalReceiptHook, type StageHookName } from "@/lib/server/crm/stage-hook-progress";

export function stageHookErrorNeedsReview(error: unknown) {
  return error instanceof ChatOutboundIdempotencyError || error instanceof ChatOutboundRequestIdError ||
    error instanceof Error && /^(CRM_STAGE_|PROPOSAL_|STAGE_AUTOMATION_|AI_OUTCOME_SIGNAL_PLAN_)/.test(error.message);
}

/** Each origin supplies its own live transactional authority. Checkpoints share
 * execution machinery, never permissions or invented business occurrences. */
export function createStageHookRunner(input: {
  ref: FirebaseFirestore.DocumentReference;
  authorize: (tx: FirebaseFirestore.Transaction, name: StageHookName) => Promise<FirebaseFirestore.DocumentSnapshot>;
}) {
  return async (name: StageHookName, effect: () => Promise<unknown>) => {
    const execute = await adminDb.runTransaction(async tx => {
      const current = (await input.authorize(tx, name)).data()!;
      const progress = readStageHookProgress(current);
      if (!progress) throw new Error("CRM_STAGE_HOOK_PROGRESS_INVALID");
      const step = progress.steps.find(item => item.name === name);
      if (!step) throw new Error("CRM_STAGE_HOOK_UNEXPECTED");
      if (step.status === "done") return false;
      if (progress.steps.find(item => item.status !== "done")?.name !== name || step.status === "running" && !["learning", "trail"].includes(name) &&
          !(name === "automations" && canReplayStageAutomationHook(current)) &&
          !(name === "approval" && canReplayApprovalReceiptHook(current))) throw new Error("CRM_STAGE_HOOK_UNCERTAIN");
      step.status = "running"; tx.update(input.ref, { stageHookProgress: progress }); return true;
    });
    if (!execute) return;
    await effect();
    await adminDb.runTransaction(async tx => {
      const current = (await input.authorize(tx, name)).data()!;
      const progress = readStageHookProgress(current), step = progress?.steps.find(item => item.name === name);
      if (!progress || step?.status !== "running") throw new Error("CRM_STAGE_HOOK_PROGRESS_CHANGED");
      step.status = "done"; tx.update(input.ref, { stageHookProgress: progress });
    });
  };
}
