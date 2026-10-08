import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { processAutomaticCreativeContinuations } from "@/lib/server/agent-os/creative-job-worker";
import { dispatchMissionToOpenClaw } from "@/lib/server/agent-os/openclaw-runtime";

function date(value: unknown) { return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null; }
function errorResponse(error: unknown) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha no Approval Center:", error); return Response.json({ error: "Não foi possível concluir a operação de aprovação." }, { status: 500 }); }

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const snap = await adminDb.collection("agent_approvals").orderBy("__name__").limit(200).get();
    return Response.json({ items: snap.docs.map((doc) => { const row = doc.data(); return { id: doc.id, tenantId: String(row.tenantId || ""), missionId: String(row.missionId || ""), taskId: typeof row.taskId === "string" ? row.taskId : null, title: String(row.title || "Ação sem título"), summary: String(row.summary || ""), actionType: String(row.actionType || "external_action"), risk: String(row.risk || "medium"), status: String(row.status || "pending"), createdAt: date(row.createdAt), decidedAt: date(row.decidedAt), decidedByName: typeof row.decidedByName === "string" ? row.decidedByName : null, decisionNote: typeof row.decisionNote === "string" ? row.decisionNote : "" }; }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const body = await request.json() as { id?: unknown; decision?: unknown; note?: unknown };
    const id = typeof body.id === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(body.id) ? body.id : "";
    const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!id || !decision) throw new RouteAuthError(400, "invalid_approval", "Informe a ação e uma decisão válida.");
    const ref = adminDb.collection("agent_approvals").doc(id);
    let creativeJobId: string | null = null;
    let approvedMissionId: string | null = null;
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new RouteAuthError(404, "approval_missing", "Solicitação de aprovação não encontrada.");
      const data = snap.data()!;
      if (data.status !== "pending") throw new RouteAuthError(409, "approval_decided", "Esta solicitação já recebeu uma decisão.");
      transaction.set(ref, { status: decision, decisionNote: note, decidedBy: actor.uid, decidedByName: actor.name, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (typeof data.taskId === "string" && data.taskId) {
        transaction.set(adminDb.collection("agent_tasks").doc(data.taskId), { status: decision === "approved" ? "ready" : "rejected", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      if (typeof data.missionId === "string" && data.missionId) {
        approvedMissionId = data.missionId;
        transaction.set(adminDb.collection("agent_missions").doc(data.missionId), { status: decision === "approved" ? "running" : "paused", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      if (typeof data.avatarJobId === "string" && data.avatarJobId) {
        transaction.set(adminDb.collection("avatar_jobs").doc(data.avatarJobId), { status: decision === "approved" ? "approved_for_anchor" : "rejected", approvedBy: actor.uid, approvedByName: actor.name, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      if (typeof data.creativeJobId === "string" && data.creativeJobId) {
        creativeJobId = data.creativeJobId;
        // Approval must have the same outcome whether it happened in the
        // conversation or in the legacy review screen: the durable worker,
        // not a browser request, starts the paid render exactly once.
        transaction.set(adminDb.collection("creative_jobs").doc(data.creativeJobId), {
          status: decision === "approved" ? "queued" : "rejected",
          autoStart: decision === "approved",
          approvedBy: actor.uid,
          approvedByName: actor.name,
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (typeof data.captureFormId === "string" && data.captureFormId) {
        transaction.set(adminDb.collection("capture_forms").doc(data.captureFormId), {
          status: decision === "approved" ? "active" : "draft",
          publishedAt: decision === "approved" ? FieldValue.serverTimestamp() : null,
          publishedBy: decision === "approved" ? actor.uid : null,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
          updatedByName: actor.name,
        }, { merge: true });
      }
      transaction.set(adminDb.collection("audit_logs").doc(), { type: `agent_approval_${decision}`, actorId: actor.uid, actorName: actor.name, tenantId: data.tenantId || null, missionId: data.missionId || null, approvalId: id, actionType: data.actionType || null, createdAt: FieldValue.serverTimestamp() });
    });
    let mediaStarted = false;
    if (decision === "approved" && creativeJobId) {
      try {
        // Rendering starts from the same server-side approval action. It is
        // deliberately awaited here instead of relying on a client refresh;
        // video providers may return a queued task, which is then pollable by
        // the durable media worker.
        const started = await processAutomaticCreativeContinuations({ jobId: creativeJobId, limit: 1 });
        mediaStarted = started.some((result) => result.jobId === creativeJobId);
      } catch (error) {
        // Approval itself is durable and must not be rolled back merely because
        // a downstream provider is briefly unavailable. The queued job remains
        // auditable and can be retried by the worker.
        console.error("A geração aprovada não pôde iniciar imediatamente:", error);
      }
    }
    let runtimeQueued = false;
    if (decision === "approved" && approvedMissionId) {
      // An approval made inside the conversation must resume the same durable
      // runtime workflow. Previously it only changed a Firestore status, which
      // left the mission looking "em execução" while no specialist received it.
      try {
        const mission = await adminDb.collection("agent_missions").doc(approvedMissionId).get();
        if (mission.exists) {
          const row = mission.data()!;
          const dispatch = await dispatchMissionToOpenClaw({
            missionId: approvedMissionId,
            tenantId: String(row.tenantId || ""),
            conversationId: typeof row.conversationId === "string" ? row.conversationId : null,
            title: String(row.title || "Missão Altum"),
            objective: String(row.objective || "Retomar a etapa aprovada."),
            template: String(row.template || "custom"),
            risk: row.risk === "low" || row.risk === "high" ? row.risk : "medium",
            budgetBrl: Number(row.budgetBrl || 0),
            constraints: Array.isArray(row.constraints) ? row.constraints.map(String).slice(0, 24) : [],
            operation: "execute",
            actorId: actor.uid,
          });
          runtimeQueued = dispatch.dispatched;
        }
      } catch (error) {
        // The approval and its business action remain durable. The next
        // explicit resume can queue the runtime again if the private worker is
        // temporarily unavailable.
        console.error("A missão aprovada não pôde ser retomada no runtime:", error);
      }
    }
    return Response.json({ ok: true, decision, creativeJobId: decision === "approved" ? creativeJobId : null, mediaStarted, runtimeQueued });
  } catch (error) { return errorResponse(error); }
}
