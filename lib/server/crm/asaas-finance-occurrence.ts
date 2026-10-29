import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { FINANCE_PAID_JOB_TYPE, BILLING_PAID_JOB_TYPE, FinanceMutationConflict, financeSnapshotSignature, isPaidFinanceStatus } from "@/lib/server/crm/finance-paid-occurrence";
import { prepareFinanceStageDecision } from "@/lib/server/crm/finance-stage-transition";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { TenantAccessError } from "@/lib/server/tenant";
import { getTenantBillingAccessDenial } from "@/lib/tenant-billing-access";
import { isVerifiedAsaasPaidProof, isVerifiedAsaasBillingProof } from "@/lib/server/crm/asaas-commercial-proof";
import { prepareAsaasBillingBinding, assertAsaasBillingBinding, type AsaasBillingContext } from "@/lib/server/crm/asaas-billing-authority";
export { asaasWebhookAuthorityFingerprint, asaasCommercialPaymentProof, isVerifiedAsaasPaidProof, isVerifiedAsaasCommercialProof } from "@/lib/server/crm/asaas-commercial-proof";
import { planAsaasCommercialOrder, writeAsaasCommercialOrder, asaasOrderCanApply, asaasOrderMetadata, holdAsaasCommercialOrder, assertAsaasCommercialOrder } from "@/lib/server/crm/asaas-commercial-order";

