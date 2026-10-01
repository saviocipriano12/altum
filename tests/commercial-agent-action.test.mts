import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { commercialAgentActionPolicy, evaluateCommercialAgentSla, resolveCommercialAgentDeadlines, validateCommercialAgentAction } from "../lib/commercial-agent-action.ts";

test("follow-up e a unica acao transversal de baixo risco autoexecutavel", () => {
  assert.deepEqual(commercialAgentActionPolicy("follow_up_task"), {
    risk: "low", requiresApproval: false, canAutoExecute: true, externalSideEffect: false, slaMinutes: 0, expiryMinutes: 0,
  });
});

test("decisoes comerciais tem prazo, escalada progressiva e expiracao", () => {
  const createdAt = new Date("2026-09-26T12:00:00.000Z");
  const deadlines = resolveCommercialAgentDeadlines("review_appointment", createdAt);
  assert.equal(deadlines.dueAt?.toISOString(), "2026-09-26T12:30:00.000Z");
  assert.equal(deadlines.expiresAt?.toISOString(), "2026-09-27T00:00:00.000Z");
  assert.equal(evaluateCommercialAgentSla({ type: "review_appointment", status: "pending_approval", createdAt, now: createdAt.getTime() + 31 * 60_000 }).state, "escalate");
  assert.equal(evaluateCommercialAgentSla({ type: "review_appointment", status: "pending_approval", createdAt, now: createdAt.getTime() + 61 * 60_000 }).escalationLevel, 2);
  assert.equal(evaluateCommercialAgentSla({ type: "review_appointment", status: "pending_approval", createdAt, now: createdAt.getTime() + 13 * 60 * 60_000 }).state, "expired");
  assert.equal(evaluateCommercialAgentSla({ type: "review_appointment", status: "approved", createdAt, now: createdAt.getTime() + 13 * 60 * 60_000 }).state, "inactive");
});

test("proposta e agenda exigem aprovacao humana", () => {
  assert.equal(commercialAgentActionPolicy("review_proposal").requiresApproval, true);
  assert.equal(commercialAgentActionPolicy("review_appointment").canAutoExecute, false);
});

test("cobranca nunca e executada automaticamente e exige valor valido", () => {
  const policy = commercialAgentActionPolicy("review_charge");
  assert.equal(policy.risk, "high");
  assert.equal(policy.externalSideEffect, true);
  assert.equal(validateCommercialAgentAction({ type: "review_charge", leadId: "l1", referenceId: "b1", amount: 0 }).valid, false);
  assert.equal(validateCommercialAgentAction({ type: "review_charge", leadId: "l1", referenceId: "b1", amount: 500 }).valid, true);
});

test("agendamento da IA nasce como sugestao e so converte depois da aprovacao", async () => {
  const agentSource = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");
  const approvalSource = await readFile(new URL("../app/api/tenant/[tenantId]/commercial-agent/actions/[actionId]/route.ts", import.meta.url), "utf8");
  assert.match(agentSource, /status: "draft"/);
  assert.match(approvalSource, /status: "scheduled"/);
  assert.match(approvalSource, /appointment_conflict/);
  assert.match(approvalSource, /meeting_scheduled/);
});

test("aprovacao de cobranca nao chama provedor financeiro", async () => {
  const approvalSource = await readFile(new URL("../app/api/tenant/[tenantId]/commercial-agent/actions/[actionId]/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(approvalSource, /asaas/i);
  assert.match(approvalSource, /chargeApprovalStatus/);
});

test("emissao financeira exige aprovacao e usa referencia externa reconciliavel", async () => {
  const financeSource = await readFile(new URL("../app/api/tenant/[tenantId]/finance/create-charge/route.ts", import.meta.url), "utf8");
  assert.match(financeSource, /approvalActionId/);
  assert.match(financeSource, /review_charge/);
  assert.match(financeSource, /status: "executing"/);
  assert.match(financeSource, /externalReference/);
  assert.match(financeSource, /findAsaasChargeByExternalReference/);
  assert.match(financeSource, /status: "executed"/);
});

test("painel do agente calcula tempo de decisao e valor aprovado", async () => {
  const actionsSource = await readFile(new URL("../app/api/tenant/[tenantId]/commercial-agent/actions/route.ts", import.meta.url), "utf8");
  assert.match(actionsSource, /averageDecisionMinutes/);
  assert.match(actionsSource, /approvedAmount/);
  assert.match(actionsSource, /pendingAmount/);
  assert.match(actionsSource, /overdue/);
});

test("SLA expira, escala e notifica por atividade do tenant com cron diario de seguranca", async () => {
  const processorSource = await readFile(new URL("../lib/server/commercial-agent-sla.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../app/api/internal/jobs/commercial-agent/actions/route.ts", import.meta.url), "utf8");
  const tenantRouteSource = await readFile(new URL("../app/api/tenant/[tenantId]/commercial-agent/actions/route.ts", import.meta.url), "utf8");
  const vercelSource = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(processorSource, /commercial_agent_action_expired/);
  assert.match(processorSource, /sendCriticalPushToTenantUser/);
  assert.match(processorSource, /runTransaction/);
  assert.match(routeSource, /timingSafeEqual/);
  assert.match(routeSource, /COMMERCIAL_AGENT_JOBS_TOKEN/);
  assert.match(tenantRouteSource, /processCommercialAgentSla\(\{ tenantId, limit: 50 \}\)/);
  assert.match(processorSource, /where\("tenantId", "==", tenantId\)/);
  assert.match(vercelSource, /commercial-agent\/actions/);
  assert.match(vercelSource, /10 9 \* \* \*/);
});
