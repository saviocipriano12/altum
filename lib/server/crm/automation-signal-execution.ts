import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { readStageHookProgress, canResumeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";
import { assertStageHookSource } from "@/lib/server/automation-stage-delivery";
import type { StageAutomationSourceKind } from "@/lib/server/crm/stage-source-contract";
import type { TenantAutomationTrigger } from "@/lib/server/automations";

type AutomationSignalOrigin = { type: string; kind: StageAutomationSourceKind; trigger: TenantAutomationTrigger; completionMeaning: string;
  authorize: (tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) => Promise<void> };
const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/");
const millis = (value: unknown): number => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;

/** Shared receipt-only runner. Each origin supplies its live authority; public
 * engagement never inherits the authority of an inbound customer message. */
export async function processAutomationSignalOccurrence(id: string, tenantId: string | undefined, origin: AutomationSignalOrigin) {
  if (!valid(id)) throw new Error("CRM_STAGE_AI_SIGNAL_ID_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.type !== origin.type || tenantId && current.tenantId !== tenantId) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (current.status !== "ready" && !expired) return null;
    try { if (!canResumeStageHooks(current)) throw new Error("CRM_STAGE_AI_SIGNAL_PROGRESS_INVALID"); await origin.authorize(tx, current, id); }
    catch (error) { if (!stageHookErrorNeedsReview(error)) throw error; tx.update(ref, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp() }); return null; }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1, leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() }); return current;
  });
  if (!row) {
    const previous = (await ref.get()).data();
    const count = previous?.type === origin.type && (!tenantId || previous.tenantId === tenantId) && Array.isArray(previous.stageAutomationPlans) ? previous.stageAutomationPlans.length : 0;
    return { processed: false, evaluated: count, matched: count, executed: 0 };
  }
  const runHook = createStageHookRunner({ ref, authorize: tx => assertStageHookSource(tx, { tenantId: row.tenantId, leadId: row.leadId, source: { kind: origin.kind, id, token } }) });
  let completed = false, review = false;
  let execution = { evaluated: row.stageAutomationPlans.length, matched: row.stageAutomationPlans.length, executed: 0 };
  try {
    const { runLeadAutomations } = await import("@/lib/server/automations");
    await runHook("automations", async () => { execution = await runLeadAutomations({ tenantId: row.tenantId, leadId: row.leadId, chatId: row.chatId, channel: row.channel,
      trigger: origin.trigger, aiNextAction: row.aiNextAction,
      ...(origin.kind === "waiting" ? { waitingSince: row.waitingSince.toDate(), slaBreached: row.slaBreached } : {}),
      actorId: row.actorId, actorName: row.actorName, strictErrors: true, stageSource: { kind: origin.kind, id, token } }); }); completed = true;
  } catch (error) { review = stageHookErrorNeedsReview(error); }
  const confirmed = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data(); if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    let done = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let finalSourceRevoked = false;
    if (done) {
      try { await origin.authorize(tx, current, id); }
      catch (error) { if (!stageHookErrorNeedsReview(error)) throw error; done = false; finalSourceRevoked = true; }
    }
    let resume = !done && !review && !finalSourceRevoked && canResumeStageHooks(current);
    if (resume) { try { await origin.authorize(tx, current, id); } catch (error) { if (!stageHookErrorNeedsReview(error)) throw error; resume = false; } }
    tx.update(ref, { status: done ? "done" : resume ? "ready" : "reconciliation_required", updatedAt: FieldValue.serverTimestamp(), completionMeaning: origin.completionMeaning }); return Boolean(done);
  });
  return { processed: true, completed: confirmed, ...execution };
}
