import test from 'node:test';
import assert from 'node:assert/strict';
import { getBusinessProfileStarterKit } from '../lib/business-profile-starter-kit.ts';

test('starter kit for clinica seeds pipeline and base automations', () => {
  const starterKit = getBusinessProfileStarterKit('clinica');

  assert.equal(starterKit.profileId, 'clinica');
  assert.ok(starterKit.pipelineStages.some((stage) => stage.id === 'avaliacao'));
  assert.equal(starterKit.automations.length, 5);
  assert.ok(starterKit.automations.some((item) => item.key === 'ai_copilot'));
  assert.ok(
    starterKit.automations
      .find((item) => item.key === 'reply_recovery')
      ?.actions.some((action) => action.type === 'send_message' && action.text?.includes('avaliacao'))
  );
});

test('starter kit for imobiliaria adapts offer and follow-up flow', () => {
  const starterKit = getBusinessProfileStarterKit('imobiliaria');
  const budgetFollowup = starterKit.automations.find((item) => item.key === 'budget_followup');

  assert.equal(starterKit.profileId, 'imobiliaria');
  assert.ok(starterKit.pipelineStages.some((stage) => stage.id === 'visita_agendada'));
  assert.equal(budgetFollowup?.trigger, 'budget_approved');
  assert.ok(budgetFollowup?.actions.some((action) => action.title?.includes('visita')));
});
