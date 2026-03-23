import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChargeAmount,
  normalizeChargeBillingType,
  resolveChargeDescription,
  resolveChargeDueDate,
  resolveChargeMethodForAsaas,
} from '../lib/server/commercial-charge.ts';

test('commercial charge helpers normalize billing inputs safely', () => {
  assert.equal(normalizeChargeAmount('123.456'), 123.46);
  assert.equal(normalizeChargeAmount('abc'), null);

  assert.equal(normalizeChargeBillingType('boleto'), 'BOLETO');
  assert.equal(normalizeChargeBillingType('credit_card'), 'CREDIT_CARD');
  assert.equal(normalizeChargeBillingType('qualquer_coisa'), 'PIX');

  assert.equal(resolveChargeMethodForAsaas('CREDIT_CARD'), 'UNDEFINED');
  assert.equal(resolveChargeMethodForAsaas('PIX'), 'PIX');
});

test('commercial charge helpers resolve due date and description with safe fallback', () => {
  const fixedNow = new Date('2026-03-21T15:30:00.000Z');

  assert.equal(resolveChargeDueDate('2026-04-10', fixedNow), '2026-04-10');
  assert.equal(resolveChargeDueDate('', fixedNow), '2026-03-21');

  assert.equal(
    resolveChargeDescription({ explicitDescription: 'Mensalidade premium', budgetTitle: 'Orçamento X', customerName: 'Cliente Y' }),
    'Mensalidade premium'
  );
  assert.equal(
    resolveChargeDescription({ budgetTitle: 'Proposta março', customerName: 'Cliente Y' }),
    'Proposta março'
  );
  assert.equal(resolveChargeDescription({ customerName: 'Cliente Y' }), 'Cobranca ALTUM - Cliente Y');
  assert.equal(resolveChargeDescription({}), 'Cobranca ALTUM - Cliente');
});
