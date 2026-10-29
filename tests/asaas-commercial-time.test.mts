import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { FIREBASE_PROJECT_ID: 'demo-altum-qa-lab', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-altum-qa-lab', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_SERVICE_ACCOUNT_KEY: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: '', ASAAS_WEBHOOK_TOKEN: 'qa-fictitious-asaas-webhook-only' });
const { asaasCommercialPaymentProof } = await import('../lib/server/crm/asaas-commercial-proof.ts');
test('documented Asaas event datetime has a stable ordering value across server time zones', () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const utc = asaasCommercialPaymentProof('PAYMENT_RECEIVED', { id: 'qa_time_charge', value: 100, billingType: 'PIX', status: 'RECEIVED' }, '2024-06-12 16:45:03');
    process.env.TZ = 'America/Sao_Paulo';
    const brasil = asaasCommercialPaymentProof('PAYMENT_RECEIVED', { id: 'qa_time_charge', value: 100, billingType: 'PIX', status: 'RECEIVED' }, '2024-06-12 16:45:03');
    assert.equal(utc.occurredAtMs, brasil.occurredAtMs);
    assert.equal(utc.fingerprint, brasil.fingerprint);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

const { parseAsaasEventTime } = await import('../lib/server/crm/asaas-event-time.ts');
test('provider civil clock and explicit-offset instants stay in distinct, deterministic domains', () => {
  assert.deepEqual(parseAsaasEventTime('2024-06-12 16:45:03'), { occurredAtMs: Date.UTC(2024, 5, 12, 16, 45, 3), clockDomain: 'provider_wall_clock' });
  assert.deepEqual(parseAsaasEventTime('2024-06-12T16:45:03-03:00'), { occurredAtMs: Date.UTC(2024, 5, 12, 19, 45, 3), clockDomain: 'absolute' });
  assert.deepEqual(parseAsaasEventTime('2024-06-12T19:45:03Z'), parseAsaasEventTime('2024-06-12T16:45:03-03:00'));
  assert.equal(parseAsaasEventTime('2024-02-30 16:45:03').clockDomain, 'unknown');
  assert.equal(parseAsaasEventTime('2024-06-12').clockDomain, 'unknown');
  assert.equal(parseAsaasEventTime('2024-06-12 25:45:03').clockDomain, 'unknown');
});
