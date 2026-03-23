import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";

type TaskItem = Record<string, unknown> & {
  id: string;
  tenantId?: string;
  leadId?: string;
  title?: string;
  type?: string;
  priority?: string;
  status?: string;
  dueAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type LeadItem = Record<string, unknown> & {
  id: string;
  nome?: string;
  empresa?: string;
  telefone?: string;
  owner?: string;
  ownerId?: string;
  pipelineStage?: string;
  stage?: string;
  heat?: string;
  priority?: string;
};

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function toMillis(value: unknown) {
  return toDate(value)?.getTime() || 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).limit(300).get();

    const tasks = snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as TaskItem)
      .sort((a, b) => {
        const statusA = String(a.status || "pending");
        const statusB = String(b.status || "pending");
        if (statusA !== statusB) return statusA === "done" ? 1 : -1;
        return toMillis(a.dueAt || a.createdAt) - toMillis(b.dueAt || b.createdAt);
      });

    const leadIds = Array.from(new Set(tasks.map((task) => String(task.leadId || "")).filter(Boolean)));
    const leadDocs = await Promise.all(leadIds.map((leadId) => adminDb.collection("leads").doc(leadId).get()));

    const leadsById = new Map<string, LeadItem>();
    for (const leadSnap of leadDocs) {
      if (!leadSnap.exists) continue;
      const data = leadSnap.data() as Record<string, unknown>;
      if (String(data.tenantId || "") !== tenantId) continue;
      leadsById.set(leadSnap.id, { id: leadSnap.id, ...data } as LeadItem);
    }

    const now = Date.now();
    const items = tasks.map((task) => {
      const lead = leadsById.get(String(task.leadId || ""));
      const dueAt = task.dueAt || null;
      const dueMillis = toMillis(dueAt);
      const status = String(task.status || "pending").toLowerCase() === "done" ? "done" : "pending";
      return {
        id: task.id,
        tenantId,
        leadId: String(task.leadId || ""),
        title: String(task.title || "Tarefa"),
        type: String(task.type || "follow_up"),
        priority: String(task.priority || lead?.priority || "medium"),
        status,
        dueAt,
        createdAt: task.createdAt || null,
        updatedAt: task.updatedAt || null,
        overdue: status !== "done" && Boolean(dueMillis && dueMillis < now),
        dueToday:
          status !== "done" &&
          Boolean(
            dueMillis &&
              new Date(dueMillis).toDateString() === new Date(now).toDateString()
          ),
        lead: lead
          ? {
              id: lead.id,
              nome: String(lead.nome || "Lead"),
              empresa: String(lead.empresa || ""),
              telefone: String(lead.telefone || ""),
              owner: String(lead.owner || ""),
              ownerId: String(lead.ownerId || ""),
              heat: String(lead.heat || "morno"),
              priority: String(lead.priority || "medium"),
              pipelineStage: normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado"),
            }
          : null,
      };
    });

    const pending = items.filter((item) => item.status === "pending");
    const done = items.filter((item) => item.status === "done");
    const overdue = pending.filter((item) => item.overdue);
    const dueToday = pending.filter((item) => item.dueToday);
    const highPriority = pending.filter((item) => String(item.priority || "").toLowerCase() === "high");
    const proposal = pending.filter((item) => String(item.lead?.pipelineStage || "") === "proposta_enviada");

    return NextResponse.json({
      ok: true,
      tenantId,
      summary: {
        total: items.length,
        pending: pending.length,
        done: done.length,
        overdue: overdue.length,
        dueToday: dueToday.length,
        highPriority: highPriority.length,
        proposal: proposal.length,
      },
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar follow-ups do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar follow-ups." }, { status: 500 });
  }
}
