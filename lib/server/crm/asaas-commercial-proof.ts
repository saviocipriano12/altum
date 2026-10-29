import { createHash } from "node:crypto";
import { parseAsaasEventTime } from "@/lib/server/crm/asaas-event-time";
function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function asaasCommercialEventState(event: unknown): string | null {
  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(String(event))) return "pago";
  if (["PAYMENT_CREATED", "PAYMENT_AWAITING_RISK_ANALYSIS", "PAYMENT_RESTORED"].includes(String(event))) return "pendente";
  if (event === "PAYMENT_OVERDUE") return "atrasado";
  if (["PAYMENT_DELETED", "PAYMENT_CANCELED", "PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(String(event))) return "cancelado";
  return null;
}
export function asaasWebhookAuthorityFingerprint() { const token = process.env.ASAAS_WEBHOOK_TOKEN; return token ? createHash("sha256").update(token).digest("hex") : null; }
function proofFingerprint(value: FirebaseFirestore.DocumentData) {
  return createHash("sha256").update(JSON.stringify({ protocol: value.protocol, chargeId: value.chargeId, event: value.event, providerStatus: value.providerStatus,
    amountCents: value.amountCents, method: value.method, occurredAtMs: value.occurredAtMs, clockDomain: value.clockDomain, platformReference: value.platformReference, authorityFingerprint: value.authorityFingerprint })).digest("hex");
}
/** Persist only the payment fields needed to prove commercial effects. No
 * customer/contact content, raw request body or credentials belong in the ledger. */
export function asaasCommercialPaymentProof(event: string, payment: Record<string, unknown>, occurredAt: unknown) {
  const amount = typeof payment.value === "number" || typeof payment.value === "string" && payment.value.trim() ? Number(payment.value) : NaN;
  const eventTime = parseAsaasEventTime(occurredAt);
  const value = { protocol: 2, chargeId: clean(payment.id, 140), event, providerStatus: clean(payment.status, 80).toUpperCase(),
    amountCents: Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null, method: clean(payment.billingType, 40).toUpperCase(),
    ...eventTime, platformReference: clean(payment.externalReference, 400).startsWith("altum:"), authorityFingerprint: asaasWebhookAuthorityFingerprint() };
  return { ...value, fingerprint: proofFingerprint(value) };
}
export function isVerifiedAsaasPaidProof(value: FirebaseFirestore.DocumentData | undefined, chargeId: string) {
  return isVerifiedAsaasCommercialProof(value, chargeId) && ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(value!.event) &&
    ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(value!.providerStatus) && Number.isSafeInteger(value!.amountCents) && value!.amountCents >= 0;
}
export function isVerifiedAsaasCommercialProof(value: FirebaseFirestore.DocumentData | undefined, chargeId: string) {
  return value?.protocol === 2 && value.platformReference === false && value.fingerprint === proofFingerprint(value) && value.chargeId === chargeId &&
    asaasCommercialEventState(value.event) !== null && value.authorityFingerprint && value.authorityFingerprint === asaasWebhookAuthorityFingerprint();
}
export function isVerifiedAsaasBillingProof(value: FirebaseFirestore.DocumentData | undefined, chargeId: string, paid = true) {
  return value?.protocol === 2 && typeof value.platformReference === "boolean" && value.fingerprint === proofFingerprint(value) && value.chargeId === chargeId &&
    asaasCommercialEventState(value.event) !== null && value.authorityFingerprint === asaasWebhookAuthorityFingerprint() && Boolean(value.authorityFingerprint) &&
    (!paid || ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(value.event) && ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(value.providerStatus) && Number.isSafeInteger(value.amountCents) && value.amountCents >= 0);
}

