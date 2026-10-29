import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { FinanceMutationConflict, isPaidFinanceStatus } from "@/lib/server/crm/finance-paid-occurrence";
import { isVerifiedAsaasCommercialProof } from "@/lib/server/crm/asaas-finance-occurrence";
import { isVerifiedAsaasBillingProof } from "@/lib/server/crm/asaas-commercial-proof";
import { prepareAsaasBillingBinding, prepareAsaasLeadBillingBinding, type AsaasBillingContext } from "@/lib/server/crm/asaas-billing-authority";
import { asaasCommercialEventState, planAsaasCommercialOrder, writeAsaasCommercialOrder, asaasOrderCanApply, holdAsaasCommercialOrder, asaasOrderMetadata } from "@/lib/server/crm/asaas-commercial-order";
function validId(value: unknown): value is string { return typeof value === "string" && Boolean(value) && value === value.trim() && value.length <= 500 && !value.includes("/"); }

/** Record pending/overdue/reversal facts without invoking payments, refunds,
 * stage changes or marketing. Ordering and both linked records share a commit. */
export async function commitAsaasCommercialState(input: { financeId?: string; leadId?: string; ledgerId: string; chargeId: string; billing?: AsaasBillingContext; linkLeadId?: string }) {
  const financeId = input.financeId || null;
  if (![financeId || input.leadId, input.ledgerId, input.chargeId].every(validId)) throw new FinanceMutationConflict("Origem de estado comercial invalida.");
  const ref = adminDb.collection(financeId ? "financeiro" : "leads").doc(financeId || input.leadId!);
  return adminDb.runTransaction(async tx => {
    const reads = await Promise.allSettled([tx.get(ref), tx.get(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId)),
      tx.get(adminDb.collection("financeiro").where("asaasChargeId", "==", input.chargeId).limit(2)), tx.get(adminDb.collection("leads").where("asaasChargeId", "==", input.chargeId).limit(2))]);
    for (const read of reads) if (read.status === "rejected") throw read.reason;
    const [recordRead, ledgerRead, invoicesRead, bindingsRead] = reads;
    if (recordRead.status !== "fulfilled" || ledgerRead.status !== "fulfilled" || invoicesRead.status !== "fulfilled" || bindingsRead.status !== "fulfilled") throw new FinanceMutationConflict("Leitura de estado comercial incompleta.");
    const stored = recordRead.value.data(), linking = Boolean(financeId && input.linkLeadId && !stored?.leadId);
    if (input.linkLeadId && (!financeId || !validId(input.linkLeadId) || stored?.leadId && stored.leadId !== input.linkLeadId || bindingsRead.value.size !== 1 || bindingsRead.value.docs[0].id !== input.linkLeadId)) throw new FinanceMutationConflict("Estado da cobranca exige cliente unico.");
    const current: FirebaseFirestore.DocumentData | undefined = stored && { ...stored, ...(linking ? { leadId: input.linkLeadId } : {}) };
    const ledger = ledgerRead.value.data(), proof = ledger?.commercialPayment;
    const leadId = financeId ? current?.leadId : input.leadId;
    if (!current || !input.billing && current.contractAutoBilling === true || !validId(current.tenantId) || !validId(leadId) || current.asaasChargeId !== input.chargeId ||
        !ledger || !["processing", "completed"].includes(ledger.status) || ledger.chargeId !== input.chargeId || !(input.billing ? isVerifiedAsaasBillingProof(proof, input.chargeId, false) : isVerifiedAsaasCommercialProof(proof, input.chargeId)) || proof.event !== ledger.event ||
        (financeId ? invoicesRead.value.size !== 1 || invoicesRead.value.docs[0].id !== financeId : !input.billing && !invoicesRead.value.empty) ||
        bindingsRead.value.docs.some(doc => doc.id !== leadId) || !financeId && bindingsRead.value.size !== 1) throw new FinanceMutationConflict("Estado comercial sem vinculo unico e verificado.");
    const billing = input.billing && financeId ? await prepareAsaasBillingBinding(tx, ledger, current, financeId, input.billing) : null;
    const leadBilling = input.billing && !financeId ? await prepareAsaasLeadBillingBinding(tx, ledger, current, leadId, input.billing, invoicesRead.value) : null;
    const writeOrder = (plan: Parameters<typeof writeAsaasCommercialOrder>[1]) => {
      writeAsaasCommercialOrder(tx, plan);
      if (billing) tx.set(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId), { billingBinding: billing.binding }, { merge: true });
      if (leadBilling) tx.set(adminDb.collection("asaas_webhook_events_internal").doc(input.ledgerId), { billingLeadBinding: leadBilling.binding }, { merge: true });
    };
    const state = asaasCommercialEventState(proof.event);
    if (!state || state === "pago") throw new FinanceMutationConflict("Confirmacao exige o contrato de pagamento completo.");
    const leadRef = adminDb.collection("leads").doc(leadId), lead = financeId ? (await tx.get(leadRef)).data() : current;
    if (!lead || lead.tenantId !== current.tenantId) throw new FinanceMutationConflict("Cliente fora da empresa do estado comercial.");
    const currentStatus = financeId ? current.status : current.paymentStatus;
    let order = await planAsaasCommercialOrder(tx, { tenantId: current.tenantId, leadId, financeId, ledgerId: input.ledgerId, proof, currentStatus });
    const normalizedCurrent = isPaidFinanceStatus(currentStatus) ? "pago" : String(currentStatus || "").trim().toLowerCase();
    if (order.decision === "same_fact" && normalizedCurrent !== state) order = holdAsaasCommercialOrder(order, "local_record_diverged_from_provider_fact");
    if (!asaasOrderCanApply(order)) { writeOrder(order); return { tenantId: current.tenantId, leadId, ignored: true }; }
    if (current.asaasCommercialStateLedgerId === input.ledgerId && normalizedCurrent === state) {
      writeOrder(order); return { tenantId: current.tenantId, leadId, ignored: false, replayed: true };
    }
    const eventId = `asaas_state_${createHash("sha256").update(JSON.stringify([ref.path, input.ledgerId])).digest("hex")}`;
    const metadata = { ...asaasOrderMetadata(order), asaasCommercialStateLedgerId: input.ledgerId, updatedAt: FieldValue.serverTimestamp() };
    const leadPatch = { ...metadata, paymentStatus: state,
      ...(state === "cancelado" ? { paymentCanceledAt: FieldValue.serverTimestamp() } : state === "atrasado" ? { paymentOverdueAt: FieldValue.serverTimestamp() } : {}) };
    writeOrder(order);
    if (financeId) tx.update(ref, { ...metadata, ...(linking ? { leadId, paidWorkflow: "stage_only" } : {}), status: state, asaasEvent: proof.event, asaasStatus: proof.providerStatus || null });
    tx.update(leadRef, leadPatch);
    tx.create(leadRef.collection("events").doc(eventId), { tenantId: current.tenantId, type: "asaas_commercial_state_verified", title: state === "cancelado" ? "Cobranca cancelada" : state === "atrasado" ? "Pagamento em atraso" : "Cobranca pendente",
      detail: "Estado comercial registrado por evento Asaas autenticado e ordenado.", financeId, asaasChargeId: input.chargeId, sourceLedgerId: input.ledgerId,
      providerEvent: proof.event, paymentStatus: state, actorId: "asaas_webhook", actorName: "Asaas Webhook", ...asaasOrderMetadata(order), createdAt: FieldValue.serverTimestamp() });
    return { tenantId: current.tenantId, leadId, ignored: false, replayed: false };
  });
}

