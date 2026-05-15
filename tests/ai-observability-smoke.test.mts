import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD,
  AI_QUEUE_RECURRING_AUTH_ALERT_THRESHOLD,
  AI_QUEUE_STALE_AFTER_MS,
  buildAiAlertGuidance,
  classifyAiQueueError,
  summarizeAiQueueObservability,
  toTenantOperationalSnapshot,
} from "../lib/server/ai/observability-core.ts";

test("AI observability classifies provider failures into operational buckets", () => {
  assert.deepEqual(classifyAiQueueError("OAuthException: token has expired"), {
    errorCode: "auth_invalid",
    reasonCode: "auth_failed",
    message: "OAuthException: token has expired",
  });

  assert.deepEqual(classifyAiQueueError("insufficient_quota: billing hard limit reached"), {
    errorCode: "quota_exceeded",
    reasonCode: "quota_exceeded",
    message: "insufficient_quota: billing hard limit reached",
  });

  assert.deepEqual(classifyAiQueueError("429 too many requests"), {
    errorCode: "rate_limited",
    reasonCode: "rate_limited",
    message: "429 too many requests",
  });

  assert.deepEqual(classifyAiQueueError("503 service unavailable"), {
    errorCode: "provider_unavailable",
    reasonCode: "provider_unavailable",
    message: "503 service unavailable",
  });

  assert.deepEqual(classifyAiQueueError("network fetch failed: ECONNRESET"), {
    errorCode: "network_error",
    reasonCode: "network_error",
    message: "network fetch failed: ECONNRESET",
  });
});

test("AI alert guidance routes queue and auth incidents to the correct operational surfaces", () => {
  const queueGuidance = buildAiAlertGuidance({
    reasonCode: "dead_letter_threshold",
    title: "Fila com retries e dead letters",
  });
  assert.equal(queueGuidance.type, "queue_degraded");
  assert.equal(queueGuidance.href, "/cliente/painel/logs");

  const authGuidance = buildAiAlertGuidance({
    errorCode: "auth_invalid",
    detail: "Token do provider expirou",
  });
  assert.equal(authGuidance.type, "auth_invalid");
  assert.equal(authGuidance.href, "/cliente/painel/ia");
});

test("AI observability summarizes stale queue and recurring auth failures as high risk", () => {
  const nowMs = Date.parse("2026-04-27T15:00:00.000Z");
  const observability = summarizeAiQueueObservability({
    nowMs,
    workerHealth: {
      status: "healthy",
      lastHeartbeatAt: new Date(nowMs - 30_000),
      lastProcessedAt: new Date(nowMs - 60_000),
    },
    jobs: [
      {
        id: "job_pending_1",
        tenantId: "tenant_alpha",
        status: "pending",
        availableAt: new Date(nowMs - AI_QUEUE_STALE_AFTER_MS - 60_000),
        updatedAt: new Date(nowMs - 120_000),
      },
      {
        id: "job_retry_1",
        tenantId: "tenant_alpha",
        status: "retrying",
        availableAt: new Date(nowMs - 120_000),
        updatedAt: new Date(nowMs - 90_000),
        failedAt: new Date(nowMs - 90_000),
      },
      {
        id: "job_done_1",
        tenantId: "tenant_beta",
        status: "done",
        completedAt: new Date(nowMs - 10_000),
        updatedAt: new Date(nowMs - 10_000),
      },
    ],
    metrics: [
      {
        tenantId: "tenant_alpha",
        dateRef: "2026-04-27",
        counters: {
          claimed: 10,
          processed: 4,
          failed: 4,
          retried: 3,
          deadLetter: 0,
          enqueued: 11,
        },
        errorCounters: {
          auth_invalid: AI_QUEUE_RECURRING_AUTH_ALERT_THRESHOLD,
        },
        lastProcessedAt: new Date(nowMs - 180_000),
        lastFailedAt: new Date(nowMs - 90_000),
        updatedAt: new Date(nowMs - 30_000),
      },
      {
        tenantId: "tenant_beta",
        dateRef: "2026-04-27",
        counters: {
          claimed: 6,
          processed: 6,
          failed: 0,
          retried: 0,
          deadLetter: 0,
          enqueued: 6,
        },
        errorCounters: {},
        lastProcessedAt: new Date(nowMs - 10_000),
        updatedAt: new Date(nowMs - 10_000),
      },
    ],
  });

  assert.equal(observability.worker.status, "healthy");
  assert.equal(observability.overview.highRiskTenants, 1);
  assert.equal(observability.overview.status, "degraded");

  const alpha = observability.tenants.find((item) => item.tenantId === "tenant_alpha");
  assert.ok(alpha);
  assert.equal(alpha?.staleQueue, true);
  assert.equal(alpha?.riskLevel, "high");
  assert.ok(alpha?.riskReasons.includes("stale_queue"));
  assert.ok(alpha?.riskReasons.includes("recurring_auth_failures"));
  assert.equal(alpha?.backlog, 2);

  const beta = observability.tenants.find((item) => item.tenantId === "tenant_beta");
  assert.ok(beta);
  assert.equal(beta?.riskLevel, "stable");
  assert.equal(beta?.backlog, 0);
});

