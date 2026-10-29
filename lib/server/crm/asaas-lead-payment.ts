import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { FinanceMutationConflict, isPaidFinanceStatus } from "@/lib/server/crm/finance-paid-occurrence";
import { isVerifiedAsaasPaidProof } from "@/lib/server/crm/asaas-finance-occurrence";
import { isVerifiedAsaasBillingProof } from "@/lib/server/crm/asaas-commercial-proof";
import { prepareAsaasLeadBillingBinding, leadBindingFingerprint, type AsaasBillingContext } from "@/lib/server/crm/asaas-billing-authority";
import { prepareFinanceStageDecision } from "@/lib/server/crm/finance-stage-transition";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { TenantAccessError } from "@/lib/server/tenant";
import { getTenantBillingAccessDenial } from "@/lib/tenant-billing-access";
import { planAsaasCommercialOrder, writeAsaasCommercialOrder, asaasOrderCanApply, asaasOrderMetadata, holdAsaasCommercialOrder, assertAsaasCommercialOrder } from "@/lib/server/crm/asaas-commercial-order";

export const ASAAS_LEAD_PAYMENT_JOB_TYPE = "crm_asaas_lead_payment";
function validId(value: unknown): value is string { return typeof value === "string" && Boolean(value) && value === value.trim() && value.length <= 500 && !value.includes("/"); }
function cents(value: unknown) { return typeof value === "number" || typeof value === "string" && value.trim() ? Math.round(Number(value) * 100) : NaN; }
function signature(lead: FirebaseFirestore.DocumentData) {
  return createHash("sha256").update(JSON.stringify([lead.tenantId, lead.asaasChargeId, lead.paymentValue ?? null, lead.paymentMethod ?? null,
    lead.asaasPaymentConfirmedAt?.toMillis?.() ?? null])).digest("hex");
}
function identity(leadId: string, ledgerId: string) { const key = createHash("sha256").update(JSON.stringify([leadId, ledgerId])).digest("hex"); return { id: `crm_asaas_lead_payment_${key}`, eventId: `asaas_lead_paid_${key}` }; }

/** A lead-only payment proves a stage transition, not a nonexistent invoice or
 * a finance_paid automation. Facts and pending stage effects commit together. */
