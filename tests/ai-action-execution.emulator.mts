import assert from "node:assert/strict";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "altum-action-execution-test";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });

const { claimAiActionExecution, completeAiActionExecution, failAiActionExecution, skipAiActionExecution } =
  await import("../lib/server/ai/action-execution.ts");
const { ensureAiActionApprovals } = await import("../lib/server/ai/action-approval.ts");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");

const step = {
  id: "update_crm_context_1",
  kind: "update_crm_context" as const,
  tool: "crm_write" as const,
  risk: "low" as const,
  authorization: "ready" as const,
  authorizationReason: "authorized",
  idempotencyKey: "execution-test-key",
  preconditions: ["tenant"],
  expectedEvidence: ["write"],
  compensation: "restore",
};

test("claim concorrente executa uma vez e replay concluido nao duplica", async () => {
  const input = { tenantId: "tenant-execution", chatId: "chat-1", messageId: "message-1", leadId: "lead-1", planFingerprint: "plan-1", step };
  const [first, second] = await Promise.all([claimAiActionExecution(input), claimAiActionExecution(input)]);
  const claimed = [first, second].find((item) => item.status === "claimed");
  assert.ok(claimed && claimed.status === "claimed");
  assert.ok([first, second].some((item) => item.status === "busy"));
  await completeAiActionExecution({ tenantId: input.tenantId, idempotencyKey: step.idempotencyKey, token: claimed.token, evidence: ["lead_updated"] });
  assert.equal((await claimAiActionExecution(input)).status, "already_completed");
});

test("falha retryable libera nova tentativa com token diferente", async () => {
  const retryStep = { ...step, idempotencyKey: "execution-retry-key" };
  const input = { tenantId: "tenant-execution", chatId: "chat-2", messageId: "message-2", leadId: "lead-2", planFingerprint: "plan-2", step: retryStep };
  const first = await claimAiActionExecution(input);
  assert.equal(first.status, "claimed");
  if (first.status !== "claimed") return;
  await failAiActionExecution({ tenantId: input.tenantId, idempotencyKey: retryStep.idempotencyKey, token: first.token, error: "temporary failure", retryable: true, compensationStatus: "pending" });
  const retry = await claimAiActionExecution(input);
  assert.equal(retry.status, "claimed");
  if (retry.status === "claimed") {
    assert.notEqual(retry.token, first.token);
    assert.equal(retry.attempt, 2);
  }
});

test("pedido de aprovacao e idempotente e preserva o escopo do tenant", async () => {
  const approvalStep = {
    ...step,
    id: "prepare_checkout_1",
    kind: "prepare_checkout" as const,
    tool: "checkout_prepare" as const,
    risk: "critical" as const,
    authorization: "approval_required" as const,
    authorizationReason: "financial_action_requires_approval",
    idempotencyKey: "approval-test-key",
  };
  const plan = {
    schemaVersion: "ai-action-plan-v1" as const,
    tenantId: "tenant-approval",
    chatId: "chat-approval",
    messageId: "message-approval",
    leadId: "lead-approval",
    autonomyMode: "autonomous" as const,
    objective: "checkout",
    factsUsed: [],
    gaps: [],
    steps: [approvalStep],
    executionMode: "approval_required" as const,
    fingerprint: "approval-plan",
  };
  await Promise.all([ensureAiActionApprovals(plan), ensureAiActionApprovals(plan)]);
  const approvals = await adminDb.collection("ai_action_approvals").where("tenantId", "==", plan.tenantId).get();
  assert.equal(approvals.size, 1);
  assert.equal(approvals.docs[0]?.data().status, "pending");
  assert.equal(approvals.docs[0]?.data().risk, "critical");
});

test("precondicao nao atendida encerra o mesmo turno sem duplicar efeito", async () => {
  const skippedStep = { ...step, idempotencyKey: "execution-skipped-key" };
  const input = { tenantId: "tenant-execution", chatId: "chat-3", messageId: "message-3", leadId: "lead-3", planFingerprint: "plan-3", step: skippedStep };
  const claim = await claimAiActionExecution(input);
  assert.equal(claim.status, "claimed");
  if (claim.status !== "claimed") return;
  await skipAiActionExecution({ tenantId: input.tenantId, idempotencyKey: skippedStep.idempotencyKey, token: claim.token, reason: "runtime_precondition_not_met" });
  assert.equal((await claimAiActionExecution(input)).status, "already_completed");
});
