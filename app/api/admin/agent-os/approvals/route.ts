import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";
import { processAutomaticCreativeContinuations } from "@/lib/server/agent-os/creative-job-worker";
import { dispatchMissionToOpenClaw } from "@/lib/server/agent-os/openclaw-runtime";
import {
  assertTaskTransition,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/server/agent-os/task-lifecycle";
import { newAgentDomainEventId } from "@/lib/server/agent-os/agent-domain-events";
import {
  assertMissionTransition,
  isMissionStatus,
} from "@/lib/server/agent-os/mission-lifecycle";

function date(value: unknown) {
  return value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}
function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no Approval Center:", error);
  return Response.json(
    { error: "Não foi possível concluir a operação de aprovação." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const snap = await adminDb
      .collection("agent_approvals")
      .orderBy("__name__")
      .limit(200)
      .get();
    return Response.json(
      {
        items: snap.docs.map((doc) => {
          const row = doc.data();
          return {
            id: doc.id,
            tenantId: String(row.tenantId || ""),
            missionId: String(row.missionId || ""),
            taskId: typeof row.taskId === "string" ? row.taskId : null,
            title: String(row.title || "Ação sem título"),
            summary: String(row.summary || ""),
            actionType: String(row.actionType || "external_action"),
            risk: String(row.risk || "medium"),
            status: String(row.status || "pending"),
            createdAt: date(row.createdAt),
            decidedAt: date(row.decidedAt),
            decidedByName:
              typeof row.decidedByName === "string" ? row.decidedByName : null,
            decisionNote:
              typeof row.decisionNote === "string" ? row.decisionNote : "",
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRequestUser(request, {
      roles: ["agency_admin"],
    });
    const body = (await request.json()) as {
      id?: unknown;
      decision?: unknown;
      note?: unknown;
    };
    const id =
      typeof body.id === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(body.id)
        ? body.id
        : "";
    const decision =
      body.decision === "approved" || body.decision === "rejected"
        ? body.decision
        : "";
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!id || !decision)
      throw new RouteAuthError(
        400,
        "invalid_approval",
        "Informe a ação e uma decisão válida.",
      );
    const ref = adminDb.collection("agent_approvals").doc(id);
    const domainEventId = newAgentDomainEventId("approval_decision");
    const missionStatusEventId = newAgentDomainEventId("mission_status");
    let creativeJobId: string | null = null;
    let approvedMissionId: string | null = null;
    let taskStatusBefore: TaskStatus | null = null;
    let approvedTask: {
      id: string;
      title: string;
      agent: string;
      capability: string;
      agentCandidateId: string | null;
      agentCandidateSource: string | null;
      agentCandidateStatus:
        "review_required" | "active" | "disabled" | "deprecated" | null;
    } | null = null;
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists)
        throw new RouteAuthError(
          404,
          "approval_missing",
          "Solicitação de aprovação não encontrada.",
        );
      const data = snap.data()!;
      if (data.status !== "pending")
        throw new RouteAuthError(
          409,
          "approval_decided",
          "Esta solicitação já recebeu uma decisão.",
        );
      const taskRef =
        typeof data.taskId === "string" && data.taskId
          ? adminDb.collection("agent_tasks").doc(data.taskId)
          : null;
      const task = taskRef ? await transaction.get(taskRef) : null;
      // Firestore requires every read before the first transaction write.
      const missionRef =
        typeof data.missionId === "string" && data.missionId
          ? adminDb.collection("agent_missions").doc(data.missionId)
          : null;
      const mission = missionRef ? await transaction.get(missionRef) : null;
      if (taskRef) {
        if (!task?.exists)
          throw new RouteAuthError(
            409,
            "approval_task_missing",
            "A tarefa vinculada a esta aprovação não existe mais.",
          );
        if (
          task.get("tenantId") !== data.tenantId ||
          task.get("missionId") !== data.missionId
        )
          throw new RouteAuthError(
            409,
            "approval_task_scope_mismatch",
            "A tarefa não pertence à missão e à empresa desta aprovação.",
          );
        const rawStatus = task.get("status");
        const current = isTaskStatus(rawStatus) ? rawStatus : "queued";
        taskStatusBefore = current;
        try {
          assertTaskTransition(
            current,
            decision === "approved" ? "ready" : "rejected",
          );
        } catch {
          throw new RouteAuthError(
            409,
            "invalid_task_transition",
            "A tarefa vinculada não está aguardando uma decisão válida.",
          );
        }
        if (decision === "approved") {
          const candidateStatus = task.get("agentCandidate")?.status;
          approvedTask = {
            id: taskRef.id,
            title: String(task.get("title") || "Etapa da missão"),
            agent: String(task.get("agent") || "Altum Agent"),
            capability: String(task.get("capability") || "PLAN_MISSION"),
            agentCandidateId:
              typeof task.get("agentCandidateId") === "string"
                ? task.get("agentCandidateId")
                : null,
            agentCandidateSource:
              typeof task.get("agentCandidate")?.source === "string"
                ? task.get("agentCandidate").source
                : null,
            agentCandidateStatus:
              candidateStatus === "review_required" ||
              candidateStatus === "active" ||
              candidateStatus === "disabled" ||
              candidateStatus === "deprecated"
                ? candidateStatus
                : null,
          };
        }
      }
      transaction.set(
        ref,
        {
          status: decision,
          decisionNote: note,
          decidedBy: actor.uid,
          decidedByName: actor.name,
          decidedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      if (taskRef) {
        const domainMissionId =
          typeof data.missionId === "string" ? data.missionId : "";
        const domainTenantId =
          typeof data.tenantId === "string" ? data.tenantId : "";
        if (!domainMissionId || !domainTenantId || !taskStatusBefore) {
          throw new RouteAuthError(
            409,
            "approval_scope_missing",
            "A aprovação vinculada à tarefa não possui escopo de missão e empresa.",
          );
        }
        transaction.set(
          taskRef,
          {
            status: decision === "approved" ? "ready" : "rejected",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          adminDb.collection("agent_domain_events").doc(domainEventId),
          {
            schemaVersion: 1,
            eventId: domainEventId,
            type: "task.status_changed",
            occurredAt: new Date().toISOString(),
            tenantId: domainTenantId,
            actor: { type: "user", id: actor.uid },
            correlationId: domainMissionId,
            causationId: id,
            missionId: domainMissionId,
            taskId: taskRef.id,
            payload: {
              from: taskStatusBefore,
              to: decision === "approved" ? "ready" : "rejected",
              reason:
                note ||
                (decision === "approved"
                  ? "Etapa aprovada por operador."
                  : "Etapa rejeitada por operador."),
            },
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      }
      if (missionRef) {
        if (!mission?.exists)
          throw new RouteAuthError(
            409,
            "approval_mission_missing",
            "A missão vinculada a esta aprovação não existe mais.",
          );
        if (mission.get("tenantId") !== data.tenantId)
          throw new RouteAuthError(
            409,
            "approval_mission_scope_mismatch",
            "A missão vinculada não pertence à empresa desta aprovação.",
          );
        const rawMissionStatus = mission.get("status");
        const missionStatusBefore = isMissionStatus(rawMissionStatus)
          ? rawMissionStatus
          : "waiting_approval";
        const missionStatusAfter =
          decision === "approved" ? ("running" as const) : ("paused" as const);
        try {
          assertMissionTransition(missionStatusBefore, missionStatusAfter);
        } catch {
          throw new RouteAuthError(
            409,
            "invalid_mission_transition",
            "A missão vinculada não pode receber esta decisão no estado atual.",
          );
        }
        approvedMissionId = data.missionId;
        transaction.set(
          missionRef,
          {
            status: missionStatusAfter,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          adminDb.collection("agent_domain_events").doc(missionStatusEventId),
          {
            schemaVersion: 1,
            eventId: missionStatusEventId,
            type: "mission.status_changed",
            occurredAt: new Date().toISOString(),
            tenantId: String(data.tenantId),
            actor: { type: "user", id: actor.uid },
            correlationId: data.missionId,
            causationId: id,
            missionId: data.missionId,
            payload: {
              from: missionStatusBefore,
              to: missionStatusAfter,
              reason:
                note ||
                (decision === "approved"
                  ? "Aprovação concedida por operador."
                  : "Aprovação recusada por operador."),
            },
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      }
      if (typeof data.avatarJobId === "string" && data.avatarJobId) {
        transaction.set(
          adminDb.collection("avatar_jobs").doc(data.avatarJobId),
          {
            status:
              decision === "approved" ? "approved_for_anchor" : "rejected",
            approvedBy: actor.uid,
            approvedByName: actor.name,
            approvedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      if (typeof data.creativeJobId === "string" && data.creativeJobId) {
        creativeJobId = data.creativeJobId;
        // Approval must have the same outcome whether it happened in the
        // conversation or in the legacy review screen: the durable worker,
        // not a browser request, starts the paid render exactly once.
        transaction.set(
          adminDb.collection("creative_jobs").doc(data.creativeJobId),
          {
            status: decision === "approved" ? "queued" : "rejected",
            autoStart: decision === "approved",
            approvedBy: actor.uid,
            approvedByName: actor.name,
            approvedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      if (typeof data.captureFormId === "string" && data.captureFormId) {
        transaction.set(
          adminDb.collection("capture_forms").doc(data.captureFormId),
          {
            status: decision === "approved" ? "active" : "draft",
            publishedAt:
              decision === "approved" ? FieldValue.serverTimestamp() : null,
            publishedBy: decision === "approved" ? actor.uid : null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actor.uid,
            updatedByName: actor.name,
          },
          { merge: true },
        );
      }
      transaction.set(adminDb.collection("audit_logs").doc(), {
        type: `agent_approval_${decision}`,
        actorId: actor.uid,
        actorName: actor.name,
        tenantId: data.tenantId || null,
        missionId: data.missionId || null,
        approvalId: id,
        actionType: data.actionType || null,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    let mediaStarted = false;
    if (decision === "approved" && creativeJobId) {
      try {
        // Rendering starts from the same server-side approval action. It is
        // deliberately awaited here instead of relying on a client refresh;
        // video providers may return a queued task, which is then pollable by
        // the durable media worker.
        const started = await processAutomaticCreativeContinuations({
          jobId: creativeJobId,
          limit: 1,
        });
        mediaStarted = started.some((result) => result.jobId === creativeJobId);
      } catch (error) {
        // Approval itself is durable and must not be rolled back merely because
        // a downstream provider is briefly unavailable. The queued job remains
        // auditable and can be retried by the worker.
        console.error(
          "A geração aprovada não pôde iniciar imediatamente:",
          error,
        );
      }
    }
    let runtimeQueued = false;
    if (decision === "approved" && approvedMissionId) {
      // An approval made inside the conversation must resume the same durable
      // runtime workflow. Previously it only changed a Firestore status, which
      // left the mission looking "em execução" while no specialist received it.
      try {
        const mission = await adminDb
          .collection("agent_missions")
          .doc(approvedMissionId)
          .get();
        if (mission.exists) {
          const row = mission.data()!;
          const dispatch = await dispatchMissionToOpenClaw({
            missionId: approvedMissionId,
            tenantId: String(row.tenantId || ""),
            conversationId:
              typeof row.conversationId === "string"
                ? row.conversationId
                : null,
            title: String(row.title || "Missão Altum"),
            objective: String(row.objective || "Retomar a etapa aprovada."),
            template: String(row.template || "custom"),
            risk:
              row.risk === "low" || row.risk === "high" ? row.risk : "medium",
            budgetBrl: Number(row.budgetBrl || 0),
            constraints: Array.isArray(row.constraints)
              ? row.constraints.map(String).slice(0, 24)
              : [],
            operation: "execute",
            actorId: actor.uid,
            task: approvedTask,
          });
          runtimeQueued = dispatch.dispatched;
        }
      } catch (error) {
        // The approval and its business action remain durable. The next
        // explicit resume can queue the runtime again if the private worker is
        // temporarily unavailable.
        console.error(
          "A missão aprovada não pôde ser retomada no runtime:",
          error,
        );
      }
    }
    return Response.json({
      ok: true,
      decision,
      creativeJobId: decision === "approved" ? creativeJobId : null,
      mediaStarted,
      runtimeQueued,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
