import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  openClawRuntimeEventSchema,
  runtimeEventDocumentId,
  verifyOpenClawRuntimeSignature,
} from "@/lib/server/agent-os/openclaw-runtime";
import {
  executionLeaseExpiresAt,
  isTaskExecutionStatus,
  taskExecutionStatusForRuntimeEvent,
} from "@/lib/server/agent-os/task-execution";
import {
  isPlanningRuntimeEvent,
  missionStatusForRuntimeEvent,
} from "@/lib/server/agent-os/runtime-event-lifecycle";
import { normalizeApprovalPolicy } from "@/lib/server/agent-os/approval-policy";
import { normalizeRuntimeArtifactEvidence } from "@/lib/server/agent-os/agent-evidence";

export const runtime = "nodejs";

/** Task fields consumed while a completed task releases its successor. */
type RuntimeTaskSnapshot = {
  id: string;
  sequence?: number;
  status?: string;
  title?: string;
  agent?: string;
  capability?: string;
  requiresApproval?: boolean;
  agentCandidateId?: string;
  agentCandidate?: { status?: unknown; source?: unknown };
};

function unauthorized() {
  return Response.json({ error: "Runtime não autorizado." }, { status: 401 });
}

/** Receives only signed, idempotent events from the private OpenClaw bridge. */
export async function POST(request: Request) {
  const secret = process.env.ALTUM_OPENCLAW_SHARED_SECRET?.trim() || "";
  const body = await request.text();
  if (
    !verifyOpenClawRuntimeSignature({
      body,
      secret,
      timestamp: request.headers.get("x-altum-runtime-timestamp"),
      signature: request.headers.get("x-altum-runtime-signature"),
    })
  )
    return unauthorized();

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  const parsed = openClawRuntimeEventSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      { error: "Contrato de evento inválido." },
      { status: 400 },
    );
  const event = parsed.data;

  const missionRef = adminDb.collection("agent_missions").doc(event.missionId);
  const dispatchRef = adminDb
    .collection("agent_runtime_dispatches")
    .doc(event.dispatchId);
  const executionRef = adminDb
    .collection("agent_task_executions")
    .doc(event.dispatchId);
  const eventRef = adminDb
    .collection("agent_runtime_events")
    .doc(runtimeEventDocumentId(event));
  const result = await adminDb
    .runTransaction(async (transaction) => {
      const [existingEvent, mission, dispatch, execution] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(missionRef),
        transaction.get(dispatchRef),
        transaction.get(executionRef),
      ]);
      if (existingEvent.exists)
        return {
          applied: false,
          conversationId: null as string | null,
          ownerId: null as string | null,
          followUp: null,
        };
      if (
        !mission.exists ||
        String(mission.get("tenantId") || "") !== event.tenantId
      )
        throw new Error("mission_tenant_mismatch");
      if (
        !dispatch.exists ||
        String(dispatch.get("missionId") || "") !== event.missionId ||
        String(dispatch.get("tenantId") || "") !== event.tenantId ||
        String(dispatch.get("runtime") || "") !== "openclaw"
      )
        throw new Error("runtime_dispatch_mismatch");
      // Task context is optional for older dispatches. When present, bind the
      // callback to the exact task that was placed in the signed envelope; a
      // runtime must never be able to attach evidence to another task.
      if (
        event.taskId &&
        String(dispatch.get("taskId") || "") !== event.taskId
      ) {
        throw new Error("runtime_task_mismatch");
      }
      // A delayed callback from an earlier execution must not overwrite the
      // current mission after an operator has restarted or re-dispatched it.
      const activeDispatchId = mission.get("runtimeDispatchId");
      if (
        typeof activeDispatchId === "string" &&
        activeDispatchId !== event.dispatchId
      ) {
        throw new Error("runtime_dispatch_superseded");
      }
      // A delayed progress/approval event must not reopen a finalized dispatch.
      // Preserve the terminal state even if the bridge delivers callbacks out of order.
      // Reconciled dispatches were explicitly resolved by an administrator;
      // late callbacks cannot override that decision or reopen the mission.
      const terminalDispatchStatuses = [
        "completed",
        "failed",
        "cancelled",
        "reconciled",
      ];
      if (
        terminalDispatchStatuses.includes(String(dispatch.get("status") || ""))
      ) {
        return {
          applied: false,
          conversationId: null as string | null,
          ownerId: null as string | null,
          followUp: null,
        };
      }

      const operation = String(dispatch.get("operation") || "execute");
      const planning = isPlanningRuntimeEvent(operation);
      const previousMissionStatus = String(mission.get("status") || "planned");
      const updates: Record<string, unknown> = {
        runtimeStatus: event.type,
        runtimeLastEventAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (planning) {
        updates.planningRuntimeStatus = event.type;
        updates.planningLastEventAt = FieldValue.serverTimestamp();
        if (typeof event.progress === "number")
          updates.planningProgress = event.progress;
        if (event.type === "mission.completed") {
          updates.planningProgress = 100;
          updates.planningCompletedAt = FieldValue.serverTimestamp();
        }
        if (event.type === "mission.failed")
          updates.planningFailure =
            event.message || "O runtime não concluiu o planejamento.";
      } else {
        const nextMissionStatus = missionStatusForRuntimeEvent(
          operation,
          event.type,
        );
        if (typeof event.progress === "number")
          updates.progress = event.progress;
        if (nextMissionStatus) updates.status = nextMissionStatus;
        if (event.type === "mission.completed") {
          updates.progress = 100;
          updates.completedAt = FieldValue.serverTimestamp();
        }
        if (event.type === "mission.failed")
          updates.runtimeFailure =
            event.message || "O runtime informou uma falha sem detalhes.";
      }
      let followUp: {
        tenantId: string;
        conversationId: string | null;
        title: string;
        objective: string;
        template: string;
        risk: "low" | "medium" | "high";
        budgetBrl: number;
        constraints: string[];
        task: {
          id: string;
          title: string;
          agent: string;
          capability: string;
          agentCandidateId: string | null;
          agentCandidateSource: string | null;
          agentCandidateStatus:
            "review_required" | "active" | "disabled" | "deprecated" | null;
        };
      } | null = null;
      // A task-scoped completion unlocks the next unit only after this event is
      // durably recorded. This is deliberately skipped for old mission-level
      // dispatches that lack task attribution.
      if (
        !planning &&
        operation === "execute" &&
        event.type === "mission.completed" &&
        event.taskId
      ) {
        const taskRef = adminDb.collection("agent_tasks").doc(event.taskId);
        const task = await transaction.get(taskRef);
        if (
          !task.exists ||
          String(task.get("missionId") || "") !== event.missionId ||
          String(task.get("tenantId") || "") !== event.tenantId
        ) {
          throw new Error("runtime_task_not_found");
        }
        const currentTaskStatus = String(task.get("status") || "queued");
        if (!["ready", "claimed", "running"].includes(currentTaskStatus))
          throw new Error("runtime_task_not_executable");
        const [taskList, policyDoc] = await Promise.all([
          transaction.get(
            adminDb
              .collection("agent_tasks")
              .where("missionId", "==", event.missionId),
          ),
          transaction.get(
            adminDb.collection("agent_approval_policies").doc(event.tenantId),
          ),
        ]);
        const orderedTasks = taskList.docs
          .map(
            (item) => ({ id: item.id, ...item.data() }) as RuntimeTaskSnapshot,
          )
          .sort(
            (left, right) =>
              Number(left.sequence || 0) - Number(right.sequence || 0),
          );
        const completedSequence = Number(task.get("sequence") || 0);
        const next = orderedTasks.find(
          (item) =>
            Number(item.sequence || 0) > completedSequence &&
            String(item.status || "queued") === "queued",
        );
        transaction.set(
          taskRef,
          {
            status: "completed",
            completedAt: FieldValue.serverTimestamp(),
            runtimeDispatchId: event.dispatchId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          adminDb
            .collection("agent_domain_events")
            .doc(`task_completed_${eventRef.id}`),
          {
            schemaVersion: 1,
            eventId: `task_completed_${eventRef.id}`,
            type: "task.status_changed",
            occurredAt: event.occurredAt,
            tenantId: event.tenantId,
            actor: { type: "runtime", id: "openclaw" },
            correlationId: event.missionId,
            causationId: event.eventId,
            missionId: event.missionId,
            taskId: event.taskId,
            payload: {
              from: currentTaskStatus,
              to: "completed",
              reason: event.message?.trim() || "Etapa concluída pelo executor.",
            },
            createdAt: FieldValue.serverTimestamp(),
          },
        );
        if (!next) {
          updates.status = "completed";
          updates.progress = 100;
          updates.completedAt = FieldValue.serverTimestamp();
        } else {
          const policy = normalizeApprovalPolicy(policyDoc.get("approvals"));
          const capability = String(next.capability || "");
          const needsApproval =
            next.requiresApproval === true ||
            (capability in policy &&
              policy[capability as keyof typeof policy] === true);
          const progress = Math.round(
            (completedSequence / orderedTasks.length) * 100,
          );
          if (needsApproval) {
            updates.status = "waiting_approval";
            updates.progress = progress;
            transaction.set(
              adminDb.collection("agent_tasks").doc(next.id),
              {
                status: "waiting_approval",
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            transaction.set(
              adminDb
                .collection("agent_domain_events")
                .doc(`task_next_${eventRef.id}`),
              {
                schemaVersion: 1,
                eventId: `task_next_${eventRef.id}`,
                type: "task.status_changed",
                occurredAt: event.occurredAt,
                tenantId: event.tenantId,
                actor: { type: "runtime", id: "openclaw" },
                correlationId: event.missionId,
                causationId: event.eventId,
                missionId: event.missionId,
                taskId: next.id,
                payload: {
                  from: "queued",
                  to: "waiting_approval",
                  reason: "Próxima etapa requer aprovação humana.",
                },
                createdAt: FieldValue.serverTimestamp(),
              },
            );
            transaction.set(
              adminDb
                .collection("agent_approvals")
                .doc(`runtime_next_${eventRef.id}`),
              {
                tenantId: event.tenantId,
                missionId: event.missionId,
                taskId: next.id,
                title: String(next.title || "Ação externa"),
                summary: `A etapa anterior foi concluída. A próxima etapa da missão “${String(mission.get("title") || "sem título")}” exige sua aprovação antes de seguir.`,
                actionType: capability || "EXTERNAL_ACTION",
                risk: mission.get("risk") === "high" ? "high" : "medium",
                proposedPayload: {},
                status: "pending",
                createdBy: "altum-openclaw-runtime",
                runtimeEventId: event.eventId,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
            );
          } else {
            updates.status = "running";
            updates.progress = progress;
            transaction.set(
              adminDb.collection("agent_tasks").doc(next.id),
              {
                status: "ready",
                startedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            transaction.set(
              adminDb
                .collection("agent_domain_events")
                .doc(`task_next_${eventRef.id}`),
              {
                schemaVersion: 1,
                eventId: `task_next_${eventRef.id}`,
                type: "task.status_changed",
                occurredAt: event.occurredAt,
                tenantId: event.tenantId,
                actor: { type: "runtime", id: "openclaw" },
                correlationId: event.missionId,
                causationId: event.eventId,
                missionId: event.missionId,
                taskId: next.id,
                payload: {
                  from: "queued",
                  to: "ready",
                  reason: "Próxima etapa liberada automaticamente.",
                },
                createdAt: FieldValue.serverTimestamp(),
              },
            );
            const candidateStatus = next.agentCandidate?.status;
            followUp = {
              tenantId: event.tenantId,
              conversationId:
                typeof mission.get("conversationId") === "string"
                  ? mission.get("conversationId")
                  : null,
              title: String(mission.get("title") || "Missão Altum"),
              objective: String(mission.get("objective") || ""),
              template: String(mission.get("template") || "custom"),
              risk:
                mission.get("risk") === "low" || mission.get("risk") === "high"
                  ? mission.get("risk")
                  : "medium",
              budgetBrl: Number(mission.get("budgetBrl") || 0),
              constraints: Array.isArray(mission.get("constraints"))
                ? mission.get("constraints").map(String).slice(0, 24)
                : [],
              task: {
                id: next.id,
                title: String(next.title || "Etapa da missão"),
                agent: String(next.agent || "Altum Agent"),
                capability,
                agentCandidateId:
                  typeof next.agentCandidateId === "string"
                    ? next.agentCandidateId
                    : null,
                agentCandidateSource:
                  typeof next.agentCandidate?.source === "string"
                    ? next.agentCandidate.source
                    : null,
                agentCandidateStatus:
                  candidateStatus === "review_required" ||
                  candidateStatus === "active" ||
                  candidateStatus === "disabled" ||
                  candidateStatus === "deprecated"
                    ? candidateStatus
                    : null,
              },
            };
          }
        }
      }
      transaction.set(missionRef, updates, { merge: true });
      // Mission state is a first-class domain fact as well. Task and execution
      // events explain the work; this event explains the operational outcome
      // shown to an administrator in the mission timeline.
      if (
        !planning &&
        typeof updates.status === "string" &&
        updates.status !== previousMissionStatus
      ) {
        transaction.set(
          adminDb
            .collection("agent_domain_events")
            .doc(`mission_runtime_${eventRef.id}`),
          {
            schemaVersion: 1,
            eventId: `mission_runtime_${eventRef.id}`,
            type: "mission.status_changed",
            occurredAt: event.occurredAt,
            tenantId: event.tenantId,
            actor: { type: "runtime", id: "openclaw" },
            correlationId: event.missionId,
            causationId: event.eventId,
            missionId: event.missionId,
            payload: {
              from: previousMissionStatus,
              to: updates.status,
              reason:
                event.message?.trim() || "Estado atualizado pelo executor.",
            },
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      }
      transaction.set(
        dispatchRef,
        {
          status:
            event.type === "mission.completed"
              ? "completed"
              : event.type === "mission.failed"
                ? "failed"
                : event.type === "mission.cancelled"
                  ? "cancelled"
                  : "running",
          lastEventId: event.eventId,
          lastEventType: event.type,
          lastEventAt: FieldValue.serverTimestamp(),
          ...(event.type === "mission.progress" ||
          event.type === "mission.await_approval"
            ? { leaseExpiresAt: executionLeaseExpiresAt() }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      // Dispatches created before the execution collection existed may still
      // finish after deployment. Backfill their minimal immutable identity from
      // the dispatch, then record the event without losing that completion.
      const previousExecutionStatus =
        execution.exists && isTaskExecutionStatus(execution.get("status"))
          ? execution.get("status")
          : null;
      const nextExecutionStatus = taskExecutionStatusForRuntimeEvent(
        event.type,
      );
      transaction.set(
        executionRef,
        {
          ...(execution.exists
            ? {}
            : {
                dispatchId: event.dispatchId,
                missionId: event.missionId,
                tenantId: event.tenantId,
                taskId:
                  typeof dispatch.get("taskId") === "string"
                    ? dispatch.get("taskId")
                    : null,
                taskTitle:
                  typeof dispatch.get("taskTitle") === "string"
                    ? dispatch.get("taskTitle")
                    : null,
                runtime: "openclaw",
                attempt: Math.max(
                  1,
                  Number(dispatch.get("deliveryAttempts") || 0),
                ),
                agentCandidateId:
                  typeof dispatch.get("agentCandidateId") === "string"
                    ? dispatch.get("agentCandidateId")
                    : null,
                createdAt: FieldValue.serverTimestamp(),
              }),
          status: nextExecutionStatus,
          lastEventId: event.eventId,
          lastEventType: event.type,
          lastEventAt: FieldValue.serverTimestamp(),
          ...(event.type === "mission.progress" ||
          event.type === "mission.await_approval"
            ? { leaseExpiresAt: executionLeaseExpiresAt() }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.set(eventRef, {
        ...event,
        receivedAt: FieldValue.serverTimestamp(),
      });
      // Runtime artifacts become first-class evidence instead of remaining
      // buried in an event payload or chat message. IDs are deterministic per
      // callback, so a retry cannot duplicate a deliverable in the mission.
      for (const [index, artifact] of (event.artifacts || []).entries()) {
        const evidence = normalizeRuntimeArtifactEvidence(artifact);
        transaction.set(
          adminDb
            .collection("agent_mission_evidence")
            .doc(`runtime_${eventRef.id}_${index}`),
          {
            id: `runtime_${eventRef.id}_${index}`,
            tenantId: event.tenantId,
            missionId: event.missionId,
            taskId: event.taskId || null,
            executionId: event.dispatchId,
            ...evidence,
            capturedAt: event.occurredAt,
            source: "openclaw_runtime",
            runtimeEventId: event.eventId,
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      }
      // One signed runtime callback maps to one immutable domain fact. The
      // deterministic document ID makes this idempotent alongside eventRef.
      if (previousExecutionStatus !== nextExecutionStatus) {
        transaction.set(
          adminDb
            .collection("agent_domain_events")
            .doc(`runtime_${eventRef.id}`),
          {
            schemaVersion: 1,
            eventId: `runtime_${eventRef.id}`,
            type: "task_execution.status_changed",
            occurredAt: event.occurredAt,
            tenantId: event.tenantId,
            actor: { type: "runtime", id: "openclaw" },
            correlationId: event.missionId,
            causationId: event.eventId,
            missionId: event.missionId,
            taskId: event.taskId || null,
            dispatchId: event.dispatchId,
            payload: {
              from: previousExecutionStatus,
              to: nextExecutionStatus,
              attempt: Math.max(
                1,
                Number(
                  execution.get("attempt") ||
                    dispatch.get("deliveryAttempts") ||
                    1,
                ),
              ),
              reason: event.message?.trim() || null,
            },
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      }
      // Audit and state changes must commit together for idempotent callbacks.
      transaction.set(
        adminDb.collection("audit_logs").doc("openclaw_" + eventRef.id),
        {
          type: "openclaw_runtime_event",
          tenantId: event.tenantId,
          missionId: event.missionId,
          taskId: event.taskId || null,
          runtimeEventId: event.eventId,
          runtimeEventType: event.type,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
      // Keep the conversation delivery atomic with the event. Otherwise a retry
      // after a partial failure sees a duplicate event and permanently loses the
      // assistant message or generated artifacts.
      const conversationId =
        typeof mission.get("conversationId") === "string"
          ? (mission.get("conversationId") as string)
          : null;
      const ownerId =
        typeof mission.get("createdBy") === "string"
          ? (mission.get("createdBy") as string)
          : null;
      const message = event.message?.trim();
      if (
        conversationId &&
        ownerId &&
        (message || (event.artifacts?.length ?? 0) > 0)
      ) {
        const messageRef = adminDb
          .collection("agent_command_messages")
          .doc(`runtime_${eventRef.id}`);
        transaction.set(messageRef, {
          ownerId,
          tenantId: event.tenantId,
          conversationId,
          missionId: event.missionId,
          taskId: event.taskId || null,
          role: "assistant",
          content:
            message || "O executor entregou novos arquivos para esta missão.",
          runtimeEventId: event.eventId,
          runtimeEventType: event.type,
          artifacts: event.artifacts || [],
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      if (
        !planning &&
        event.type === "mission.await_approval" &&
        event.approval
      ) {
        const approvalRef = adminDb
          .collection("agent_approvals")
          .doc(eventRef.id);
        transaction.set(
          approvalRef,
          {
            tenantId: event.tenantId,
            missionId: event.missionId,
            title: event.approval.title,
            summary: event.approval.summary,
            actionType: event.approval.actionType,
            risk: event.approval.risk,
            proposedPayload: event.approval.proposedPayload || {},
            status: "pending",
            createdBy: "altum-openclaw-runtime",
            runtimeEventId: event.eventId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      return {
        applied: true,
        conversationId:
          typeof mission.get("conversationId") === "string"
            ? (mission.get("conversationId") as string)
            : null,
        ownerId:
          typeof mission.get("createdBy") === "string"
            ? (mission.get("createdBy") as string)
            : null,
        followUp,
      };
    })
    .catch((error: unknown) => {
      console.error("Falha ao registrar evento do runtime:", error);
      throw error;
    });

  if (result.applied && result.followUp) {
    const { dispatchMissionToOpenClaw } =
      await import("@/lib/server/agent-os/openclaw-runtime");
    try {
      await dispatchMissionToOpenClaw({
        missionId: event.missionId,
        operation: "execute",
        actorId: "altum-openclaw-runtime",
        ...result.followUp,
      });
    } catch (error) {
      // The completed event and ready task are durable. A temporary failure to
      // enqueue the successor is observable in the mission and can be resumed
      // without repeating the completed work.
      console.error("Falha ao enfileirar a próxima etapa autônoma:", error);
    }
  }

  return Response.json({ ok: true, duplicate: !result.applied });
}
