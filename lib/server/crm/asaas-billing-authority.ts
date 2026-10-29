import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
export type AsaasBillingContext = { platformTenantId?: string; subscriptionId?: string };
function fingerprint(value: FirebaseFirestore.DocumentData) { return createHash("sha256").update(JSON.stringify([value.tenantId, value.financeId, value.contractAutoBilling, value.platformTenantId, value.subscriptionId])).digest("hex"); }
export async function prepareAsaasBillingBinding(tx: FirebaseFirestore.Transaction, ledger: FirebaseFirestore.DocumentData, finance: FirebaseFirestore.DocumentData, financeId: string, context: AsaasBillingContext) {
  if (finance.contractAutoBilling !== true && context.platformTenantId !== finance.tenantId || context.platformTenantId && context.platformTenantId !== finance.tenantId) throw new Error("CRM_STAGE_ASAAS_BILLING_SCOPE_INVALID");
  const tenant = (await tx.get(adminDb.collection("tenants").doc(finance.tenantId))).data();
  if (!tenant || context.subscriptionId && tenant.asaasSubscriptionId !== context.subscriptionId) throw new Error("CRM_STAGE_ASAAS_BILLING_SUBSCRIPTION_REVOKED");
  const binding = { tenantId: finance.tenantId, financeId, contractAutoBilling: finance.contractAutoBilling === true,
    platformTenantId: context.platformTenantId || null, subscriptionId: context.subscriptionId || null };
  const signature = fingerprint(binding);
  if (ledger.billingBinding && fingerprint(ledger.billingBinding) !== signature) throw new Error("CRM_STAGE_ASAAS_BILLING_BINDING_CHANGED");
  return { binding, signature };
}
export async function assertAsaasBillingBinding(tx: FirebaseFirestore.Transaction, ledger: FirebaseFirestore.DocumentData, row: FirebaseFirestore.DocumentData, finance: FirebaseFirestore.DocumentData) {
  const binding = ledger.billingBinding;
  if (!binding || row.billingBindingFingerprint !== fingerprint(binding) || binding.financeId !== row.financeId || binding.tenantId !== row.tenantId ||
      binding.contractAutoBilling !== (finance.contractAutoBilling === true)) throw new Error("CRM_STAGE_ASAAS_BILLING_BINDING_REVOKED");
  await prepareAsaasBillingBinding(tx, ledger, finance, row.financeId, { platformTenantId: binding.platformTenantId || undefined, subscriptionId: binding.subscriptionId || undefined });
}

/** Platform billing can observe a customer without pretending its generated
 * subscription projection was an invoice linked to that customer's purchase. */
export async function prepareAsaasLeadBillingBinding(tx: FirebaseFirestore.Transaction, ledger: FirebaseFirestore.DocumentData, lead: FirebaseFirestore.DocumentData, leadId: string, context: AsaasBillingContext, invoices: FirebaseFirestore.QuerySnapshot) {
  if (context.platformTenantId !== lead.tenantId) throw new Error("CRM_STAGE_ASAAS_LEAD_BILLING_SCOPE_INVALID");
  const tenant = (await tx.get(adminDb.collection("tenants").doc(lead.tenantId))).data();
  if (!tenant || context.subscriptionId && tenant.asaasSubscriptionId !== context.subscriptionId) throw new Error("CRM_STAGE_ASAAS_LEAD_BILLING_SUBSCRIPTION_REVOKED");
  let projectionId: string | null = null;
  if (!invoices.empty) {
    const invoice = invoices.docs[0], row = invoice.data();
    if (!context.subscriptionId || invoices.size !== 1 || invoice.id !== `asaas_subscription_${lead.asaasChargeId}` || row.tenantId !== lead.tenantId ||
        row.leadId || row.contractAutoBilling !== true || row.asaasSubscriptionId !== context.subscriptionId || row.asaasChargeId !== lead.asaasChargeId ||
        Math.round(Number(row.valor) * 100) !== ledger.commercialPayment?.amountCents) throw new Error("CRM_STAGE_ASAAS_LEAD_BILLING_PROJECTION_CHANGED");
    projectionId = invoice.id;
  }
  const binding = { tenantId: lead.tenantId, leadId, subscriptionId: context.subscriptionId || null, projectionId };
  const signature = leadBindingFingerprint(binding);
  if (ledger.billingLeadBinding && leadBindingFingerprint(ledger.billingLeadBinding) !== signature) throw new Error("CRM_STAGE_ASAAS_LEAD_BILLING_BINDING_CHANGED");
  return { binding, signature };
}
export function leadBindingFingerprint(value: FirebaseFirestore.DocumentData) {
  return createHash("sha256").update(JSON.stringify([value.tenantId, value.leadId, value.subscriptionId, value.projectionId])).digest("hex");
}
