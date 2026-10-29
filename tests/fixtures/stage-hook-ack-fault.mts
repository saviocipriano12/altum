import assert from "node:assert/strict";
import { mock } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { StageAutomationSourceKind } from "../../lib/server/crm/stage-source-contract.ts";

/** Lose an acknowledgement after a real emulator commit, never replace an effect. */
export async function loseStageHookAcknowledgement(db: Firestore, collection: string, consume: () => Promise<unknown>) {
  const original = db.runTransaction.bind(db); let injected = false;
  const fault = mock.method(db, "runTransaction", async (work: Parameters<typeof db.runTransaction>[0]) => {
    let selected = false;
    const result = await original(async tx => {
      for (const method of ["create", "set"] as const) {
        const write = tx[method].bind(tx);
        Object.defineProperty(tx, method, { value: (...args: unknown[]) => {
          if ((args[0] as FirebaseFirestore.DocumentReference).parent.id === collection) selected = true;
          return Reflect.apply(write, tx, args);
        } });
      }
      return work(tx);
    });
    if (selected && !injected) { injected = true; throw new Error("QA_SHARED_STAGE_HOOK_ACK_LOST"); }
    return result;
  });
  try { await consume(); } finally { fault.mock.restore(); }
  assert.equal(injected, true, `No real ${collection} commit was observed`);
}

export async function loseStageRunCompletionAcknowledgement(db: Firestore, sourcePath: string, consume: () => Promise<unknown>) {
  const original = db.runTransaction.bind(db); let injected = false;
  const fault = mock.method(db, "runTransaction", async (work: Parameters<typeof db.runTransaction>[0]) => {
    let selected = false;
    const result = await original(async tx => {
      const update = tx.update.bind(tx);
      Object.defineProperty(tx, "update", { value: (...args: unknown[]) => {
        if ((args[0] as FirebaseFirestore.DocumentReference).path === sourcePath && args[1] && typeof args[1] === "object" &&
            Object.entries(args[1]).some(([key, value]) => key.startsWith("stageAutomationRuns.") && key.endsWith(".status") && value === "done")) selected = true;
        return Reflect.apply(update, tx, args);
      } });
      return work(tx);
    });
    if (selected && !injected) { injected = true; throw new Error("QA_STAGE_RUN_COMPLETION_ACK_LOST"); }
    return result;
  });
  try { await consume(); } finally { fault.mock.restore(); }
  assert.equal(injected, true);
}

/** Admit an authentic v1 frozen plan before the new hook protocol exists.
 * Never remove or downgrade a receipt/recovery contract to manufacture legacy. */
export async function freezeLegacyStageRecipe(db: Firestore, ref: FirebaseFirestore.DocumentReference, kind: StageAutomationSourceKind, automationId: string) {
  const row = (await ref.get()).data()!;
  assert.ok(row.tenantId.startsWith("qa_")); assert.equal(row.status, "ready");
  assert.equal(row.stageHookProgress, undefined); assert.equal(row.stageAutomationPlans, undefined);
  const token = `qa-legacy-${ref.id}`;
  await ref.update({ status: "processing", claimToken: token, leaseUntil: new Date(Date.now() + 60_000) });
  const { freezeStageAutomationPlans } = await import("../../lib/server/automation-stage-delivery.ts");
  await freezeStageAutomationPlans({ tenantId: row.tenantId, leadId: row.leadId, source: { kind, id: ref.id, token },
    previousStage: row.previousStage, nextStage: row.nextStage, matches: automation => automation.id === automationId });
  assert.equal((await ref.get()).data()?.stageRunRecoveryProtocol, undefined);
  await ref.update({ status: "ready", claimToken: FieldValue.delete(), leaseUntil: FieldValue.delete() });
}

export async function freezeLegacyApprovalRecipe(db: Firestore, ref: FirebaseFirestore.DocumentReference, automationId: string) {
  const row = (await ref.get()).data()!;
  assert.ok(row.tenantId.startsWith("qa_")); assert.equal(row.status, "ready");
  assert.equal(row.stageHookProgress, undefined); assert.equal(row.automationApprovalPlans, undefined);
  const { newStageHookProgress } = await import("../../lib/server/crm/stage-hook-progress.ts");
  const token = `qa-legacy-${ref.id}`;
  await ref.update({ status: "processing", claimToken: token, leaseUntil: new Date(Date.now() + 60_000),
    stageHookProgress: { ...newStageHookProgress(row), version: 1 } });
  const { freezeProposalAutomationPlans } = await import("../../lib/server/automation-proposal-delivery.ts");
  await freezeProposalAutomationPlans({ tenantId: row.tenantId, leadId: row.leadId, claim: { id: ref.id, token }, automations: [], matches: automation => automation.id === automationId });
  assert.equal((await ref.get()).data()?.approvalReceiptRecoveryProtocol, undefined);
  await ref.update({ status: "ready", claimToken: FieldValue.delete(), leaseUntil: FieldValue.delete() });
}
