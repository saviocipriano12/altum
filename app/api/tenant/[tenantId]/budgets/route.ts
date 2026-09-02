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

    const items: BudgetItem[] = snap.docs
      .map((doc): BudgetItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => toTime(b.updatedAt || b.createdAt) - toTime(a.updatedAt || a.createdAt));

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
    if (!leadId || !titulo) {
      return NextResponse.json({ error: "Campos obrigatorios: leadId e titulo." }, { status: 400 });
    }

    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }
    const lead = leadSnap.data() as Record<string, unknown>;
    if (String(lead.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Lead fora do tenant informado." }, { status: 403 });
    }

    const settings = await getTenantSettings(tenantId);
    const status = BUDGET_STATUSES.has(clean(body.status, 40)) ? clean(body.status, 40) : "Rascunho";
    const valorTotal = cleanMoney(body.valorTotal);
    const tenantName = clean(settings?.name, 180) || "Cliente";
    const currentStage = clean(lead.pipelineStage || lead.stage, 60) || "captado";

    const ref = await adminDb.collection("orcamentos").add({
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
    });

    await Promise.all([
      leadSnap.ref.collection("events").add({
        type: "budget_created",
        title: "Proposta criada",
        detail: `${titulo} criada no modulo comercial.`,
        budgetId: ref.id,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
      leadSnap.ref.set(
        {
          pipelineStage: status === "Enviado" ? "proposta" : currentStage,
          stage: status === "Enviado" ? "proposta" : currentStage,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
    ]);

    await trackProposalOutcome({
      tenantId,
      leadId,
      budgetId: ref.id,
      status,
    });

    if (status === "Enviado" && currentStage !== "proposta") {
      await trackLeadStageOutcome({
        tenantId,
        leadId,
        previousStage: currentStage,
        nextStage: "proposta",
      });
    }

    return NextResponse.json({ ok: true, tenantId, id: ref.id });
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

