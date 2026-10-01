import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  decideEcommerceAgentExecution,
  ecommerceRolloutBucket,
  normalizeEcommerceAgentRollout,
} from "../lib/ecommerce-agent-policy.ts";
import { evaluateEcommerceExperiment } from "../lib/ecommerce-agent-experiment.ts";
import { summarizeEcommerceAgentVersions } from "../lib/ecommerce-agent-performance.ts";

const processorSource = readFileSync(new URL("../lib/server/ecommerce-agent.ts", import.meta.url), "utf8");
const webhookSource = readFileSync(new URL("../lib/server/ecommerce.ts", import.meta.url), "utf8");
const cronSource = readFileSync(new URL("../app/api/internal/jobs/commerce/actions/route.ts", import.meta.url), "utf8");

test("configuracao antiga de envio automatico continua funcionando", () => {
  const rollout = normalizeEcommerceAgentRollout({}, true);
  assert.equal(rollout.mode, "automatic");
  assert.equal(rollout.rolloutPercent, 100);
});

test("shadow avalia sem enviar", () => {
  const decision = decideEcommerceAgentExecution({
    rollout: normalizeEcommerceAgentRollout({ mode: "shadow", rolloutPercent: 100 }),
    tenantId: "tenant-a",
    actionId: "action-a",
    templateEnabled: true,
    hasTemplate: true,
    hasPhone: true,
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.shouldSend, false);
  assert.equal(decision.reason, "shadow_only");
});

test("rollout e deterministico e respeita a coorte", () => {
  const bucket = ecommerceRolloutBucket("tenant-a:action-a");
  assert.equal(bucket, ecommerceRolloutBucket("tenant-a:action-a"));
  const decision = decideEcommerceAgentExecution({
    rollout: normalizeEcommerceAgentRollout({ mode: "automatic", rolloutPercent: bucket }),
    tenantId: "tenant-a",
    actionId: "action-a",
    templateEnabled: true,
    hasTemplate: true,
    hasPhone: true,
  });
  assert.equal(decision.shouldSend, false);
  assert.equal(decision.reason, "outside_rollout");
});

test("nenhuma coorte ignora ausencia de telefone ou template", () => {
  const rollout = normalizeEcommerceAgentRollout({ mode: "automatic", rolloutPercent: 100 });
  assert.equal(decideEcommerceAgentExecution({ rollout, tenantId: "t", actionId: "a", templateEnabled: false, hasTemplate: true, hasPhone: true }).reason, "template_disabled");
  assert.equal(decideEcommerceAgentExecution({ rollout, tenantId: "t", actionId: "a", templateEnabled: true, hasTemplate: true, hasPhone: false }).reason, "missing_phone");
});

test("processador trava a acao antes do envio e registra rastreio da decisao", () => {
  assert.match(processorSource, /runTransaction/);
  assert.match(processorSource, /status:\s*"processing"/);
  assert.match(processorSource, /ecommerce_agent_traces/);
  assert.match(processorSource, /agentVersion/);
});

test("falhas recebem backoff e seguem para dead letter apos o limite", () => {
  assert.match(processorSource, /nextAttemptAt/);
  assert.match(processorSource, /attempts >= 5/);
  assert.match(processorSource, /ecommerce_agent_dead_letters/);
});

test("webhook e job agendado usam o mesmo processador controlado", () => {
  assert.match(webhookSource, /processTenantEcommerceActions/);
  assert.match(cronSource, /processTenantEcommerceActions/);
  assert.match(cronSource, /hasTenantModule\(entitlements, "commerce"\)/);
});

test("todas as acoes do mesmo pedido recebem a mesma versao", () => {
  const rollout = normalizeEcommerceAgentRollout({
    mode: "automatic",
    rolloutPercent: 100,
    agentVersion: "champion-v1",
    experiment: { enabled: true, challengerVersion: "challenger-v2", challengerPercent: 50 },
  });
  const first = decideEcommerceAgentExecution({ rollout, tenantId: "t", actionId: "a1", subjectKey: "pedido-42", templateEnabled: true, hasTemplate: true, hasPhone: true });
  const second = decideEcommerceAgentExecution({ rollout, tenantId: "t", actionId: "a2", subjectKey: "pedido-42", templateEnabled: true, hasTemplate: true, hasPhone: true });
  assert.equal(first.assignedVersion, second.assignedVersion);
});

test("rollback exige amostra e separacao dos intervalos de confianca", () => {
  const config = normalizeEcommerceAgentRollout({
    experiment: { enabled: true, challengerVersion: "v2", autoRollback: true, minSampleSize: 50, maxRelativeConversionDrop: 0.25 },
  }).experiment;
  const insufficient = evaluateEcommerceExperiment({
    champion: { version: "v1", sent: 10, failures: 0, mature: 10, conversions: 5, revenue: 500 },
    challenger: { version: "v2", sent: 10, failures: 0, mature: 10, conversions: 0, revenue: 0 },
    config,
  });
  assert.equal(insufficient.shouldRollback, false);
  const regression = evaluateEcommerceExperiment({
    champion: { version: "v1", sent: 300, failures: 2, mature: 300, conversions: 120, revenue: 12000 },
    challenger: { version: "v2", sent: 300, failures: 3, mature: 300, conversions: 45, revenue: 4500 },
    config,
  });
  assert.equal(regression.status, "rollback");
  assert.equal(regression.shouldRollback, true);
});

test("receita e conversao nao duplicam quando o pedido possui varias acoes", () => {
  const [summary] = summarizeEcommerceAgentVersions({
    versions: ["v1"],
    now: Date.parse("2026-09-25T12:00:00Z"),
    actions: [
      { id: "a1", externalId: "order-1", agentVersion: "v1", whatsappSentAt: "2026-09-20T10:00:00Z", businessOutcome: "delivered", amount: 250 },
      { id: "a2", externalId: "order-1", agentVersion: "v1", whatsappSentAt: "2026-09-20T10:01:00Z", businessOutcome: "delivered", amount: 250 },
    ],
  });
  assert.equal(summary.sent, 1);
  assert.equal(summary.mature, 1);
  assert.equal(summary.conversions, 1);
  assert.equal(summary.revenue, 250);
});
