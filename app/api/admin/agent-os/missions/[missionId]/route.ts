import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { createAgentApproval } from "@/lib/server/agent-os/approvals";
import { normalizeApprovalPolicy } from "@/lib/server/agent-os/approval-policy";
import { dispatchMissionToOpenClaw, type OpenClawMissionOperation } from "@/lib/server/agent-os/openclaw-runtime";

type RouteContext = { params: Promise<{ missionId: string }> };

/** Read-only reconciliation evidence. Never return envelopes, secrets or provider payloads. */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const { missionId } = await context.params;
    if (!validId(missionId)) throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const mission = await adminDb.collection("agent_missions").doc(missionId).get();
    if (!mission.exists) throw new RouteAuthError(404, "mission_missing", "Missão não encontrada.");
    const tenantId = String(mission.get("tenantId") || "");
    const dispatches = await adminDb.collection("agent_runtime_dispatches")
      .where("missionId", "==", missionId).limit(80).get();
    const pending = dispatches.docs.filter((doc) => doc.get("status") === "needs_reconciliation" && doc.get("tenantId") === tenantId);
    const items = await Promise.all(pending.map(async (doc) => {
      const events = await adminDb.collection("agent_runtime_events").where("dispatchId", "==", doc.id).limit(80).get();
      return {
        dispatchId: doc.id,
        missionId,
        tenantId,
        status: "needs_reconciliation",
        operation: typeof doc.get("operation") === "string" ? doc.get("operation") : null,
        deliveryAttempts: Number(doc.get("deliveryAttempts") || 0),
        failureCode: String(doc.get("failureCode") || ""),
        reconciliationStatus: String(doc.get("reconciliationStatus") || "pending_operator_review"),
        claimedAt: doc.get("claimedAt")?.toDate?.()?.toISOString?.() || null,
        events: events.docs.filter((event) => event.get("tenantId") === tenantId && event.get("missionId") === missionId)
          .map((event) => ({
            eventId: String(event.get("eventId") || ""),
            type: String(event.get("type") || ""),
            occurredAt: String(event.get("occurredAt") || ""),
            progress: typeof event.get("progress") === "number" ? event.get("progress") : null,
            artifactCount: Array.isArray(event.get("artifacts")) ? event.get("artifacts").length : 0,
          })),
      };
    }));
    return Response.json({ missionId, items, requiresReview: items.length > 0, note: "Verifique os recibos locais do worker antes de decidir. Esta consulta não reexecuta a missão." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}



/** Reconcile one ambiguous dispatch without creating a new execution. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { missionId } = await context.params;
    if (!validId(missionId)) throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const body = await request.json() as { dispatchId?: unknown; decision?: unknown; reason?: unknown };
    const dispatchId = typeof body.dispatchId === "string" ? body.dispatchId : "";
    const decision = body.decision;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!validId(dispatchId) || !["confirmed_completed", "confirmed_not_executed", "requires_investigation"].includes(String(decision)) || reason.length < 20 || reason.length > 2000) {
      throw new RouteAuthError(400, "invalid_reconciliation", "Informe despacho, decisão e justificativa de 20 a 2000 caracteres.");
    }
    const missionRef = adminDb.collection("agent_missions").doc(missionId);
    const dispatchRef = adminDb.collection("agent_runtime_dispatches").doc(dispatchId);
    const auditRef = adminDb.collection("audit_logs").doc();
    await adminDb.runTransaction(async (transaction) => {
      const [mission, dispatch] = await Promise.all([transaction.get(missionRef), transaction.get(dispatchRef)]);
      if (!mission.exists || !dispatch.exists) throw new RouteAuthError(404, "reconciliation_missing", "Missão ou despacho não encontrado.");
      if (String(dispatch.get("missionId") || "") !== missionId || String(dispatch.get("tenantId") || "") !== String(mission.get("tenantId") || "")) {
        throw new RouteAuthError(409, "reconciliation_mismatch", "Despacho não pertence a esta missão.");
      }
      if (dispatch.get("status") !== "needs_reconciliation") throw new RouteAuthError(409, "reconciliation_closed", "Este despacho não aguarda reconciliação.");
      // Repeating the same investigation decision is not a new finding.
      // Prevent accidental duplicate audit records from double-clicks or retries.
      if (decision === "requires_investigation" && dispatch.get("reconciliationStatus") === "requires_investigation" && dispatch.get("reconciliationReason") === reason) {
        throw new RouteAuthError(409, "reconciliation_unchanged", "Esta investigação já foi registrada com a mesma justificativa.");
      }
      const resolved = decision !== "requires_investigation";
      transaction.set(dispatchRef, {
        status: resolved ? "reconciled" : "needs_reconciliation",
        reconciliationStatus: decision,
        reconciliationReason: reason,
        reconciliationBy: actor.uid,
        reconciliationAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(auditRef, {
        type: "agent_runtime_reconciliation",
        actorId: actor.uid, tenantId: mission.get("tenantId"), missionId, dispatchId,
        decision, reason, createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true, dispatchId, decision });
  } catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no runtime de missão:", error);
  return Response.json({ error: "Não foi possível atualizar a missão." }, { status: 500 });
}

function validId(value: string) { return /^[A-Za-z0-9_-]{1,180}$/.test(value); }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { missionId } = await context.params;
    if (!validId(missionId)) throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const body = await request.json() as { action?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    if (!["start", "pause", "advance", "cancel"].includes(action)) throw new RouteAuthError(400, "invalid_action", "Ação de missão inválida.");
    const missionRef = adminDb.collection("agent_missions").doc(missionId);
    const missionSnap = await missionRef.get();
    if (!missionSnap.exists) throw new RouteAuthError(404, "mission_missing", "Missão não encontrada.");
    const mission = missionSnap.data()!;
    // An unresolved dispatch may have already performed its operation. Never
    // start or advance another execution before reviewing the previous receipt.
    if (action === "start" || action === "advance") {
      const unresolved = await adminDb.collection("agent_runtime_dispatches")
        .where("missionId", "==", missionId).limit(80).get();
      if (unresolved.docs.some((doc) => doc.get("status") === "needs_reconciliation")) {
        throw new RouteAuthError(409, "mission_reconciliation_required", "Revise os despachos interrompidos antes de iniciar ou avançar esta missão.");
      }
    }
    const taskSnap = await adminDb.collection("agent_tasks").where("missionId", "==", missionId).limit(80).get();
    const tasks = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
    const status = String(mission.status || "planned");

    let runtimeOperation: OpenClawMissionOperation | null = null;
    if (action === "cancel") {
      if (["completed", "cancelled"].includes(status)) throw new RouteAuthError(409, "mission_closed", "Esta missão já está encerrada.");
      await missionRef.set({ status: "cancelled", updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      runtimeOperation = "cancel";
    } else if (action === "pause") {
      if (!["running", "waiting_approval"].includes(status)) throw new RouteAuthError(409, "mission_not_running", "Somente missões em andamento podem ser pausadas.");
      await missionRef.set({ status: "paused", updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      runtimeOperation = "pause";
    } else if (action === "start") {
      if (!["planned", "paused"].includes(status)) throw new RouteAuthError(409, "mission_not_startable", "Esta missão não pode ser iniciada agora.");
      const first = tasks.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)).find((task) => ["ready", "queued"].includes(String(task.status)));
      if (!first) throw new RouteAuthError(409, "mission_has_no_tasks", "Esta missão não tem tarefas disponíveis.");
      const batch = adminDb.batch();
      batch.set(missionRef, { status: "running", updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      batch.set(adminDb.collection("agent_tasks").doc(first.id as string), { status: "ready", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
      runtimeOperation = "execute";
    } else {
      if (status !== "running") throw new RouteAuthError(409, "mission_not_running", "Inicie a missão antes de avançar o runtime.");
      const ordered = tasks.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
      const active = ordered.find((task) => task.status === "ready");
      if (!active) throw new RouteAuthError(409, "task_not_ready", "Não há tarefa pronta para avançar.");
      const next = ordered.find((task) => Number(task.sequence || 0) > Number(active.sequence || 0) && task.status === "queued");
      const batch = adminDb.batch();
      const policyDoc = next
        ? await adminDb.collection("agent_approval_policies").doc(String(mission.tenantId || "")).get()
        : null;
      const policy = normalizeApprovalPolicy(policyDoc?.get("approvals"));
      const nextCapability = String(next?.capability || "");
      const needsApproval = next?.requiresApproval === true || (nextCapability in policy && policy[nextCapability as keyof typeof policy] === true);
      batch.set(adminDb.collection("agent_tasks").doc(active.id as string), { status: "completed", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (!next) {
        batch.set(missionRef, { status: "completed", progress: 100, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      } else {
        if (needsApproval) {
        batch.set(adminDb.collection("agent_tasks").doc(next.id as string), { status: "waiting_approval", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        batch.set(missionRef, { status: "waiting_approval", progress: Math.round((Number(active.sequence || 0) / ordered.length) * 100), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
        } else {
        batch.set(adminDb.collection("agent_tasks").doc(next.id as string), { status: "ready", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        batch.set(missionRef, { status: "running", progress: Math.round((Number(active.sequence || 0) / ordered.length) * 100), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
        }
      }
      await batch.commit();
      if (next && needsApproval) {
        await createAgentApproval({ tenantId: String(mission.tenantId || ""), missionId, taskId: String(next.id), title: String(next.title || "Ação externa"), summary: `A missão “${String(mission.title || "sem título")}” atingiu um checkpoint que exige decisão humana antes de continuar.`, actionType: String(next.capability || "EXTERNAL_ACTION"), risk: String(mission.risk || "medium") === "high" ? "high" : "medium", createdBy: actor.uid });
      }
    }
    if (runtimeOperation) {
      await dispatchMissionToOpenClaw({
        missionId,
        tenantId: String(mission.tenantId || ""),
        conversationId: typeof mission.conversationId === "string" ? mission.conversationId : null,
        title: String(mission.title || "Missão Altum"),
        objective: String(mission.objective || ""),
        template: String(mission.template || "custom"),
        risk: mission.risk === "high" || mission.risk === "low" ? mission.risk : "medium",
        budgetBrl: Number(mission.budgetBrl || 0),
        constraints: Array.isArray(mission.constraints) ? mission.constraints.map(String).slice(0, 24) : [],
        operation: runtimeOperation,
        actorId: actor.uid,
      });
    }
    await adminDb.collection("audit_logs").add({ type: `agent_mission_${action}`, actorId: actor.uid, actorName: actor.name, tenantId: mission.tenantId || null, missionId, createdAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
