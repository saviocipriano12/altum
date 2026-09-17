import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { asaasList, asaasRequest, AsaasApiError } from "./asaas-api";
import { SelfServiceAuthError, timestampToMillis } from "./self-service-auth";
import { isWithinRefundWindow } from "@/lib/platform-subscription-policy";
import { completeProviderCancellation, RefundReviewRequired } from "@/lib/subscription-provider-cancellation";
import { paidAccessEnd, PAID_STATUSES } from "@/lib/subscription-lifecycle";

export async function cancelPlatformSubscription(input: {
  tenantId: string; subscriptionId: string; actorId: string; reason: string;
}) {
  const id = createHash("sha256").update(`${input.tenantId}:${input.subscriptionId}:cancel`).digest("hex");
  const operation = adminDb.collection("billing_operations").doc(id);
  const tenantRef = adminDb.collection("tenants").doc(input.tenantId);
  const existing = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(operation);
    const saved = snap.data() || {};
    if (saved.status === "completed") return saved.result as Record<string, unknown>;
    if (saved.status === "running" && Number(saved.lockUntil) > Date.now()) {
      throw new SelfServiceAuthError(409, "billing_operation_running", "Seu cancelamento esta sendo processado. Atualize a pagina em alguns instantes.");
    }
    tx.set(operation, { ...input, status: "running", lockUntil: Date.now() + 600_000,
      createdAt: saved.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return null;
  });
  if (existing) return { ...existing, reused: true };
  try {
    const saved = (await operation.get()).data() || {};
    let accessEndsAt = saved.accessEndsAt ? new Date(saved.accessEndsAt) : null;
    let refundPaymentId = String(saved.refundPaymentId || "");
    let refundEligible = Boolean(saved.refundEligible);
    if (!saved.prepared) {
      const payments = await asaasList<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(input.subscriptionId)}/payments`);
      const tenant = (await tenantRef.get()).data() || {};
      accessEndsAt = paidAccessEnd(payments);
      const start = timestampToMillis(tenant.subscriptionStartedAt || tenant.firstPaymentAt);
      refundEligible = Boolean(start && isWithinRefundWindow(new Date(start)));
      const paid = payments.filter((payment) => PAID_STATUSES.has(String(payment.status)));
      // The commercial refund guarantee applies to the first subscription charge.
      // Never silently refund a newer renewal instead of the original charge.
      paid.sort((a, b) => String(a.dateCreated || a.dueDate).localeCompare(String(b.dateCreated || b.dueDate)));
      refundPaymentId = refundEligible ? String(paid[0]?.id || "") : "";
      if (refundEligible && !refundPaymentId) throw new SelfServiceAuthError(409, "refund_payment_missing", "O pagamento precisa ser conciliado antes do estorno. Fale com a Altum.");
      await operation.set({ prepared: true, accessEndsAt: accessEndsAt?.toISOString() || null,
        refundEligible, refundPaymentId }, { merge: true });
      await tenantRef.set({ billingPaymentsSnapshot: payments.slice(0, 24).map((payment) => ({
        id: payment.id, status: payment.status, value: payment.value, dueDate: payment.dueDate || null,
        confirmedDate: payment.confirmedDate || null, paymentDate: payment.paymentDate || null,
        billingType: payment.billingType || null, invoiceUrl: payment.invoiceUrl || null,
      })) }, { merge: true });
    }
    await tenantRef.set({ billingOperationPending: true, subscriptionCancellationPending: true,
      ...(accessEndsAt && accessEndsAt.getTime() > Date.now() ? {
        billingStatus: "cancel_scheduled", cancelAtPeriodEnd: true, accessEndsAt,
      } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    // Stop all future billing before requesting a refund. DELETE also removes
    // unpaid generated charges; a suspension alone would leave them collectible.
    try {
      await completeProviderCancellation({
        subscriptionId: input.subscriptionId, refundPaymentId, refundEligible, reason: input.reason,
        state: saved,
        request: async (path, init) => {
          try { return await asaasRequest<Record<string, unknown>>(path, init); }
          catch (error) { if (init?.method === "DELETE" && error instanceof AsaasApiError && error.status === 404) return {}; throw error; }
        },
        persist: async (patch) => { await operation.set(patch, { merge: true }); },
      });
    } catch (error) {
      if (error instanceof RefundReviewRequired) throw new SelfServiceAuthError(409, "refund_needs_review", "A recorrencia foi encerrada. O estorno precisa ser conferido pela Altum antes de uma nova tentativa.");
      throw error;
    }
    const preserveAccess = Boolean(accessEndsAt && accessEndsAt.getTime() > Date.now());
    const result = { ok: true, action: refundEligible ? "refund_pending" : preserveAccess ? "cancel_scheduled" : "cancelled",
      accessEndsAt: accessEndsAt?.toISOString() || null, refundEligible, protocol: id.slice(0, 12) };
    await adminDb.runTransaction(async (tx) => {
      const current = (await tx.get(tenantRef)).data() || {};
      const refunded = Boolean(current.refundedAt);
      const billingStatus = refunded ? "cancelled" : String(result.action);
      const patch = { billingStatus, status: refunded || (!refundEligible && !preserveAccess) ? "blocked" : "active",
        cancelAtPeriodEnd: !refundEligible && preserveAccess, accessEndsAt: accessEndsAt || null,
        cancelRequestedAt: FieldValue.serverTimestamp(), cancelReason: input.reason,
        asaasSubscriptionStatus: "DELETED", subscriptionCancellationPending: false,
        billingOperationPending: false, cancelProtocol: result.protocol,
        ...(refundEligible && !refunded ? { refundPaymentId, refundRequestedAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp() };
      tx.set(tenantRef, patch, { merge: true });
      tx.set(adminDb.collection("client_contracts").doc(input.tenantId), {
        accessStatus: billingStatus, cancelAtPeriodEnd: patch.cancelAtPeriodEnd,
        accessEndsAt: patch.accessEndsAt, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(operation, { status: "completed", emailStatus: "pending", result, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(adminDb.collection("audit_logs").doc(`billing-${id}`), { ...input,
        type: "asaas_subscription_cancelled", ...result, createdAt: FieldValue.serverTimestamp() });
    });
    return result;
  } catch (error) {
    await operation.set({ status: "needs_retry", lockUntil: 0, errorCode: error instanceof SelfServiceAuthError ? error.code : "provider_or_storage_failure",
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await tenantRef.set({ billingOperationPending: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}
