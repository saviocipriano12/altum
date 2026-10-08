import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildMissionTaskSeeds, missionCreateSchema } from "@/lib/server/agent-os/missions";

function serializeTimestamp(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no Mission Control:", error);
  return Response.json({ error: "Não foi possível concluir a operação de missões." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const [missions, tenants, tasks, reconciliationDispatches] = await Promise.all([
      adminDb.collection("agent_missions").orderBy("createdAt", "desc").limit(100).get(),
      adminDb.collection("tenants").orderBy("__name__").limit(200).get(),
      adminDb.collection("agent_tasks").limit(500).get(),
      adminDb.collection("agent_runtime_dispatches").where("status", "==", "needs_reconciliation").limit(100).get(),
    ]);
    const reconciliationByMission = new Map<string, number>();
    for (const dispatch of reconciliationDispatches.docs) {
      const missionId = String(dispatch.get("missionId") || "");
      if (missionId) reconciliationByMission.set(missionId, (reconciliationByMission.get(missionId) || 0) + 1);
    }
    const tasksByMission = new Map<string, Array<{ title: string; status: string; sequence: number }>>();
    for (const task of tasks.docs) {
      const data = task.data();
      const missionId = typeof data.missionId === "string" ? data.missionId : "";
      if (!missionId) continue;
      const current = tasksByMission.get(missionId) || [];
      current.push({ title: String(data.title || "Etapa sem título"), status: String(data.status || "queued"), sequence: Number(data.sequence || 0) });
      tasksByMission.set(missionId, current);
    }
    return Response.json({
      items: missions.docs.map((doc) => {
        const data = doc.data();
        const missionTasks = (tasksByMission.get(doc.id) || []).sort((a, b) => a.sequence - b.sequence);
        const taskSummary = {
          total: missionTasks.length,
          completed: missionTasks.filter((task) => task.status === "completed").length,
          ready: missionTasks.filter((task) => task.status === "ready").length,
          waitingApproval: missionTasks.filter((task) => task.status === "waiting_approval").length,
          queued: missionTasks.filter((task) => task.status === "queued").length,
          rejected: missionTasks.filter((task) => task.status === "rejected").length,
        };
        const nextTask = missionTasks.find((task) => ["ready", "waiting_approval", "queued"].includes(task.status)) || null;
        return {
          id: doc.id,
          tenantId: String(data.tenantId || ""),
          title: String(data.title || ""),
          objective: String(data.objective || ""),
          template: String(data.template || "custom"),
          budgetBrl: Number(data.budgetBrl || 0),
          spentBrl: Number(data.spentBrl || 0),
          deadline: typeof data.deadline === "string" ? data.deadline : null,
          risk: String(data.risk || "medium"),
          status: String(data.status || "planned"),
          progress: Number(data.progress || 0),
          needsReconciliation: (reconciliationByMission.get(doc.id) || 0) > 0,
          pendingReconciliationDispatches: reconciliationByMission.get(doc.id) || 0,
          createdAt: serializeTimestamp(data.createdAt),
          taskSummary,
          nextTask,
        };
      }),
      tenants: tenants.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name") || doc.id) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const parsed = missionCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new RouteAuthError(400, "invalid_mission", "Revise empresa, objetivo, orçamento e limites da missão.");
    }

    const input = parsed.data;
    const tenant = await adminDb.collection("tenants").doc(input.tenantId).get();
    if (!tenant.exists) throw new RouteAuthError(404, "tenant_missing", "Empresa da missão não encontrada.");

    const missionRef = adminDb.collection("agent_missions").doc();
    const batch = adminDb.batch();
    batch.set(missionRef, {
      tenantId: input.tenantId,
      title: input.title,
      objective: input.objective,
      template: input.template,
      budgetBrl: input.budgetBrl,
      spentBrl: 0,
      deadline: input.deadline || null,
      risk: input.risk,
      constraints: input.constraints,
      status: "planned",
      progress: 0,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const [index, task] of buildMissionTaskSeeds(input.template).entries()) {
      const taskRef = adminDb.collection("agent_tasks").doc();
      batch.set(taskRef, {
        tenantId: input.tenantId,
        missionId: missionRef.id,
        title: task.title,
        agent: task.agent,
        capability: task.capability,
        requiresApproval: task.requiresApproval,
        status: index === 0 ? "ready" : "queued",
        sequence: index + 1,
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(adminDb.collection("audit_logs").doc(), {
      type: "agent_mission_created",
      actorId: actor.uid,
      actorName: actor.name,
      tenantId: input.tenantId,
      missionId: missionRef.id,
      template: input.template,
      risk: input.risk,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return Response.json({ ok: true, id: missionRef.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
