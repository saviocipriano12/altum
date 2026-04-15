import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  title?: string;
  dueAt?: string;
  type?: string;
  priority?: string;
};

function cleanString(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toSeconds(value: unknown) {
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return Math.floor((value as { toDate: () => Date }).toDate().getTime() / 1000);
  }
  return 0;
}

function parseDueAt(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTaskKey(input: { title: string; type: string }) {
  return `${input.type}:${input.title}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function assertLeadInTenant(tenantId: string, leadId: string) {
  const leadRef = adminDb.collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
  }

  const lead = leadSnap.data() as { tenantId?: string };
  if ((lead.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Lead fora do tenant informado.");
  }

  return leadRef;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    await assertLeadInTenant(tenantId, leadId);

    const snap = await adminDb
      .collection("lead_tasks")
      .where("tenantId", "==", tenantId)
      .where("leadId", "==", leadId)
      .limit(100)
      .get();

    const items = snap.docs
      .map(
        (doc): Record<string, unknown> & { id: string; dueAt?: unknown; createdAt?: unknown } => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        })
      )
      .sort((a, b) => {
        const statusA = String(a.status || "pending");
        const statusB = String(b.status || "pending");
        if (statusA !== statusB) return statusA === "done" ? 1 : -1;
        return toSeconds(a.dueAt || a.createdAt) - toSeconds(b.dueAt || b.createdAt);
      });

    return NextResponse.json({ ok: true, tenantId, leadId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar tarefas do lead:", error);
    return NextResponse.json({ error: "Falha ao listar tarefas do lead." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "edit_leads");
    const leadRef = await assertLeadInTenant(tenantId, leadId);

    const body = (await req.json()) as Body;
    const title = cleanString(body.title, 180);
    if (!title) {
      return NextResponse.json({ error: "Campo obrigatorio: title." }, { status: 400 });
    }

    const dueAt = parseDueAt(body.dueAt);
    const priority = cleanString(body.priority, 20).toLowerCase() || "medium";
    const type = cleanString(body.type, 40).toLowerCase() || "follow_up";
    const dedupeKey = normalizeTaskKey({ title, type });

    const existingTasksSnap = await adminDb
      .collection("lead_tasks")
      .where("tenantId", "==", tenantId)
      .where("leadId", "==", leadId)
      .where("status", "==", "pending")
      .limit(120)
      .get();

    const duplicatedTask = existingTasksSnap.docs.find((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const currentTitle = cleanString(data.title, 180) || "Tarefa";
      const currentType = cleanString(data.type, 40).toLowerCase() || "follow_up";
      const currentKey = normalizeTaskKey({ title: currentTitle, type: currentType });
      return currentKey === dedupeKey;
    });

    if (duplicatedTask) {
      return NextResponse.json({
        ok: true,
        tenantId,
        leadId,
        deduped: true,
        taskId: duplicatedTask.id,
      });
    }

    await Promise.all([
      adminDb.collection("lead_tasks").add({
        tenantId,
        leadId,
        title,
        type,
        priority,
        dueAt,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
        createdByName: user.name,
      }),
      leadRef.collection("events").add({
        type: "task_created",
        title: "Tarefa criada",
        detail: title,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, leadId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar tarefa do lead:", error);
    return NextResponse.json({ error: "Falha ao criar tarefa do lead." }, { status: 500 });
  }
}
