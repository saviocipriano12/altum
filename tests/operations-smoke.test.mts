import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePipelineStageId, normalizePipelineStages } from '../lib/pipeline.ts';
import { computeQueueStatus, buildManualQueuePatch, buildWatchdogChatPatch, resolveFirstResponseSlaMinutes } from '../lib/server/chat-operations.ts';

test('pipeline aliases normalize into canonical stages', () => {
  assert.equal(normalizePipelineStageId('contato_enviado'), 'contato');
  assert.equal(normalizePipelineStageId('respondido'), 'qualificacao');
  assert.equal(normalizePipelineStageId('fechado'), 'ganho');

  const stages = normalizePipelineStages([
    { label: 'Novo lead', position: 0 },
    { label: 'Contato enviado', position: 1 },
    { label: 'Negociação', position: 2 },
  ]);

  assert.equal(stages[0]?.id, 'captado');
  assert.equal(stages[1]?.id, 'contato');
  assert.equal(stages[2]?.id, 'fechamento');
});

test('chat operations compute queue and sla states consistently', () => {
  assert.equal(computeQueueStatus({ status: 'pending', assignedTo: null }), 'triage');
  assert.equal(computeQueueStatus({ status: 'open', assignedTo: 'u1', waitingForReply: true }), 'assigned_waiting');
  assert.equal(computeQueueStatus({ status: 'open', assignedTo: 'u1', waitingForReply: true, slaBreached: true }), 'sla_breached');

  const now = Date.now();
  const manualPatch = buildManualQueuePatch({
    status: 'open',
    assignedTo: 'u1',
    lastClientMessageAt: new Date(now),
    lastAgentMessageAt: new Date(now - 60_000),
    slaDueAt: new Date(now - 1_000),
  });
  assert.equal(manualPatch.queueStatus, 'sla_breached');

  const watchdogPatch = buildWatchdogChatPatch({
    status: 'open',
    assignedTo: 'u1',
    lastClientMessageAt: new Date(now),
    lastAgentMessageAt: new Date(now - 60_000),
    slaDueAt: new Date(now - 1_000),
    slaBreachedAt: null,
  });
  assert.equal(watchdogPatch.queueStatus, 'sla_breached');
  assert.equal(watchdogPatch.slaState, 'breached');

  assert.equal(resolveFirstResponseSlaMinutes({ rules: { inbox: { firstResponseSlaMinutes: 3 } } }), 5);
  assert.equal(resolveFirstResponseSlaMinutes({ rules: { firstResponseSlaMinutes: 90 } }), 90);
});
