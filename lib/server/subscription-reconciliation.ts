import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { asaasRequest } from "./asaas-api";
import { cancelPlatformSubscription } from "./subscription-cancellation";
import { ensureSubscriptionFiscalSettings } from "./subscription-fiscal";
import { getBillingBlockAt } from "@/lib/platform-subscription-policy";
import { paidAccessEnd, PAID_STATUSES } from "@/lib/subscription-lifecycle";
import { getTenantBillingAccessDenial } from "@/lib/tenant-billing-access";
import { applyPlatformPlanEntitlements } from "./platform-plan-entitlements";

export async function reconcilePlatformSubscriptions() {
  const deadline = Date.now() + 240_000;
  const failures: string[] = [];
  const [pending, interrupted] = await Promise.all([
    adminDb.collection("billing_operations").where("status", "==", "needs_retry").limit(5).get(),
    adminDb.collection("billing_operations").where("status", "==", "running").limit(5).get(),
  ]);
  const retries = [...pending.docs, ...interrupted.docs.filter((doc) => Number(doc.data().lockUntil) <= Date.now())];
  for (const doc of retries) {
    const operation = doc.data();
    try {
      await cancelPlatformSubscription({ tenantId: operation.tenantId, subscriptionId: operation.subscriptionId,
        actorId: operation.actorId, reason: operation.reason });
    } catch { failures.push(`operation:${doc.id}`); }
  }
  const cursorRef = adminDb.collection("internal_job_locks").doc("subscription_reconciliation_cursor");
  const cursor = (await cursorRef.get()).data()?.lastTenantId as string | undefined;
  let query = adminDb.collection("tenants").where("billingProvider", "==", "asaas").orderBy("__name__").limit(100);
  if (cursor) query = query.startAfter(cursor);
  const tenants = await query.get();
  let lastTenantId: string | null = null;
  let checked = 0;
  for (const doc of tenants.docs) {
    if (Date.now() >= deadline) break;
    lastTenantId = doc.id;
    checked++;
    const tenant = doc.data();
    const id = String(tenant.asaasSubscriptionId || "");
    if (!id || tenant.billingOperationPending) continue;
    try {
      if (tenant.billingStatus === "refund_pending" && tenant.refundPaymentId) {
        const refunded = await asaasRequest<Record<string, unknown>>(`/payments/${encodeURIComponent(String(tenant.refundPaymentId))}`);
        if (refunded.status === "REFUNDED") {
          await doc.ref.set({ billingStatus: "cancelled", status: "blocked", refundedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        continue;
      }
      if (tenant.cancelAtPeriodEnd || tenant.billingStatus === "cancelled" || tenant.billingStatus === "refund_pending") {
        const denial = getTenantBillingAccessDenial(tenant);
        if (denial) await doc.ref.set({ status: "blocked", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }
      const [subscription, response] = await Promise.all([
        asaasRequest<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(id)}`),
        asaasRequest<{ data?: Array<Record<string, unknown>> }>(`/subscriptions/${encodeURIComponent(id)}/payments?limit=100`),
      ]);
      const payments = response.data || [];
      const due = payments.filter((payment) => String(payment.dueDate) <= new Date().toISOString().slice(0, 10))
        .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))[0];
      const patch: Record<string, unknown> = { asaasNextDueDate: subscription.nextDueDate || null,
        asaasBillingType: subscription.billingType || null, asaasSubscriptionStatus: subscription.status || null,
        billingReconciledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      if (subscription.status === "INACTIVE") { patch.status = "blocked"; patch.billingStatus = "cancelled"; }
      else if (due && PAID_STATUSES.has(String(due.status))) {
        patch.status = "active"; patch.billingStatus = "active"; patch.blockedReason = null;
        patch.billingBlockAt = FieldValue.delete();
        const end = paidAccessEnd(payments); if (end) patch.paidAccessEndsAt = end;
      } else if (due?.status === "OVERDUE") {
        patch.billingStatus = "past_due"; patch.billingBlockAt = getBillingBlockAt(due.dueDate);
        patch.status = (patch.billingBlockAt as Date).getTime() <= Date.now() ? "blocked" : "active";
      }
      const fiscal = await ensureSubscriptionFiscalSettings(id).catch(() => ({ status: "error" }));
      patch.billingFiscalStatus = fiscal.status;
      const changed = await adminDb.runTransaction(async (tx) => {
        const current = (await tx.get(doc.ref)).data() || {};
        if (current.billingOperationPending || current.cancelAtPeriodEnd || current.asaasSubscriptionId !== id) return false;
        tx.set(doc.ref, patch, { merge: true });
        return true;
      });
      if (changed && patch.billingStatus === "active") {
        await applyPlatformPlanEntitlements({ tenantId: doc.id, planId: tenant.platformPlan, source: "asaas_reconciliation" });
      }
    } catch { failures.push(`tenant:${doc.id}`); }
  }
  await cursorRef.set({ lastTenantId: checked < tenants.size || tenants.size === 100 ? lastTenantId : null,
    updatedAt: FieldValue.serverTimestamp(), failures }, { merge: true });
  return { checked, cancellationRetries: retries.length, failures };
}