export async function commitAsaasLeadPayment(input: { leadId: string; ledgerId: string; chargeId: string; billing?: AsaasBillingContext }) {
  if (![input.leadId, input.ledgerId, input.chargeId].every(validId)) throw new FinanceMutationConflict("Origem da cobranca do cliente invalida.");
  const { id, eventId } = identity(input.leadId, input.ledgerId), leadRef = adminDb.collection("leads").doc(input.leadId), confirmedAt = Timestamp.now();
  return adminDb.runTransaction(async tx => {
    const reads = await Promise.allSettled([tx.get(leadRef), tx.get(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId)),
      tx.get(adminDb.collection("jobs").doc(id)), tx.get(adminDb.collection("leads").where("asaasChargeId", "==", input.chargeId).limit(2)),
      tx.get(adminDb.collection("financeiro").where("asaasChargeId", "==", input.chargeId).limit(2))]);
    for (const read of reads) if (read.status === "rejected") throw read.reason;
    const [leadRead, ledgerRead, existingRead, bindingsRead, invoicesRead] = reads;
    if (leadRead.status !== "fulfilled" || ledgerRead.status !== "fulfilled" || existingRead.status !== "fulfilled" || bindingsRead.status !== "fulfilled" || invoicesRead.status !== "fulfilled") throw new FinanceMutationConflict("Leitura da cobranca incompleta.");
    const lead = leadRead.value.data(), ledger = ledgerRead.value.data(), proof = ledger?.commercialPayment, existing = existingRead.value.data();
    if (!lead || !validId(lead.tenantId) || lead.asaasChargeId !== input.chargeId || bindingsRead.value.size !== 1 || bindingsRead.value.docs[0].id !== input.leadId || !input.billing && !invoicesRead.value.empty ||
        !ledger || !["processing", "completed"].includes(ledger.status) || ledger.chargeId !== input.chargeId || !(input.billing ? isVerifiedAsaasBillingProof(proof, input.chargeId) : isVerifiedAsaasPaidProof(proof, input.chargeId)) || proof.event !== ledger.event) throw new FinanceMutationConflict("Cobranca do cliente ambigua ou sem origem verificada.");
    const billing = input.billing ? await prepareAsaasLeadBillingBinding(tx, ledger, lead, input.leadId, input.billing, invoicesRead.value) : null;
    if (!billing && ledger.billingLeadBinding) throw new FinanceMutationConflict("Assinatura nao e compra do cliente.");
    const authority = billing ? "asaas_billing_lead_event" : "asaas_lead_event";
    const purpose = billing ? { paymentPurpose: "platform_billing", billingLeadBindingFingerprint: billing.signature } : {};
    const writeOrder = (plan: Parameters<typeof writeAsaasCommercialOrder>[1]) => {
      writeAsaasCommercialOrder(tx, plan);
      if (billing) tx.set(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId), { billingLeadBinding: billing.binding }, { merge: true });
    };
    let order = await planAsaasCommercialOrder(tx, { tenantId: lead.tenantId, leadId: input.leadId, financeId: null, ledgerId: input.ledgerId, proof, currentStatus: lead.paymentStatus });
    if (asaasOrderCanApply(order) && isPaidFinanceStatus(lead.paymentStatus) && validId(lead.asaasPaymentOccurrenceId) && lead.asaasPaymentAuthority !== authority) order = holdAsaasCommercialOrder(order, "payment_purpose_changed");
    if (order.decision === "same_fact" && !isPaidFinanceStatus(lead.paymentStatus)) order = holdAsaasCommercialOrder(order, "local_record_diverged_from_provider_fact");
    if (!asaasOrderCanApply(order)) {
      writeOrder(order);
      return { paymentObservationId: null, financeStageTransitionId: null, tenantId: lead.tenantId, leadId: input.leadId, replayed: true, ignored: true };
    }
    if (existing) {
      if (existing.type !== ASAAS_LEAD_PAYMENT_JOB_TYPE || existing.authority !== authority || existing.tenantId !== lead.tenantId || existing.leadId !== input.leadId ||
          existing.sourceLedgerId !== input.ledgerId || existing.verifiedPaymentFingerprint !== proof.fingerprint || existing.sourceFingerprint !== signature(lead) ||
          !isPaidFinanceStatus(lead.paymentStatus) || lead.asaasPaymentOccurrenceId !== id || lead.asaasPaymentAuthority !== authority ||
          (billing ? proof.amountCents : cents(lead[existing.contractAmountField])) !== existing.expectedAmountCents) throw new FinanceMutationConflict("Recibo ou cobranca do cliente mudou; concilie antes de retomar.");
      writeOrder(order);
      return { paymentObservationId: id, financeStageTransitionId: `${id}_stage`, tenantId: lead.tenantId, leadId: input.leadId, replayed: true };
    }
    if (isPaidFinanceStatus(lead.paymentStatus)) {
      let previousId: string | null = null;
      if (validId(lead.asaasPaymentOccurrenceId)) {
        const previous = (await tx.get(adminDb.collection("jobs").doc(lead.asaasPaymentOccurrenceId))).data();
        if (!previous || previous.type !== ASAAS_LEAD_PAYMENT_JOB_TYPE || previous.tenantId !== lead.tenantId || previous.leadId !== input.leadId ||
            previous.asaasChargeId !== input.chargeId || previous.sourceLedgerId !== lead.asaasPaymentLedgerId || previous.sourceFingerprint !== signature(lead)) throw new FinanceMutationConflict("Origem do pagamento anterior mudou.");
        previousId = lead.asaasPaymentOccurrenceId;
      }
      writeOrder(order);
      tx.update(leadRef, { paymentStatus: "pago", paymentValue: proof.amountCents / 100, paymentMethod: proof.method, updatedAt: FieldValue.serverTimestamp() });
      return { paymentObservationId: previousId, financeStageTransitionId: previousId ? `${previousId}_stage` : null, tenantId: lead.tenantId, leadId: input.leadId, replayed: true };
    }
    // A platform event proves the platform's received amount. It does not
    // assert a quoted price for the shop's customer or a commercial purchase.
    const contractAmountField = billing ? "platform_event" : lead.lastChargeAmount != null ? "lastChargeAmount" : "paymentValue";
    const expectedAmountCents = billing ? proof.amountCents : cents(lead[contractAmountField]);
    if (!Number.isSafeInteger(expectedAmountCents) || expectedAmountCents < 0 || expectedAmountCents !== proof.amountCents) {
      order = holdAsaasCommercialOrder(order, "contract_amount_missing_or_diverged"); writeOrder(order);
      return { paymentObservationId: null, financeStageTransitionId: null, tenantId: lead.tenantId, leadId: input.leadId, replayed: false, ignored: true, reconciliationError: "Valor contratado ausente ou divergente na cobranca do cliente." };
    }
    const policies = await Promise.allSettled([tx.get(adminDb.collection("tenants").doc(lead.tenantId)), tx.get(adminDb.collection("tenant_entitlements").doc(lead.tenantId))]);
    for (const read of policies) if (read.status === "rejected") throw read.reason;
    const tenantRead = policies[0];
    let accessAllowed = tenantRead.status === "fulfilled" && tenantRead.value.exists && !getTenantBillingAccessDenial(tenantRead.value.data()!);
    try { await assertTenantModule(lead.tenantId, "crm"); } catch (error) { if (error instanceof TenantAccessError) accessAllowed = false; else throw error; }
    const stage = await prepareFinanceStageDecision(tx, { paidId: id, eventId, tenantId: lead.tenantId, leadId: input.leadId, lead, financeId: null,
      financeStatus: "pago", actorId: "asaas_webhook", actorName: "Asaas Webhook", accessAllowed });
    const patch = { paymentStatus: "pago", paymentMethod: proof.method, paymentValue: proof.amountCents / 100, paidAt: confirmedAt, ...stage.patch,
      asaasPaymentConfirmedAt: confirmedAt, asaasPaymentOccurrenceId: id, asaasPaymentAuthority: authority, asaasPaymentLedgerId: input.ledgerId,
      asaasPaymentPurpose: billing ? "platform_billing" : null, asaasBillingLeadBindingFingerprint: billing?.signature || null,
      asaasPaymentProofFingerprint: proof.fingerprint, ...(accessAllowed ? { status: "qualificado" } : {}), updatedAt: FieldValue.serverTimestamp() };
    writeOrder(order);
    tx.update(leadRef, { ...patch, ...asaasOrderMetadata(order) });
    if (stage.root.outcome === "applied") tx.update(leadRef, { "crmFieldOwnership.pipelineStage": { source: "system_event", locked: false, transitionId: stage.id, sourceEventId: eventId, updatedAt: FieldValue.serverTimestamp() } });
    tx.create(leadRef.collection("events").doc(eventId), { tenantId: lead.tenantId, type: "asaas_lead_payment_verified", title: "Pagamento confirmado", detail: billing ? "Evento de assinatura verificado para atualizar o contato vinculado, sem registrar compra comercial." : "Pagamento de cobranca do cliente verificado sem lancamento financeiro.",
      actorId: "asaas_webhook", actorName: "Asaas Webhook", paymentObservationId: id, sourceLedgerId: input.ledgerId, verifiedPaymentFingerprint: proof.fingerprint,
      asaasChargeId: input.chargeId, amountCents: proof.amountCents, ...purpose, ...asaasOrderMetadata(order), createdAt: FieldValue.serverTimestamp() });
    tx.create(adminDb.collection("jobs").doc(id), { tenantId: lead.tenantId, type: ASAAS_LEAD_PAYMENT_JOB_TYPE, protocolVersion: 1, authority, ...purpose, leadId: input.leadId, financeId: null,
      sourceEventId: eventId, sourceLedgerId: input.ledgerId, verifiedPaymentFingerprint: proof.fingerprint, sourceFingerprint: signature({ ...lead, ...patch }),
      asaasChargeId: input.chargeId, expectedAmountCents, contractAmountField, ...asaasOrderMetadata(order), actorId: "asaas_webhook", actorName: "Asaas Webhook", status: "done",
      completionMeaning: "verified_payment_fact_committed_no_finance_paid_automation", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(leadRef.collection("events").doc(stage.id), stage.audit);
    tx.create(adminDb.collection("jobs").doc(stage.id), { ...stage.root, source: "asaas_payment_confirmed", asaasChargeId: input.chargeId });
    return { paymentObservationId: id, financeStageTransitionId: stage.id, tenantId: lead.tenantId, leadId: input.leadId, replayed: false };
  }).then(result => {
    if ("reconciliationError" in result && result.reconciliationError) throw new FinanceMutationConflict(result.reconciliationError);
    return result;
  });
}

export async function assertAsaasLeadPaymentAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  const billing = row.authority === "asaas_billing_lead_event";
  if (row.type !== ASAAS_LEAD_PAYMENT_JOB_TYPE || row.protocolVersion !== 1 || !["asaas_lead_event", "asaas_billing_lead_event"].includes(row.authority) || billing !== (row.paymentPurpose === "platform_billing") || row.status !== "done" || row.actorId !== "asaas_webhook" ||
      ![row.tenantId, row.leadId, row.sourceLedgerId, row.asaasChargeId].every(validId) || row.financeId !== null || !["lastChargeAmount", "paymentValue", "platform_event"].includes(row.contractAmountField) || billing !== (row.contractAmountField === "platform_event") ||
      identity(row.leadId, row.sourceLedgerId).id !== id || identity(row.leadId, row.sourceLedgerId).eventId !== row.sourceEventId) throw new Error("CRM_STAGE_ASAAS_LEAD_PROTOCOL_INVALID");
  const reads = await Promise.allSettled([tx.get(adminDb.collection("leads").doc(row.leadId)), tx.get(adminDb.collection("leads").doc(row.leadId).collection("events").doc(row.sourceEventId)),
    tx.get(adminDb.collection("asaas_webhook_events_internal").doc(row.sourceLedgerId)), tx.get(adminDb.collection("tenants").doc(row.tenantId)), tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId)),
    tx.get(adminDb.collection("leads").where("asaasChargeId", "==", row.asaasChargeId).limit(2)), tx.get(adminDb.collection("financeiro").where("asaasChargeId", "==", row.asaasChargeId).limit(2))]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const [leadRead, eventRead, ledgerRead, tenantRead, , bindingsRead, invoicesRead] = reads;
  if (leadRead.status !== "fulfilled" || eventRead.status !== "fulfilled" || ledgerRead.status !== "fulfilled" || tenantRead.status !== "fulfilled" || bindingsRead.status !== "fulfilled" || invoicesRead.status !== "fulfilled") throw new Error("CRM_STAGE_ASAAS_LEAD_READ_INVALID");
  const lead = leadRead.value.data(), event = eventRead.value.data(), ledger = ledgerRead.value.data(), proof = ledger?.commercialPayment;
  if (!lead || lead.tenantId !== row.tenantId || lead.asaasChargeId !== row.asaasChargeId || !isPaidFinanceStatus(lead.paymentStatus) ||
      lead.asaasPaymentAuthority !== row.authority || lead.asaasPaymentOccurrenceId !== id || lead.asaasPaymentLedgerId !== row.sourceLedgerId || lead.asaasPaymentProofFingerprint !== row.verifiedPaymentFingerprint ||
      signature(lead) !== row.sourceFingerprint || (billing ? proof?.amountCents : cents(lead[row.contractAmountField])) !== row.expectedAmountCents || bindingsRead.value.size !== 1 || bindingsRead.value.docs[0].id !== row.leadId || !billing && !invoicesRead.value.empty ||
      !event || event.tenantId !== row.tenantId || event.type !== "asaas_lead_payment_verified" || event.paymentObservationId !== id || event.actorId !== row.actorId ||
      event.sourceLedgerId !== row.sourceLedgerId || event.verifiedPaymentFingerprint !== row.verifiedPaymentFingerprint || event.asaasChargeId !== row.asaasChargeId || !event.createdAt?.isEqual?.(row.createdAt) ||
      !ledger || ledger.chargeId !== row.asaasChargeId || !(billing ? isVerifiedAsaasBillingProof(proof, row.asaasChargeId) : isVerifiedAsaasPaidProof(proof, row.asaasChargeId)) || proof.event !== ledger.event || proof.fingerprint !== row.verifiedPaymentFingerprint || proof.amountCents !== row.expectedAmountCents ||
      !tenantRead.value.exists || getTenantBillingAccessDenial(tenantRead.value.data()!)) throw new Error("CRM_STAGE_ASAAS_LEAD_AUTHORITY_REVOKED");
  if (["processing", "failed"].includes(ledger.status)) throw new Error("ASAAS_COMMERCIAL_EVENT_PENDING");
  if (ledger.status !== "completed") throw new Error("CRM_STAGE_ASAAS_LEAD_EVENT_REVOKED");
  if ((lead.asaasPaymentPurpose || null) !== (row.paymentPurpose || null) || (event.paymentPurpose || null) !== (row.paymentPurpose || null)) throw new Error("CRM_STAGE_ASAAS_LEAD_PURPOSE_CHANGED");
  if (billing) {
    const binding = ledger.billingLeadBinding;
    if (!binding || binding.tenantId !== row.tenantId || binding.leadId !== row.leadId || leadBindingFingerprint(binding) !== row.billingLeadBindingFingerprint ||
        lead.asaasBillingLeadBindingFingerprint !== row.billingLeadBindingFingerprint || event.billingLeadBindingFingerprint !== row.billingLeadBindingFingerprint) throw new Error("CRM_STAGE_ASAAS_LEAD_BILLING_PROOF_CHANGED");
    await prepareAsaasLeadBillingBinding(tx, ledger, lead, row.leadId, { platformTenantId: binding.tenantId, subscriptionId: binding.subscriptionId || undefined }, invoicesRead.value);
  } else if (ledger.billingLeadBinding || row.billingLeadBindingFingerprint || lead.asaasBillingLeadBindingFingerprint || event.billingLeadBindingFingerprint) throw new Error("CRM_STAGE_ASAAS_LEAD_BILLING_DOWNGRADE");
  await assertAsaasCommercialOrder(tx, row, `leads/${row.leadId}`);
  try { await assertTenantModule(row.tenantId, "crm"); } catch (error) { if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_ASAAS_LEAD_MODULE_REVOKED"); throw error; }
}