function validId(value: unknown): value is string { return typeof value === "string" && Boolean(value) && value === value.trim() && value.length <= 500 && !value.includes("/"); }
export async function commitAsaasFinanceMutation(input: { financeId: string; ledgerId: string; chargeId: string; patch: FirebaseFirestore.DocumentData; billing?: AsaasBillingContext; linkLeadId?: string }) {
  if (![input.financeId, input.ledgerId, input.chargeId].every(validId)) throw new FinanceMutationConflict("Origem Asaas invalida.");
  const key = createHash("sha256").update(JSON.stringify([input.financeId, input.ledgerId])).digest("hex");
  const eventId = `${input.billing ? "asaas_billing_paid" : "asaas_paid"}_${key}`, id = `crm_finance_paid_${eventId}`, ref = adminDb.collection("financeiro").doc(input.financeId);
  const jobType = input.billing ? BILLING_PAID_JOB_TYPE : FINANCE_PAID_JOB_TYPE;
  const confirmedAt = Timestamp.now();
  return adminDb.runTransaction(async tx => {
    const reads = await Promise.allSettled([tx.get(ref), tx.get(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId)), tx.get(adminDb.collection("jobs").doc(id)),
      tx.get(adminDb.collection("financeiro").where("asaasChargeId", "==", input.chargeId).limit(2)),
      tx.get(adminDb.collection("leads").where("asaasChargeId", "==", input.chargeId).limit(2))]);
    for (const read of reads) if (read.status === "rejected") throw read.reason;
    const [financeRead, ledgerRead, existingRead, bindingsRead, leadBindingsRead] = reads;
    if (financeRead.status !== "fulfilled" || ledgerRead.status !== "fulfilled" || existingRead.status !== "fulfilled" || bindingsRead.status !== "fulfilled" || leadBindingsRead.status !== "fulfilled") throw new FinanceMutationConflict("Leitura Asaas incompleta.");
    const stored = financeRead.value.data(), linking = Boolean(input.linkLeadId && !stored?.leadId);
    if (input.linkLeadId && (!validId(input.linkLeadId) || stored?.leadId && stored.leadId !== input.linkLeadId || leadBindingsRead.value.size !== 1 || leadBindingsRead.value.docs[0].id !== input.linkLeadId)) throw new FinanceMutationConflict("Associacao da cobranca exige um unico cliente.");
    const current: FirebaseFirestore.DocumentData | undefined = stored && { ...stored, ...(linking ? { leadId: input.linkLeadId } : {}) };
    const ledger = ledgerRead.value.data(), proof = ledger?.commercialPayment;
    const stageOnly = linking || current?.paidWorkflow === "stage_only";
    if (!current || !input.billing && current.contractAutoBilling === true || current.asaasChargeId !== input.chargeId || !validId(current.tenantId) || !validId(current.leadId) || bindingsRead.value.size !== 1 ||
        bindingsRead.value.docs[0].id !== input.financeId || leadBindingsRead.value.docs.some(doc => doc.id !== current.leadId) || !ledger || !["processing", "completed"].includes(ledger.status) || ledger.chargeId !== input.chargeId ||
        !(input.billing ? isVerifiedAsaasBillingProof(proof, input.chargeId) : isVerifiedAsaasPaidProof(proof, input.chargeId)) || proof.event !== ledger.event) throw new FinanceMutationConflict("Pagamento ou vinculo comercial Asaas divergente.");
    const billing = input.billing ? await prepareAsaasBillingBinding(tx, ledger, current, input.financeId, input.billing) : null;
    if (!billing && ledger.billingBinding) throw new FinanceMutationConflict("Origem de assinatura nao e pagamento comercial.");
    const writeOrder = (plan: Parameters<typeof writeAsaasCommercialOrder>[1]) => {
      writeAsaasCommercialOrder(tx, plan);
      if (billing) tx.set(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId), { billingBinding: billing.binding }, { merge: true });
    };
    const leadRef = adminDb.collection("leads").doc(current.leadId), lead = (await tx.get(leadRef)).data();
    if (!lead || lead.tenantId !== current.tenantId) throw new FinanceMutationConflict("Cliente do pagamento fora da empresa.");
    let order = await planAsaasCommercialOrder(tx, { tenantId: current.tenantId, leadId: current.leadId, financeId: input.financeId, ledgerId: input.ledgerId, proof, currentStatus: current.status });
    if (linking && isPaidFinanceStatus(current.status)) order = holdAsaasCommercialOrder(order, "legacy_invoice_binding_requires_review");
    if (asaasOrderCanApply(order) && isPaidFinanceStatus(current.status) && current.paidAuthority === "asaas_event" && validId(current.paidOccurrenceId) &&
        (current.paymentPurpose === "platform_billing") !== Boolean(input.billing)) order = holdAsaasCommercialOrder(order, "payment_purpose_changed");
    if (order.decision === "same_fact" && !isPaidFinanceStatus(current.status)) order = holdAsaasCommercialOrder(order, "local_record_diverged_from_provider_fact");
    if (!asaasOrderCanApply(order)) {
      writeOrder(order);
      return { financePaidOccurrenceId: null, financeStageTransitionId: null, tenantId: current.tenantId, leadId: current.leadId, replayed: true, ignored: true };
    }
    if (Math.round(Number(current.valor) * 100) !== proof.amountCents) {
      order = holdAsaasCommercialOrder(order, "contract_amount_diverged"); writeOrder(order);
      return { financePaidOccurrenceId: null, financeStageTransitionId: null, tenantId: current.tenantId, leadId: current.leadId, replayed: false, ignored: true, reconciliationError: "Valor contratado e pagamento Asaas divergem." };
    }
    const existing = existingRead.value.data();
    if (existing) {
      if (existing.type !== jobType || existing.authority !== "asaas_event" || existing.tenantId !== current.tenantId || existing.financeId !== input.financeId ||
          existing.leadId !== current.leadId || existing.sourceLedgerId !== input.ledgerId || existing.verifiedPaymentFingerprint !== proof.fingerprint ||
          !isPaidFinanceStatus(current.status) || current.paidOccurrenceId !== id || existing.sourceFingerprint !== financeSnapshotSignature(current)) throw new FinanceMutationConflict("Recibo Asaas ou lancamento alterado; concilie antes de retomar.");
      writeOrder(order);
      return { financePaidOccurrenceId: id, financeStageTransitionId: `${id}_stage`, tenantId: current.tenantId, leadId: current.leadId, replayed: true };
    }
    const patch: FirebaseFirestore.DocumentData = { ...input.patch, meioPagamento: proof.method, ...(linking ? { leadId: current.leadId, paidWorkflow: "stage_only" } : {}) };
    if (isPaidFinanceStatus(current.status)) {
      // A second provider confirmation is not a second payment. Preserve the
      // first receipt/date; historical paid rows without receipts stay historical.
      delete patch.dataPagamento; delete patch.paymentConfirmedAt;
      writeOrder(order);
      tx.update(ref, patch);
      tx.update(leadRef, { paymentStatus: "pago", paymentMethod: proof.method, paymentValue: proof.amountCents / 100, updatedAt: FieldValue.serverTimestamp() });
      const existingPaidId = current.paidAuthority === "asaas_event" && validId(current.paidOccurrenceId) ? current.paidOccurrenceId : null;
      return { financePaidOccurrenceId: existingPaidId, financeStageTransitionId: existingPaidId ? `${existingPaidId}_stage` : null, tenantId: current.tenantId, leadId: current.leadId, replayed: true };
    }
    Object.assign(patch, { dataPagamento: confirmedAt, paymentConfirmedAt: confirmedAt });
    const after = { ...current, ...patch }, authority = { paymentAuthority: "asaas_event", sourceLedgerId: input.ledgerId, verifiedPaymentFingerprint: proof.fingerprint, asaasChargeId: input.chargeId, ...asaasOrderMetadata(order),
      ...(billing ? { paymentPurpose: "platform_billing", billingBindingFingerprint: billing.signature } : {}), ...(stageOnly ? { paymentWorkflow: "stage_only" } : {}) };
    const policyReads = await Promise.allSettled([tx.get(adminDb.collection("tenants").doc(current.tenantId)), tx.get(adminDb.collection("tenant_entitlements").doc(current.tenantId))]);
    for (const read of policyReads) if (read.status === "rejected") throw read.reason;
    const tenantRead = policyReads[0];
    let accessAllowed = tenantRead.status === "fulfilled" && tenantRead.value.exists && !getTenantBillingAccessDenial(tenantRead.value.data()!);
    try { await assertTenantModule(current.tenantId, "crm"); }
    catch (error) { if (error instanceof TenantAccessError) accessAllowed = false; else throw error; }
    const stage = await prepareFinanceStageDecision(tx, { paidId: id, eventId, tenantId: current.tenantId, leadId: current.leadId, lead,
      financeId: input.financeId, financeStatus: after.status, actorId: "asaas_webhook", actorName: "Asaas Webhook", accessAllowed });
    writeOrder(order);
    tx.update(ref, { ...patch, ...authority, paidOccurrenceId: id, paidAuthority: "asaas_event" });
    tx.update(leadRef, { paymentStatus: "pago", paymentMethod: proof.method, paymentValue: proof.amountCents / 100, paidAt: confirmedAt,
      ...(accessAllowed ? { status: "qualificado" } : {}), updatedAt: FieldValue.serverTimestamp() });
    tx.create(leadRef.collection("events").doc(eventId), { tenantId: current.tenantId, type: "finance_updated", title: "Pagamento confirmado", detail: "Pagamento comercial confirmado por evento Asaas verificado.",
      ...authority, financeId: input.financeId, actorId: "asaas_webhook", actorName: "Asaas Webhook", previousFinanceStatus: current.status || null,
      financeStatus: after.status, financeValue: after.valor ?? null, financeFingerprint: financeSnapshotSignature(after), financePaidOccurrenceId: id, createdAt: FieldValue.serverTimestamp() });
    tx.create(adminDb.collection("jobs").doc(id), { tenantId: current.tenantId, type: jobType, protocolVersion: 1, financeId: input.financeId, leadId: current.leadId,
      sourceEventId: eventId, sourceFingerprint: financeSnapshotSignature(after), actorId: "asaas_webhook", actorName: "Asaas Webhook", authority: "asaas_event", ...authority,
      status: stageOnly ? "done" : "ready", attempts: 0, completionMeaning: stageOnly ? "payment_and_customer_binding_committed_stage_only_no_finance_paid" : "verified_payment_and_stage_committed_ledger_completion_pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (Object.keys(stage.patch).length) tx.update(leadRef, stage.patch);
    if (stage.root.outcome === "applied") tx.update(leadRef, { "crmFieldOwnership.pipelineStage": { source: "system_event", locked: false, transitionId: stage.id, sourceEventId: eventId, updatedAt: FieldValue.serverTimestamp() } });
    tx.create(leadRef.collection("events").doc(stage.id), stage.audit); tx.create(adminDb.collection("jobs").doc(stage.id), stage.root);
    return { financePaidOccurrenceId: id, financeStageTransitionId: stage.id, tenantId: current.tenantId, leadId: current.leadId, replayed: false };
  }).then(result => {
    if ("reconciliationError" in result && result.reconciliationError) throw new FinanceMutationConflict(result.reconciliationError);
    return result;
  });
}

