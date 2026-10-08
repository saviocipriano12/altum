import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { openClawRuntimeEventSchema, runtimeEventDocumentId, verifyOpenClawRuntimeSignature } from "@/lib/server/agent-os/openclaw-runtime";

export const runtime = "nodejs";

function unauthorized() {
  return Response.json({ error: "Runtime não autorizado." }, { status: 401 });
}

/** Receives only signed, idempotent events from the private OpenClaw bridge. */
export async function POST(request: Request) {
  const secret = process.env.ALTUM_OPENCLAW_SHARED_SECRET?.trim() || "";
  const body = await request.text();
  if (!verifyOpenClawRuntimeSignature({
    body,
    secret,
    timestamp: request.headers.get("x-altum-runtime-timestamp"),
    signature: request.headers.get("x-altum-runtime-signature"),
  })) return unauthorized();

  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return Response.json({ error: "Evento inválido." }, { status: 400 }); }
  const parsed = openClawRuntimeEventSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Contrato de evento inválido." }, { status: 400 });
  const event = parsed.data;

  const missionRef = adminDb.collection("agent_missions").doc(event.missionId);
  const dispatchRef = adminDb.collection("agent_runtime_dispatches").doc(event.dispatchId);
  const eventRef = adminDb.collection("agent_runtime_events").doc(runtimeEventDocumentId(event));
  const result = await adminDb.runTransaction(async (transaction) => {
    const [existingEvent, mission, dispatch] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(missionRef),
      transaction.get(dispatchRef),
    ]);
    if (existingEvent.exists) return { applied: false, conversationId: null as string | null, ownerId: null as string | null };
    if (!mission.exists || String(mission.get("tenantId") || "") !== event.tenantId) throw new Error("mission_tenant_mismatch");
    if (
      !dispatch.exists ||
      String(dispatch.get("missionId") || "") !== event.missionId ||
      String(dispatch.get("tenantId") || "") !== event.tenantId ||
      String(dispatch.get("runtime") || "") !== "openclaw"
    ) throw new Error("runtime_dispatch_mismatch");
    // A delayed callback from an earlier execution must not overwrite the
    // current mission after an operator has restarted or re-dispatched it.
    const activeDispatchId = mission.get("runtimeDispatchId");
    if (typeof activeDispatchId === "string" && activeDispatchId !== event.dispatchId) {
      throw new Error("runtime_dispatch_superseded");
    }
    // A delayed progress/approval event must not reopen a finalized dispatch.
    // Preserve the terminal state even if the bridge delivers callbacks out of order.
    // Reconciled dispatches were explicitly resolved by an administrator;
    // late callbacks cannot override that decision or reopen the mission.
    const terminalDispatchStatuses = ["completed", "failed", "cancelled", "reconciled"];
    if (terminalDispatchStatuses.includes(String(dispatch.get("status") || ""))) {
      return { applied: false, conversationId: null as string | null, ownerId: null as string | null };
    }

    const updates: Record<string, unknown> = {
      runtimeStatus: event.type,
      runtimeLastEventAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof event.progress === "number") updates.progress = event.progress;
    if (event.type === "mission.progress") updates.status = "running";
    if (event.type === "mission.await_approval") updates.status = "waiting_approval";
    if (event.type === "mission.completed") { updates.status = "completed"; updates.progress = 100; updates.completedAt = FieldValue.serverTimestamp(); }
    if (event.type === "mission.failed") { updates.status = "failed"; updates.runtimeFailure = event.message || "O runtime informou uma falha sem detalhes."; }
    if (event.type === "mission.cancelled") updates.status = "cancelled";
    transaction.set(missionRef, updates, { merge: true });
    transaction.set(dispatchRef, {
      status: event.type === "mission.completed" ? "completed" : event.type === "mission.failed" ? "failed" : event.type === "mission.cancelled" ? "cancelled" : "running",
      lastEventId: event.eventId,
      lastEventType: event.type,
      lastEventAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(eventRef, { ...event, receivedAt: FieldValue.serverTimestamp() });
    // Audit and state changes must commit together for idempotent callbacks.
    transaction.set(adminDb.collection("audit_logs").doc("openclaw_" + eventRef.id), {
      type: "openclaw_runtime_event",
      tenantId: event.tenantId,
      missionId: event.missionId,
      runtimeEventId: event.eventId,
      runtimeEventType: event.type,
      createdAt: FieldValue.serverTimestamp(),
    });
    // Keep the conversation delivery atomic with the event. Otherwise a retry
    // after a partial failure sees a duplicate event and permanently loses the
    // assistant message or generated artifacts.
    const conversationId = typeof mission.get("conversationId") === "string" ? mission.get("conversationId") as string : null;
    const ownerId = typeof mission.get("createdBy") === "string" ? mission.get("createdBy") as string : null;
    const message = event.message?.trim();
    if (conversationId && ownerId && (message || (event.artifacts?.length ?? 0) > 0)) {
      const messageRef = adminDb.collection("agent_command_messages").doc(`runtime_${eventRef.id}`);
      transaction.set(messageRef, {
        ownerId, tenantId: event.tenantId, conversationId, missionId: event.missionId,
        role: "assistant", content: message || "O executor entregou novos arquivos para esta missão.",
        runtimeEventId: event.eventId, runtimeEventType: event.type,
        artifacts: event.artifacts || [], createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (event.type === "mission.await_approval" && event.approval) {
      const approvalRef = adminDb.collection("agent_approvals").doc(eventRef.id);
      transaction.set(approvalRef, {
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
      }, { merge: true });
    }
    return {
      applied: true,
      conversationId: typeof mission.get("conversationId") === "string" ? mission.get("conversationId") as string : null,
      ownerId: typeof mission.get("createdBy") === "string" ? mission.get("createdBy") as string : null,
    };
  }).catch((error: unknown) => {
    console.error("Falha ao registrar evento do runtime:", error);
    throw error;
  });

  return Response.json({ ok: true, duplicate: !result.applied });
}
