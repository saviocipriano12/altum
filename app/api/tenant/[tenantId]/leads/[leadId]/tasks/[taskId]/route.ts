import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess } from "@/lib/server/commercial-access";

type Body = {
  status?: "pending" | "done";
};

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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string; taskId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId, taskId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "edit_leads");
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    const leadRef = await assertLeadInTenant(tenantId, leadId);

    const taskRef = adminDb.collection("lead_tasks").doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      return NextResponse.json({ error: "Tarefa nao encontrada." }, { status: 404 });
    }

    const task = taskSnap.data() as { tenantId?: string; leadId?: string; title?: string };
    if ((task.tenantId || "") !== tenantId || (task.leadId || "") !== leadId) {
      return NextResponse.json({ error: "Tarefa fora do tenant informado." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const status = body.status === "done" ? "done" : "pending";

    await Promise.all([
      taskRef.set(
        {
          status,
          completedAt: status === "done" ? FieldValue.serverTimestamp() : null,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: user.name,
        },
        { merge: true }
      ),
      leadRef.collection("events").add({
        type: "task_status_update",
        title: status === "done" ? "Tarefa concluida" : "Tarefa reaberta",
        detail: task.title || "Tarefa",
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, leadId, taskId, status });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar tarefa do lead:", error);
    return NextResponse.json({ error: "Falha ao atualizar tarefa do lead." }, { status: 500 });
  }
}
