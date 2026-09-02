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
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
type FinanceItem = {
  id: string;
  updatedAt?: unknown;
  createdAt?: unknown;
  [key: string]: unknown;
};

type Body = {
  leadId?: string | null;
  descricao?: string;
  valor?: number | string | null;
  tipo?: "Receita" | "Despesa";
  categoria?: string;
  status?: string;
  vencimento?: string | null;
  dataPagamento?: string | null;
  meioPagamento?: string | null;
  orcamentoId?: string | null;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function money(value: unknown) {
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
      .collection("financeiro")
      .where("tenantId", "==", tenantId)
      .limit(240)
      .get();

    const items: FinanceItem[] = snap.docs
      .map((doc): FinanceItem => ({
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
    console.error("Erro ao listar financeiro do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar financeiro." }, { status: 500 });
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
    const descricao = clean(body.descricao, 180);
    const valor = money(body.valor);
    if (!descricao || !valor) {
      return NextResponse.json({ error: "Campos obrigatorios: descricao e valor." }, { status: 400 });
    }

    const leadId = clean(body.leadId, 160);
    let lead: Record<string, unknown> | null = null;
    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (leadSnap.exists && String((leadSnap.data() as Record<string, unknown>).tenantId || "") === tenantId) {
        lead = leadSnap.data() as Record<string, unknown>;
      }
    }

    const settings = await getTenantSettings(tenantId);
    const tipo = body.tipo === "Despesa" ? "Despesa" : "Receita";
    const ref = await adminDb.collection("financeiro").add({
      tenantId,
      clientId: tenantId,
      clientName: clean(settings?.name, 180) || "Cliente",
      leadId: leadId || null,
      leadName: clean(lead?.nome, 180) || null,
      ownerId: clean(lead?.ownerId, 140) || user.uid,
      owner: clean(lead?.owner, 180) || user.name,
      descricao,
      valor,
      tipo,
      categoria: clean(body.categoria, 120) || (tipo === "Receita" ? "Receita comercial" : "Despesa operacional"),
      status: clean(body.status, 50) || "pendente",
      vencimento: clean(body.vencimento, 40) || null,
      dataPagamento: clean(body.dataPagamento, 40) || null,
      meioPagamento: clean(body.meioPagamento, 60) || null,
      orcamentoId: clean(body.orcamentoId, 160) || null,
      referencia: clean(body.orcamentoId, 160) ? `budget:${clean(body.orcamentoId, 160)}` : "",
      payoutStatus: tipo === "Receita" ? "pendente" : null,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (leadId) {
      await adminDb.collection("leads").doc(leadId).collection("events").add({
        type: "finance_created",
        title: "Lancamento comercial criado",
        detail: `${descricao} registrado em financeiro.`,
        financeId: ref.id,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
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
    console.error("Erro ao criar lancamento do tenant:", error);
    return NextResponse.json({ error: "Falha ao criar lancamento." }, { status: 500 });
  }
}

