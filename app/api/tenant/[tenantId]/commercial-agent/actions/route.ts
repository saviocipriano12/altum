import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  TenantAccessError,
} from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  assertLeadCommercialAccess,
  canAccessAssignedCommercialRecord,
} from "@/lib/server/commercial-access";
import { recordCommercialAgentAction } from "@/lib/server/commercial-agent-actions";
import { processCommercialAgentSla } from "@/lib/server/commercial-agent-sla";
import {
  evaluateCommercialAgentSla,
  normalizeCommercialAgentActionType,
  type CommercialAgentActionStatus,
} from "@/lib/commercial-agent-action";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timestampMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

function timestampIso(value: unknown) {
  const time = timestampMillis(value);
  return time ? new Date(time).toISOString() : null;
}

function actionSla(item: Record<string, unknown>) {
  const type = normalizeCommercialAgentActionType(item.type);
  if (!type) return null;
  return evaluateCommercialAgentSla({
    type,
    status: clean(item.status, 40) as CommercialAgentActionStatus,
    createdAt: item.createdAt,
    dueAt: item.dueAt,
    expiresAt: item.expiresAt,
    escalationLevel: item.escalationLevel,
  });
}

function summarizeActions(items: Array<{ id: string } & Record<string, unknown>>) {
  const decided = items.filter((item) => ["approved", "rejected", "executed"].includes(clean(item.status, 40)));
  const decisionMinutes = decided
    .map((item) => {
      const createdAt = timestampMillis(item.createdAt);
      const reviewedAt = timestampMillis(item.reviewedAt) || timestampMillis(item.executedAt);
      return createdAt && reviewedAt && reviewedAt >= createdAt ? (reviewedAt - createdAt) / 60_000 : null;
    })
    .filter((value): value is number => typeof value === "number");
  return {
    total: items.length,
    pending: items.filter((item) => clean(item.status, 40) === "pending_approval").length,
    approved: items.filter((item) => clean(item.status, 40) === "approved").length,
    rejected: items.filter((item) => clean(item.status, 40) === "rejected").length,
    executed: items.filter((item) => clean(item.status, 40) === "executed").length,
    expired: items.filter((item) => clean(item.status, 40) === "expired").length,
    executionFailed: items.filter((item) => clean(item.status, 40) === "execution_failed").length,
    overdue: items.filter((item) => {
      const state = actionSla(item)?.state;
      return state === "overdue" || state === "escalate" || state === "expired";
    }).length,
    pendingAmount: items
      .filter((item) => clean(item.status, 40) === "pending_approval")
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    approvedAmount: items
      .filter((item) => ["approved", "executed"].includes(clean(item.status, 40)))
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    averageDecisionMinutes: decisionMinutes.length
      ? Math.round(decisionMinutes.reduce((sum, value) => sum + value, 0) / decisionMinutes.length)
      : null,
  };
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantRole(membership, "client_viewer");

    // Hobby deployments only guarantee a daily cron. Processing the current
    // tenant when its decision queue is opened keeps SLA state fresh without
    // requiring an external scheduler; updates are transactionally idempotent.
    await processCommercialAgentSla({ tenantId, limit: 50 });

    const url = new URL(req.url);
    const status = clean(url.searchParams.get("status"), 40);
    const snap = await adminDb.collection("commercial_agent_actions").where("tenantId", "==", tenantId).limit(200).get();
    const rawItems: Array<{ id: string } & Record<string, unknown>> = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const leadIds = Array.from(new Set(rawItems.map((item) => clean(item.leadId, 180)).filter(Boolean)));
    const leadEntries = await Promise.all(leadIds.map(async (leadId) => {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      return [leadId, leadSnap.exists ? leadSnap.data() as Record<string, unknown> : null] as const;
    }));
    const leads = new Map(leadEntries);
    const accessibleItems = rawItems
      .filter((item) => {
        const lead = leads.get(clean(item.leadId, 180));
        return Boolean(lead && canAccessAssignedCommercialRecord(membership, user.uid, lead));
      });
    const items = accessibleItems
      .filter((item) => !status || clean(item.status, 40) === status)
      .sort((a, b) => timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt))
      .map((item) => {
        const sla = actionSla(item);
        return {
          ...item,
          dueAt: timestampIso(item.dueAt),
          expiresAt: timestampIso(item.expiresAt),
          slaState: sla?.state || "inactive",
          escalationLevel: sla?.escalationLevel || 0,
        };
      });

    return NextResponse.json({ ok: true, tenantId, items, summary: summarizeActions(accessibleItems) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar decisoes do agente comercial:", error);
    return NextResponse.json({ error: "Falha ao carregar decisoes da IA." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "manage_commercial");
    const body = await req.json() as Record<string, unknown>;
    const leadId = clean(body.leadId, 180);
    const budgetId = clean(body.budgetId, 180);
    const amount = Number(body.amount);
    if (!leadId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Informe cliente e valor validos." }, { status: 400 });
    }
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    if (budgetId) {
      const budgetSnap = await adminDb.collection("orcamentos").doc(budgetId).get();
      if (!budgetSnap.exists || clean(budgetSnap.data()?.tenantId, 180) !== tenantId) {
        return NextResponse.json({ error: "Proposta nao encontrada neste tenant." }, { status: 404 });
      }
    }
    const action = await recordCommercialAgentAction({
      tenantId,
      leadId,
      type: "review_charge",
      title: clean(body.title, 180) || "Revisar cobranca antes de emitir",
      detail: clean(body.detail, 1000) || "A cobranca so podera ser emitida apos aprovacao humana e confirmacao no financeiro.",
      referenceCollection: budgetId ? "orcamentos" : "leads",
      referenceId: budgetId || leadId,
      dedupeKey: clean(body.dedupeKey, 180) || `charge:${budgetId || leadId}:${amount}:${clean(body.dueDate, 40)}`,
      amount,
      currency: clean(body.currency, 12) || "BRL",
      payload: {
        billingType: clean(body.billingType, 40) || null,
        dueDate: clean(body.dueDate, 40) || null,
        description: clean(body.description, 180) || null,
        budgetId: budgetId || null,
        requestedBy: user.uid,
      },
    });
    return NextResponse.json({ ok: true, tenantId, action }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao criar decisao do agente comercial:", error);
    return NextResponse.json({ error: "Falha ao preparar decisao comercial." }, { status: 500 });
  }
}
