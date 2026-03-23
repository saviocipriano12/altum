import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaptureFields, groupCaptureFieldsByStep, isCaptureFieldVisible, normalizeCaptureFieldValue } from '../lib/capture-form.ts';

test('capture form normalizes fields, steps and conditional visibility', () => {
  const fields = normalizeCaptureFields([
    { id: ' Company Name ', label: 'Empresa', type: 'text', required: true, step: 2 },
    { label: 'Interesse', type: 'select', options: ['CRM', 'CRM', ' IA '], step: 1 },
    { label: 'Tem urgencia?', type: 'checkbox', step: 1 },
    { label: 'Prazo', type: 'text', required: true, showWhenFieldId: 'tem_urgencia?', showWhenEquals: 'true', step: 2 },
  ]);

  assert.equal(fields.length, 4);
  assert.equal(fields[0]?.id, 'company_name');
  assert.deepEqual(fields[1]?.options, ['CRM', 'IA']);

  const grouped = groupCaptureFieldsByStep(fields);
  assert.deepEqual(grouped.map((item) => item.step), [1, 2]);
  assert.equal(grouped[0]?.items.length, 2);
  assert.equal(grouped[1]?.items.length, 2);

  const urgencyField = fields[3];
  assert.equal(isCaptureFieldVisible(urgencyField, { 'tem_urgencia?': false }), false);
  assert.equal(isCaptureFieldVisible(urgencyField, { 'tem_urgencia?': true }), true);
});

test('capture form normalizes values by field type', () => {
  const [textField, numberField, checkboxField] = normalizeCaptureFields([
    { label: 'Nome', type: 'text' },
    { label: 'Investimento', type: 'number' },
    { label: 'Aceita termos', type: 'checkbox' },
  ]);

  assert.equal(normalizeCaptureFieldValue(textField, '  ALTUM  '), 'ALTUM');
  assert.equal(normalizeCaptureFieldValue(numberField, '1500'), 1500);
  assert.equal(normalizeCaptureFieldValue(numberField, 'abc'), null);
  assert.equal(normalizeCaptureFieldValue(checkboxField, true), true);
  assert.equal(normalizeCaptureFieldValue(checkboxField, 'true'), false);
});