test("AI observability treats dead-letter volume as a hard operational incident", () => {
  const nowMs = Date.parse("2026-04-27T15:00:00.000Z");
  const observability = summarizeAiQueueObservability({
    nowMs,
    workerHealth: {
      status: "degraded",
      lastHeartbeatAt: new Date(nowMs - 20_000),
    },
    jobs: Array.from({ length: AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD }, (_, index) => ({
      id: `dead_${index}`,
      tenantId: "tenant_dead",
      status: "dead_letter",
      failedAt: new Date(nowMs - (index + 1) * 1_000),
      updatedAt: new Date(nowMs - (index + 1) * 1_000),
    })),
    metrics: [
      {
        tenantId: "tenant_dead",
        dateRef: "2026-04-27",
        counters: {
          claimed: 5,
          processed: 1,
          failed: 3,
          retried: 1,
          deadLetter: AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD,
        },
        errorCounters: {
          provider_unavailable: 2,
        },
        lastFailedAt: new Date(nowMs - 5_000),
        updatedAt: new Date(nowMs - 5_000),
      },
    ],
  });

  const deadTenant = observability.tenants[0];
  assert.equal(deadTenant?.tenantId, "tenant_dead");
  assert.equal(deadTenant?.riskLevel, "high");
  assert.ok(deadTenant?.riskReasons.includes("dead_letter_threshold"));
  assert.equal(observability.overview.highRiskTenants, 1);
});

test("tenant operational snapshot escalates from healthy to down based on queue and alert severity", () => {
  assert.deepEqual(
    toTenantOperationalSnapshot({
      workerStatus: "healthy",
      queueRiskLevel: "stable",
      deadLetterCount: 0,
      recurringAuthFailures: 0,
      recurringQuotaFailures: 0,
    }),
    {
      status: "healthy",
      label: "healthy",
      reason: "Operacao estavel sem sinais criticos de fila, quota ou autenticacao.",
    }
  );

  assert.deepEqual(
    toTenantOperationalSnapshot({
      workerStatus: "degraded",
      queueRiskLevel: "warning",
      hasWarningAlert: true,
    }),
    {
      status: "degraded",
      label: "degraded",
      reason: "Operacao com degradacao moderada, exige ajuste para evitar incidente.",
    }
  );

  assert.deepEqual(
    toTenantOperationalSnapshot({
      workerStatus: "healthy",
      queueRiskLevel: "stable",
      deadLetterCount: AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD,
      recurringAuthFailures: 0,
      recurringQuotaFailures: 0,
    }),
    {
      status: "down",
      label: "down",
      reason: "Risco alto detectado: fila/credencial/quota com impacto direto na operacao.",
    }
  );
});
