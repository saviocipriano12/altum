import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiTaskPreset,
  humanizeAiNextAction,
  suggestPipelineStageForAiAction,
} from '../lib/ai-next-actions.ts';

test('ai next actions map to human labels, stage hints and task presets', () => {
  assert.equal(humanizeAiNextAction('preparar_proposta_comercial'), 'Preparar proposta comercial');
  assert.equal(humanizeAiNextAction('sugerir_oferta_diagnostico'), 'Sugerir oferta comercial');

  assert.equal(
    suggestPipelineStageForAiAction('preparar_proposta_comercial', ['captado', 'qualificacao', 'proposta', 'ganho']),
    'proposta'
  );
  assert.equal(
    suggestPipelineStageForAiAction('agendar_proximo_passo', ['captado', 'avaliacao', 'fechamento']),
    'avaliacao'
  );

  assert.deepEqual(buildAiTaskPreset('assumir_handoff_humano', 'Maria'), {
    title: 'Assumir atendimento humano de Maria',
    type: 'pendencia',
    priority: 'high',
  });
  assert.deepEqual(buildAiTaskPreset('preparar_proposta_comercial', 'Carlos'), {
    title: 'Preparar proposta para Carlos',
    type: 'proposta',
    priority: 'high',
  });
});
