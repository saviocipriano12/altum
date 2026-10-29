import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  TenantAccessError,
  getTenantSettings,
} from "@/lib/server/tenant";
import { trackLeadStageOutcome, trackProposalOutcome } from "@/lib/server/ai/learning-outcomes";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess, canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { createHash } from "node:crypto";

type Body = {
  leadId?: string;
  titulo?: string;
  tipo?: string;
  status?: string;
  valorTotal?: number | string | null;
  validade?: string | null;
  resumo?: string | null;
};

const BUDGET_STATUSES = new Set(["Rascunho", "Enviado", "Aprovado", "Perdido"]);
type BudgetItem = {
  id: string;
  updatedAt?: unknown;
  createdAt?: unknown;
  [key: string]: unknown;
};
type ProposalTransition = { protocol: number; outcome: string; previousStage: string | null; nextStage: string | null; requestedStage: string | null; pipelineVersion: string | null };

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb
      .collection("orcamentos")
      .where("tenantId", "==", tenantId)
      .limit(200)
      .get();

    const allItems: BudgetItem[] = snap.docs
      .map((doc): BudgetItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => toTime(b.updatedAt || b.createdAt) - toTime(a.updatedAt || a.createdAt));
    let items = allItems;
    if (!hasTeamWideCommercialAccess(membership)) {
      const leadsSnap = await adminDb.collection("leads").where("tenantId", "==", tenantId).limit(1000).get();
      const visibleLeadIds = new Set(leadsSnap.docs.filter((doc) => canAccessAssignedCommercialRecord(membership, user.uid, doc.data() as Record<string, unknown>)).map((doc) => doc.id));
      items = allItems.filter((item) => visibleLeadIds.has(clean(item.leadId, 160)));
    }

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar orcamentos do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar propostas." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "manage_commercial");

    const body = (await req.json()) as Body;
    const leadId = clean(body.leadId, 160);
    const titulo = clean(body.titulo, 180);
    if (!leadId || leadId !== body.leadId || leadId.includes("/") || !titulo) {
      return NextResponse.json({ error: "Campos obrigatorios: leadId e titulo." }, { status: 400 });
    }
    const settings = await getTenantSettings(tenantId);
    const status = BUDGET_STATUSES.has(clean(body.status, 40)) ? clean(body.status, 40) : "Rascunho";
    const valorTotal = cleanMoney(body.valorTotal);
    const tenantName = clean(settings?.name, 180) || "Cliente";
    const requestId = req.headers.get("Idempotency-Key");
    if (requestId !== null && !/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) return NextResponse.json({ error: "Identificador de criacao invalido.", code: "INVALID_CREATION_REQUEST" }, { status: 400 });
    const key = requestId ? createHash("sha256").update(JSON.stringify([tenantId, user.uid, requestId])).digest("hex") : null;
    const receiptRef = key ? adminDb.collection("jobs").doc(`proposal_create_${key}`) : null;
    const ref = key ? adminDb.collection("orcamentos").doc(`proposal_${key}`) : adminDb.collection("orcamentos").doc();
    const fingerprint = createHash("sha256").update(JSON.stringify([leadId, titulo, clean(body.tipo, 60) || "Projeto unico", status,
      valorTotal, clean(body.validade, 40) || null, clean(body.resumo, 4000) || null])).digest("hex");
    const leadRef = adminDb.collection("leads").doc(leadId);
    const result = await adminDb.runTransaction<{ crmTransition: ProposalTransition; replayed: boolean; conflict: boolean }>(async transaction => {
      const leadSnap = await transaction.get(leadRef), lead = leadSnap.data();
      if (!lead) throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
      if (lead.tenantId !== tenantId) throw new RouteAuthError(403, "lead_company_mismatch", "Lead fora do tenant informado.");
      assertAssignedCommercialRecordAccess(membership, user.uid, lead);
      if (receiptRef) {
        const receipt = (await transaction.get(receiptRef)).data();
        if (receipt) {
          if (receipt.type !== "crm_proposal_create_receipt" || receipt.protocolVersion !== 1 || receipt.status !== "done" ||
              receipt.completionMeaning !== "internal_records_committed_no_external_delivery" || typeof receipt.fingerprint !== "string" || receipt.tenantId !== tenantId ||
              receipt.actorId !== user.uid || receipt.proposalId !== ref.id || !receipt.crmTransition || receipt.crmTransition.protocol !== 1) {
            throw new RouteAuthError(409, "CREATION_RECEIPT_CONFLICT", "Comprovante de criacao divergente; solicite revisao.");
          }
          const existing = (await transaction.get(ref)).data();
          if (!existing || existing.tenantId !== tenantId || existing.leadId !== receipt.leadId) throw new RouteAuthError(409, "CREATION_TARGET_UNAVAILABLE", "Proposta anterior indisponivel; nao sera recriada automaticamente.");
          const originalLead = receipt.leadId === leadId ? lead : (await transaction.get(adminDb.collection("leads").doc(receipt.leadId))).data();
          if (!originalLead || originalLead.tenantId !== tenantId) throw new RouteAuthError(403, "creation_target_forbidden", "Sem acesso ao cliente da proposta anterior.");
          assertAssignedCommercialRecordAccess(membership, user.uid, originalLead);
          return { crmTransition: receipt.crmTransition as ProposalTransition, replayed: true, conflict: receipt.fingerprint !== fingerprint };
        }
      }
      const previousStage = clean(lead.pipelineStage || lead.stage, 60) || null;
      let pipelineVersion: string | null = null, knownTarget = false;
      if (status === "Enviado") {
        try {
          const pipeline = await loadTenantPipelineInTransaction(transaction, tenantId);
          pipelineVersion = pipeline.version; knownTarget = pipeline.stages.some(stage => stage.id === "proposta");
        } catch { /* An invalid/ambiguous funnel never authorizes a fallback stage. */ }
      }
      const outcome = status !== "Enviado" ? "not_requested"
        : isCrmFieldManuallyOwned(lead, "pipelineStage") ? "blocked_manual"
        : !knownTarget ? "blocked_pipeline" : previousStage === "proposta" ? "unchanged" : "applied";
      const transition = { protocol: 1, outcome, previousStage, nextStage: outcome === "applied" ? "proposta" : previousStage,
        requestedStage: status === "Enviado" ? "proposta" : null, pipelineVersion };
      transaction.create(ref, {
        tenantId,
        clientId: tenantId,
        clientName: tenantName,
        leadId,
        leadName: clean(lead.nome, 180) || "Lead",
        leadCompany: clean(lead.empresa, 180),
        titulo,
        tipo: clean(body.tipo, 60) || "Projeto unico",
        status,
        valorTotal,
        validade: clean(body.validade, 40) || null,
        resumo: clean(body.resumo, 4000) || null,
        ownerId: clean(lead.ownerId, 140) || user.uid,
        owner: clean(lead.owner, 180) || user.name,
        createdBy: user.uid,
        createdByName: user.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        crmTransition: transition,
      });
      transaction.create(leadRef.collection("events").doc(`budget_created_${ref.id}`), {
        tenantId,
        type: "budget_created",
        title: "Proposta criada",
        detail: `${titulo} criada no modulo comercial.`,
        budgetId: ref.id,
        actorId: user.uid,
        actorName: user.name,
        crmTransition: transition,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (outcome === "applied") transaction.update(leadRef, {
        pipelineStage: "proposta", stage: "proposta", stageUpdatedAt: FieldValue.serverTimestamp(),
        "crmFieldOwnership.pipelineStage": { source: "system_event", locked: false, budgetId: ref.id,
          actorId: user.uid, updatedAt: FieldValue.serverTimestamp() },
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (receiptRef) transaction.create(receiptRef, { type: "crm_proposal_create_receipt", protocolVersion: 1, status: "done",
        tenantId, actorId: user.uid, leadId, proposalId: ref.id, fingerprint, crmTransition: transition,
        completionMeaning: "internal_records_committed_no_external_delivery", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { crmTransition: transition, replayed: false, conflict: false };
    });
    const { crmTransition, replayed } = result;
    if (result.conflict) return NextResponse.json({ error: "Esta tentativa ja criou uma proposta com outros dados. Confira a proposta existente antes de criar outra.", code: "CREATION_REQUEST_CONFLICT", existingProposalId: ref.id }, { status: 409 });

    if (!replayed) await trackProposalOutcome({
      tenantId,
      leadId,
      budgetId: ref.id,
      status,
    }).catch(error => console.error("Proposta gravada; falha no registro auxiliar de aprendizado:", error));

    if (!replayed && crmTransition.outcome === "applied") {
      await trackLeadStageOutcome({
        tenantId,
        leadId,
        previousStage: crmTransition.previousStage,
        nextStage: "proposta",
      }).catch(error => console.error("Etapa gravada; falha no registro auxiliar de aprendizado:", error));
    }

    return NextResponse.json({ ok: true, tenantId, id: ref.id, crmTransition, replayed, retryProtected: Boolean(requestId) });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar proposta do tenant:", error);
    return NextResponse.json({ error: "Falha ao criar proposta." }, { status: 500 });
  }
}

