import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { runLeadAutomations } from "@/lib/server/automations";

type Body = {
  status?: string;
  dataPagamento?: string | null;
  meioPagamento?: string | null;
  descricao?: string;
  categoria?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; financeId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, financeId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_commercial");

    const ref = adminDb.collection("financeiro").doc(financeId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Lancamento nao encontrado." }, { status: 404 });
    }

    const current = snap.data() as Record<string, unknown>;
    if (String(current.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Lancamento fora do tenant informado." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };
    const changes: string[] = [];

    const status = clean(body.status, 50);
    if (body.status !== undefined && status && status !== clean(current.status, 50)) {
      patch.status = status;
      if (status === "pago" && !clean(body.dataPagamento || current.dataPagamento, 40)) {
        patch.dataPagamento = new Date().toISOString().slice(0, 10);
      }
      changes.push(`status: ${status}`);
    }

    const dataPagamento = clean(body.dataPagamento, 40);
    if (body.dataPagamento !== undefined && dataPagamento !== clean(current.dataPagamento, 40)) {
      patch.dataPagamento = dataPagamento || null;
      changes.push("data de pagamento atualizada");
    }

    const meioPagamento = clean(body.meioPagamento, 60);
    if (body.meioPagamento !== undefined && meioPagamento !== clean(current.meioPagamento, 60)) {
      patch.meioPagamento = meioPagamento || null;
      changes.push("meio de pagamento atualizado");
    }

    const descricao = clean(body.descricao, 180);
    if (body.descricao !== undefined && descricao !== clean(current.descricao, 180)) {
      patch.descricao = descricao;
      changes.push("descricao atualizada");
    }

    const categoria = clean(body.categoria, 120);
    if (body.categoria !== undefined && categoria !== clean(current.categoria, 120)) {
      patch.categoria = categoria;
      changes.push("categoria atualizada");
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, tenantId, financeId, unchanged: true });
    }

    await ref.set(patch, { merge: true });

    const leadId = clean(current.leadId, 140);
    if (leadId) {
      await adminDb.collection("leads").doc(leadId).collection("events").add({
        type: "finance_updated",
        title: "Financeiro atualizado",
        detail: changes.join(" | "),
        financeId,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (leadId && patch.status === "pago") {
      await runLeadAutomations({
        tenantId,
        trigger: "finance_paid",
        leadId,
        actorId: user.uid,
        actorName: user.name,
      });
    }

    return NextResponse.json({ ok: true, tenantId, financeId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar financeiro do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar lancamento." }, { status: 500 });
  }
}