export async function assertAsaasFinanceAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, finance: FirebaseFirestore.DocumentData) {
  if (row.authority !== "asaas_event" || row.actorId !== "asaas_webhook" || !validId(row.sourceLedgerId) || !validId(row.asaasChargeId) ||
      finance.asaasChargeId !== row.asaasChargeId || finance.sourceLedgerId !== row.sourceLedgerId || finance.verifiedPaymentFingerprint !== row.verifiedPaymentFingerprint) throw new Error("CRM_STAGE_ASAAS_SCOPE_REVOKED");
  const reads = await Promise.allSettled([tx.get(adminDb.collection("asaas_webhook_events_internal").doc(row.sourceLedgerId)), tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId)),
    tx.get(adminDb.collection("tenants").doc(row.tenantId)), tx.get(adminDb.collection("financeiro").where("asaasChargeId", "==", row.asaasChargeId).limit(2)),
    tx.get(adminDb.collection("leads").where("asaasChargeId", "==", row.asaasChargeId).limit(2))]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const [ledgerRead, , tenantRead, bindingsRead, leadBindingsRead] = reads;
  if (ledgerRead.status !== "fulfilled" || tenantRead.status !== "fulfilled" || bindingsRead.status !== "fulfilled" || leadBindingsRead.status !== "fulfilled") throw new Error("CRM_STAGE_ASAAS_READ_INVALID");
  const ledger = ledgerRead.value.data(), proof = ledger?.commercialPayment;
  const billing = row.type === BILLING_PAID_JOB_TYPE;
  if (!ledger || ledger.chargeId !== row.asaasChargeId || !(billing ? isVerifiedAsaasBillingProof(proof, row.asaasChargeId) : isVerifiedAsaasPaidProof(proof, row.asaasChargeId)) || proof.event !== ledger.event || proof.fingerprint !== row.verifiedPaymentFingerprint ||
      Math.round(Number(finance.valor) * 100) !== proof.amountCents || bindingsRead.value.size !== 1 || bindingsRead.value.docs[0].id !== row.financeId || leadBindingsRead.value.docs.some(doc => doc.id !== row.leadId) ||
      !tenantRead.value.exists || getTenantBillingAccessDenial(tenantRead.value.data()!)) throw new Error("CRM_STAGE_ASAAS_AUTHORITY_REVOKED");
  if (["processing", "failed"].includes(ledger.status)) throw new Error("ASAAS_COMMERCIAL_EVENT_PENDING");
  if (ledger.status !== "completed") throw new Error("CRM_STAGE_ASAAS_EVENT_REVOKED");
  if (billing) await assertAsaasBillingBinding(tx, ledger, row, finance);
  else if (ledger.billingBinding || finance.contractAutoBilling === true) throw new Error("CRM_STAGE_ASAAS_BILLING_KIND_CHANGED");
  await assertAsaasCommercialOrder(tx, row, `financeiro/${row.financeId}`);
  try { await assertTenantModule(row.tenantId, "crm"); }
  catch (error) { if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_ASAAS_MODULE_REVOKED"); throw error; }
}

