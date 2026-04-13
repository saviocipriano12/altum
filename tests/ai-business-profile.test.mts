import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTenantAiOperatingProfile, buildAiRuntimePolicy } from '../lib/server/ai/operating-layer.ts';
import {
  getBusinessProfile,
  getBusinessProfileCapturePreset,
  getBusinessProfilePlaybookPreset,
  getBusinessProfilePipelineStages,
  normalizeBusinessProfileId,
} from '../lib/business-profiles.ts';

test('business profile normalizes and returns expected defaults', () => {
  assert.equal(normalizeBusinessProfileId('Clinica'), 'clinica');
  assert.equal(normalizeBusinessProfileId('desconhecido'), 'generic');

  const clinica = getBusinessProfile('clinica');
  assert.equal(clinica.id, 'clinica');
  assert.ok(clinica.ai.mandatoryQuestions.length >= 4);
  assert.ok(clinica.pipeline.stages.includes('avaliacao'));

  const clinicaStages = getBusinessProfilePipelineStages('clinica');
  assert.equal(clinicaStages[0]?.id, 'captado');
  assert.ok(clinicaStages.some((stage) => stage.id === 'avaliacao'));

  const imobiliariaCapture = getBusinessProfileCapturePreset('imobiliaria');
  assert.equal(imobiliariaCapture.defaultPipelineStage, 'captado');
  assert.ok(imobiliariaCapture.fields.some((field) => field.id === 'tipo_imovel'));
  assert.ok(imobiliariaCapture.landing.heroTitle.length > 0);

  const agenciaPlaybook = getBusinessProfilePlaybookPreset('agencia');
  assert.ok(agenciaPlaybook.offers.length >= 3);
  assert.ok(agenciaPlaybook.scripts.some((item) => item.goal.toLowerCase().includes('diagnostico')));
});

test('ai operating layer normalizes tenant profile and builds runtime policy', () => {
  const profile = normalizeTenantAiOperatingProfile({
    tier: 'elite',
    autonomyMode: 'autonomous',
    reasoningLevel: 'deep',
    responseStyle: 'closer',
    preferredProviders: ['openai', 'anthropic', 'openai', 'invalid'],
    monthlyBudgetUsd: 2500,
    monthlyUsageCap: 9000,
  });

  assert.deepEqual(profile.preferredProviders, ['openai', 'anthropic']);
  assert.equal(profile.tier, 'elite');
  assert.equal(profile.autonomyMode, 'autonomous');

  const policy = buildAiRuntimePolicy(profile);
  assert.equal(policy.primaryProvider, 'openai');
  assert.deepEqual(policy.fallbackProviders, ['anthropic']);
  assert.equal(policy.conversationModel, 'gpt-4.1-mini');
  assert.equal(policy.extractionModel, 'gpt-4.1-mini');
  assert.equal(policy.retrievalMode, 'semantic');
  assert.equal(policy.supportsToolCalling, true);
  assert.equal(policy.supportsDeepReasoning, true);
  assert.equal(policy.budgetMode, 'premium');
});

test('ai operating layer falls back safely when profile is invalid', () => {
  const profile = normalizeTenantAiOperatingProfile({ preferredProviders: 'nao_existe', monthlyBudgetUsd: -5 });
  const policy = buildAiRuntimePolicy(profile);

  assert.equal(profile.tier, 'growth');
  assert.deepEqual(profile.preferredProviders, ['openai', 'altum_rules']);
  assert.equal(policy.primaryProvider, 'openai');
  assert.equal(policy.conversationModel, 'gpt-4.1-mini');
  assert.equal(policy.supportsToolCalling, true);
});

test('ai operating layer clamps premium openai models when premium is disabled', () => {
  const profile = normalizeTenantAiOperatingProfile({
    preferredProviders: ['openai'],
    allowPremiumModels: false,
    conversationModelOverride: 'gpt-5.4',
    extractionModelOverride: 'gpt-5-mini',
  });

  const policy = buildAiRuntimePolicy(profile);
  assert.equal(policy.conversationModel, 'gpt-4.1-mini');
  assert.equal(policy.extractionModel, 'gpt-4.1-mini');
  assert.equal(policy.modelGuardrailApplied, true);
  assert.equal(policy.modelGuardrailReason, 'premium_models_disabled');
});

test('ai operating layer keeps premium model when explicitly allowed', () => {
  const profile = normalizeTenantAiOperatingProfile({
    preferredProviders: ['openai'],
    allowPremiumModels: true,
    conversationModelOverride: 'gpt-5.4',
  });

  const policy = buildAiRuntimePolicy(profile);
  assert.equal(policy.conversationModel, 'gpt-5.4');
  assert.equal(policy.modelGuardrailApplied, false);
  assert.equal(policy.modelGuardrailReason, null);
});
