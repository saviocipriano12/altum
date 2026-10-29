import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";
import {
  dispatchMissionToOpenClaw,
  type OpenClawMissionOperation,
} from "@/lib/server/agent-os/openclaw-runtime";
import {
  assertTaskTransition,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/server/agent-os/task-lifecycle";
import {
  executionStatusForReconciliation,
  shouldPauseMissionAfterReconciliation,
  type ReconciliationDecision,
} from "@/lib/server/agent-os/reconciliation";
import { newAgentDomainEventId } from "@/lib/server/agent-os/agent-domain-events";

type RouteContext = { params: Promise<{ missionId: string }> };

/** The limited task shape needed to create an immutable runtime envelope. */
type RuntimeTaskSnapshot = {
  id: string;
  sequence?: number;
  title?: string;
  agent?: string;
  capability?: string;
  agentCandidateId?: string;
  agentCandidate?: { status?: unknown; source?: unknown };
};

/** Read-only reconciliation evidence. Never return envelopes, secrets or provider payloads. */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const { missionId } = await context.params;
    if (!validId(missionId))
      throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const mission = await adminDb
      .collection("agent_missions")
      .doc(missionId)
      .get();
    if (!mission.exists)
      throw new RouteAuthError(
        404,
        "mission_missing",
        "Missão não encontrada.",
      );
    const tenantId = String(mission.get("tenantId") || "");
    const dispatches = await adminDb
      .collection("agent_runtime_dispatches")
      .where("missionId", "==", missionId)
      .limit(80)
      .get();
    const pending = dispatches.docs.filter(
      (doc) =>
        doc.get("status") === "needs_reconciliation" &&
        doc.get("tenantId") === tenantId,
    );
    const items = await Promise.all(
      pending.map(async (doc) => {
        const events = await adminDb
          .collection("agent_runtime_events")
          .where("dispatchId", "==", doc.id)
          .limit(80)
          .get();
        return {
          dispatchId: doc.id,
          missionId,
          tenantId,
          status: "needs_reconciliation",
          operation:
            typeof doc.get("operation") === "string"
              ? doc.get("operation")
              : null,
          deliveryAttempts: Number(doc.get("deliveryAttempts") || 0),
          failureCode: String(doc.get("failureCode") || ""),
          reconciliationStatus: String(
            doc.get("reconciliationStatus") || "pending_operator_review",
          ),
          claimedAt: doc.get("claimedAt")?.toDate?.()?.toISOString?.() || null,
          events: events.docs
            .filter(
              (event) =>
                event.get("tenantId") === tenantId &&
                event.get("missionId") === missionId,
            )
            .map((event) => ({
              eventId: String(event.get("eventId") || ""),
              type: String(event.get("type") || ""),
              occurredAt: String(event.get("occurredAt") || ""),
              progress:
                typeof event.get("progress") === "number"
                  ? event.get("progress")
                  : null,
              artifactCount: Array.isArray(event.get("artifacts"))
                ? event.get("artifacts").length
                : 0,
            })),
        };
      }),
    );
    return Response.json(
      {
        missionId,
        items,
        requiresReview: items.length > 0,
        note: "Verifique os recibos locais do worker antes de decidir. Esta consulta não reexecuta a missão.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Reconcile one ambiguous dispatch without creating a new execution. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireRequestUser(request, {
      roles: ["agency_admin"],
    });
    const { missionId } = await context.params;
    if (!validId(missionId))
      throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const body = (await request.json()) as {
      dispatchId?: unknown;
      decision?: unknown;
      reason?: unknown;
    };
    const dispatchId =
      typeof body.dispatchId === "string" ? body.dispatchId : "";
    const decision = body.decision;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (
      !validId(dispatchId) ||
      ![
        "confirmed_completed",
        "confirmed_not_executed",
        "requires_investigation",
      ].includes(String(decision)) ||
      reason.length < 20 ||
      reason.length > 2000
    ) {
      throw new RouteAuthError(
        400,
        "invalid_reconciliation",
        "Informe despacho, decisão e justificativa de 20 a 2000 caracteres.",
      );
    }
    const missionRef = adminDb.collection("agent_missions").doc(missionId);
    const dispatchRef = adminDb
      .collection("agent_runtime_dispatches")
      .doc(dispatchId);
    const executionRef = adminDb
      .collection("agent_task_executions")
      .doc(dispatchId);
    const auditRef = adminDb.collection("audit_logs").doc();
    await adminDb.runTransaction(async (transaction) => {
      const [mission, dispatch] = await Promise.all([
        transaction.get(missionRef),
        transaction.get(dispatchRef),
      ]);
      if (!mission.exists || !dispatch.exists)
        throw new RouteAuthError(
          404,
          "reconciliation_missing",
          "Missão ou despacho não encontrado.",
        );
      if (
        String(dispatch.get("missionId") || "") !== missionId ||
        String(dispatch.get("tenantId") || "") !==
          String(mission.get("tenantId") || "")
      ) {
        throw new RouteAuthError(
          409,
          "reconciliation_mismatch",
          "Despacho não pertence a esta missão.",
        );
      }
      if (dispatch.get("status") !== "needs_reconciliation")
        throw new RouteAuthError(
          409,
          "reconciliation_closed",
          "Este despacho não aguarda reconciliação.",
        );
      // Repeating the same investigation decision is not a new finding.
      // Prevent accidental duplicate audit records from double-clicks or retries.
      if (
        decision === "requires_investigation" &&
        dispatch.get("reconciliationStatus") === "requires_investigation" &&
        dispatch.get("reconciliationReason") === reason
      ) {
        throw new RouteAuthError(
          409,
          "reconciliation_unchanged",
          "Esta investigação já foi registrada com a mesma justificativa.",
        );
      }
      const resolved = decision !== "requires_investigation";
      transaction.set(
        dispatchRef,
        {
          status: resolved ? "reconciled" : "needs_reconciliation",
          reconciliationStatus: decision,
          reconciliationReason: reason,
          reconciliationBy: actor.uid,
          reconciliationAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      const reconciliationDecision = decision as ReconciliationDecision;
      transaction.set(
        executionRef,
        {
          status: executionStatusForReconciliation(reconciliationDecision),
          reconciliationStatus: decision,
          reconciliationReason: reason,
          reconciliationBy: actor.uid,
          reconciliationAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      // A confirmed non-execution is safe to resume, but never automatically.
      // Returning to paused forces an explicit operator start and preserves the
      // original task as the next work unit rather than silently skipping it.
      if (
        shouldPauseMissionAfterReconciliation(
          reconciliationDecision,
          String(mission.get("status") || ""),
        )
      ) {
        transaction.set(
          missionRef,
          {
            status: "paused",
            runtimeStatus: "reconciled_not_executed",
            runtimeMessage:
              "A execução anterior foi confirmada como não iniciada. Revise o contexto e retome quando estiver pronto.",
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actor.uid,
          },
          { merge: true },
        );
      }
      transaction.set(auditRef, {
        type: "agent_runtime_reconciliation",
        actorId: actor.uid,
        tenantId: mission.get("tenantId"),
        missionId,
        dispatchId,
        decision,
        reason,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true, dispatchId, decision });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no runtime de missão:", error);
  return Response.json(
    { error: "Não foi possível atualizar a missão." },
    { status: 500 },
  );
}

function validId(value: string) {
  return /^[A-Za-z0-9_-]{1,180}$/.test(value);
}

function currentTaskStatus(task: Record<string, unknown>): TaskStatus {
  return isTaskStatus(task.status) ? task.status : "queued";
}

function requireTaskTransition(
  task: Record<string, unknown>,
  next: TaskStatus,
) {
  const current = currentTaskStatus(task);
  if (current === next) return;
  try {
    assertTaskTransition(current, next);
  } catch {
    throw new RouteAuthError(
      409,
      "invalid_task_transition",
      `A tarefa “${String(task.title || "sem título")}” não pode mudar de ${current} para ${next}.`,
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireRequestUser(request, {
      roles: ["agency_admin"],
    });
    const { missionId } = await context.params;
    if (!validId(missionId))
      throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const body = (await request.json()) as { action?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    // Completion is produced by a signed runtime receipt. The legacy manual
    // advance endpoint is intentionally closed so an operator cannot skip a
    // task while its executor is still running.
    if (!["start", "retry", "pause", "cancel"].includes(action))
      throw new RouteAuthError(
        400,
        "invalid_action",
        "Ação de missão inválida.",
      );
    const missionRef = adminDb.collection("agent_missions").doc(missionId);
    const missionSnap = await missionRef.get();
    if (!missionSnap.exists)
      throw new RouteAuthError(
        404,
        "mission_missing",
        "Missão não encontrada.",
      );
    const mission = missionSnap.data()!;
    // An unresolved dispatch may have already performed its operation. Never
    // start or advance another execution before reviewing the previous receipt.
    if (action === "start" || action === "retry") {
      const unresolved = await adminDb
        .collection("agent_runtime_dispatches")
        .where("missionId", "==", missionId)
        .limit(80)
        .get();
      if (
        unresolved.docs.some(
          (doc) => doc.get("status") === "needs_reconciliation",
        )
      ) {
        throw new RouteAuthError(
          409,
          "mission_reconciliation_required",
          "Revise os despachos interrompidos antes de iniciar ou avançar esta missão.",
        );
      }
    }
    const taskSnap = await adminDb
      .collection("agent_tasks")
      .where("missionId", "==", missionId)
      .limit(80)
      .get();
    const tasks = taskSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown>,
    );
    const status = String(mission.status || "planned");

    let runtimeOperation: OpenClawMissionOperation | null = null;
    if (action === "cancel") {
      if (["completed", "cancelled"].includes(status))
        throw new RouteAuthError(
          409,
          "mission_closed",
          "Esta missão já está encerrada.",
        );
      const cancelEventId = newAgentDomainEventId("mission_status");
      const cancelBatch = adminDb.batch();
      cancelBatch.set(
        missionRef,
        {
          status: "cancelled",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        },
        { merge: true },
      );
      cancelBatch.set(
        adminDb.collection("agent_domain_events").doc(cancelEventId),
        {
          schemaVersion: 1,
          eventId: cancelEventId,
          type: "mission.status_changed",
          occurredAt: new Date().toISOString(),
          tenantId: String(mission.tenantId || ""),
          actor: { type: "user", id: actor.uid },
          correlationId: missionId,
          causationId: null,
          missionId,
          payload: {
            from: status,
            to: "cancelled",
            reason: "Missão cancelada pelo administrador.",
          },
          createdAt: FieldValue.serverTimestamp(),
        },
      );
      await cancelBatch.commit();
      runtimeOperation = "cancel";
    } else if (action === "pause") {
      if (!["running", "waiting_approval"].includes(status))
        throw new RouteAuthError(
          409,
          "mission_not_running",
          "Somente missões em andamento podem ser pausadas.",
        );
      const pauseEventId = newAgentDomainEventId("mission_status");
      const pauseBatch = adminDb.batch();
      pauseBatch.set(
        missionRef,
        {
          status: "paused",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        },
        { merge: true },
      );
      pauseBatch.set(
        adminDb.collection("agent_domain_events").doc(pauseEventId),
        {
          schemaVersion: 1,
          eventId: pauseEventId,
          type: "mission.status_changed",
          occurredAt: new Date().toISOString(),
          tenantId: String(mission.tenantId || ""),
          actor: { type: "user", id: actor.uid },
          correlationId: missionId,
          causationId: null,
          missionId,
          payload: {
            from:
              status === "waiting_approval" ? "waiting_approval" : "running",
            to: "paused",
            reason: "Missão pausada pelo administrador.",
          },
          createdAt: FieldValue.serverTimestamp(),
        },
      );
      await pauseBatch.commit();
      runtimeOperation = "pause";
    } else if (action === "start") {
      if (!["planned", "paused"].includes(status))
        throw new RouteAuthError(
          409,
          "mission_not_startable",
          "Esta missão não pode ser iniciada agora.",
        );
      const first = tasks
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
        .find((task) => ["ready", "queued"].includes(currentTaskStatus(task)));
      if (!first)
        throw new RouteAuthError(
          409,
          "mission_has_no_tasks",
          "Esta missão não tem tarefas disponíveis.",
        );
      requireTaskTransition(first, "ready");
      const batch = adminDb.batch();
      const missionEventId = newAgentDomainEventId("mission_status");
      batch.set(
        missionRef,
        {
          status: "running",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        },
        { merge: true },
      );
      batch.set(
        adminDb.collection("agent_tasks").doc(first.id as string),
        {
          status: "ready",
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      batch.set(adminDb.collection("agent_domain_events").doc(missionEventId), {
        schemaVersion: 1,
        eventId: missionEventId,
        type: "mission.status_changed",
        occurredAt: new Date().toISOString(),
        tenantId: String(mission.tenantId || ""),
        actor: { type: "user", id: actor.uid },
        correlationId: missionId,
        causationId: null,
        missionId,
        payload: {
          from:
            status === "planned" || status === "paused" ? status : "planned",
          to: "running",
          reason: "Missão iniciada pelo administrador.",
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      if (currentTaskStatus(first) !== "ready") {
        const taskEventId = newAgentDomainEventId("task_status");
        batch.set(adminDb.collection("agent_domain_events").doc(taskEventId), {
          schemaVersion: 1,
          eventId: taskEventId,
          type: "task.status_changed",
          occurredAt: new Date().toISOString(),
          tenantId: String(mission.tenantId || ""),
          actor: { type: "user", id: actor.uid },
          correlationId: missionId,
          causationId: missionEventId,
          missionId,
          taskId: String(first.id),
          payload: {
            from: currentTaskStatus(first),
            to: "ready",
            reason: "Primeira etapa liberada pela missão.",
          },
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      runtimeOperation = "execute";
    } else if (action === "retry") {
      if (!["running", "failed"].includes(status))
        throw new RouteAuthError(
          409,
          "mission_not_retryable",
          "Somente uma missão em execução ou com falha pode tentar a etapa novamente.",
        );
      const retryTask = tasks
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
        .find((task) => currentTaskStatus(task) === "ready");
      if (!retryTask)
        throw new RouteAuthError(
          409,
          "task_not_retryable",
          "Não há uma tarefa pronta para nova tentativa.",
        );
      if (status === "failed") {
        const retryEventId = newAgentDomainEventId("mission_status");
        const retryBatch = adminDb.batch();
        retryBatch.set(
          missionRef,
          {
            status: "running",
            runtimeFailure: null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actor.uid,
          },
          { merge: true },
        );
        retryBatch.set(
          adminDb.collection("agent_domain_events").doc(retryEventId),
          {
            schemaVersion: 1,
            eventId: retryEventId,
            type: "mission.status_changed",
            occurredAt: new Date().toISOString(),
            tenantId: String(mission.tenantId || ""),
            actor: { type: "user", id: actor.uid },
            correlationId: missionId,
            causationId: null,
            missionId,
            payload: {
              from: "failed",
              to: "running",
              reason: "Nova tentativa iniciada pelo administrador.",
            },
            createdAt: FieldValue.serverTimestamp(),
          },
        );
        await retryBatch.commit();
      }
      runtimeOperation = "execute";
    }
    if (runtimeOperation) {
      // Read after the transactional state change. This preserves the exact
      // work unit that the operator just started/resumed in the immutable
      // runtime envelope and avoids deriving it from stale request state.
      const runtimeTasks = await adminDb
        .collection("agent_tasks")
        .where("missionId", "==", missionId)
        .limit(100)
        .get();
      const runtimeTask = runtimeTasks.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as RuntimeTaskSnapshot)
        .sort(
          (left, right) =>
            Number(left.sequence || 0) - Number(right.sequence || 0),
        )
        .find((task) =>
          ["ready", "running", "waiting_approval"].includes(
            currentTaskStatus(task),
          ),
        );
      const candidateStatus = runtimeTask?.agentCandidate?.status;
      await dispatchMissionToOpenClaw({
        missionId,
        tenantId: String(mission.tenantId || ""),
        conversationId:
          typeof mission.conversationId === "string"
            ? mission.conversationId
            : null,
        title: String(mission.title || "Missão Altum"),
        objective: String(mission.objective || ""),
        template: String(mission.template || "custom"),
        risk:
          mission.risk === "high" || mission.risk === "low"
            ? mission.risk
            : "medium",
        budgetBrl: Number(mission.budgetBrl || 0),
        constraints: Array.isArray(mission.constraints)
          ? mission.constraints.map(String).slice(0, 24)
          : [],
        operation: runtimeOperation,
        actorId: actor.uid,
        task: runtimeTask
          ? {
              id: String(runtimeTask.id),
              title: String(runtimeTask.title || "Etapa da missão"),
              agent: String(runtimeTask.agent || "Altum Agent"),
              capability: String(runtimeTask.capability || "PLAN_MISSION"),
              agentCandidateId:
                typeof runtimeTask.agentCandidateId === "string"
                  ? runtimeTask.agentCandidateId
                  : null,
              agentCandidateSource:
                typeof runtimeTask.agentCandidate?.source === "string"
                  ? runtimeTask.agentCandidate.source
                  : null,
              agentCandidateStatus:
                candidateStatus === "review_required" ||
                candidateStatus === "active" ||
                candidateStatus === "disabled" ||
                candidateStatus === "deprecated"
                  ? candidateStatus
                  : null,
            }
          : null,
      });
    }
    await adminDb.collection("audit_logs").add({
      type: `agent_mission_${action}`,
      actorId: actor.uid,
      actorName: actor.name,
      tenantId: mission.tenantId || null,
      missionId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
