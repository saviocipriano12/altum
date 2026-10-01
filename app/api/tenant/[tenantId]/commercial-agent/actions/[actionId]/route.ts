import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess } from "@/lib/server/commercial-access";
import { trackAppointmentOutcome } from "@/lib/server/ai/learning-outcomes";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import {
  evaluateCommercialAgentSla,
  normalizeCommercialAgentActionType,
} from "@/lib/commercial-agent-action";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

async function findConflict(tenantId: string, appointmentId: string, appointment: Record<string, unknown>) {
  const start = new Date(String(appointment.startAt || "")).getTime();
  const end = appointment.endAt ? new Date(String(appointment.endAt)).getTime() : start + 60 * 60 * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const snap = await adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(500).get();
  return snap.docs.find((doc) => {
    if (doc.id === appointmentId) return false;
    const data = doc.data();
    if (!["scheduled", "confirmed"].includes(clean(data.status, 40))) return false;
    const otherStart = new Date(String(data.startAt || "")).getTime();
    const otherEnd = data.endAt ? new Date(String(data.endAt)).getTime() : otherStart + 60 * 60 * 1000;
    if (!rangesOverlap(start, end, otherStart, otherEnd)) return false;
    const sameLead = clean(appointment.leadId, 180) && clean(data.leadId, 180) === clean(appointment.leadId, 180);
    const sameOwner = clean(data.ownerUserId, 180) === clean(appointment.ownerUserId, 180);
    return Boolean(sameLead || sameOwner);
  }) || null;
}

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; actionId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, actionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    const body = await req.json() as { decision?: string; note?: string };
    const decision = clean(body.decision, 40);
    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: "Decisao invalida. Use approved ou rejected." }, { status: 400 });
    }

    const actionRef = adminDb.collection("commercial_agent_actions").doc(actionId);
    const actionSnap = await actionRef.get();
    if (!actionSnap.exists) return NextResponse.json({ error: "Decisao nao encontrada." }, { status: 404 });
    const action = actionSnap.data() as Record<string, unknown>;
    if (clean(action.tenantId, 180) !== tenantId) return NextResponse.json({ error: "Decisao fora deste tenant." }, { status: 403 });
    if (clean(action.status, 40) !== "pending_approval") {
      return NextResponse.json({ error: "Esta decisao ja foi tratada." }, { status: 409 });
    }
    const actionType = normalizeCommercialAgentActionType(action.type);
    if (!actionType) return NextResponse.json({ error: "Tipo de decisao invalido." }, { status: 409 });
    const sla = evaluateCommercialAgentSla({
      type: actionType,
      status: "pending_approval",
      createdAt: action.createdAt,
      dueAt: action.dueAt,
      expiresAt: action.expiresAt,
      escalationLevel: action.escalationLevel,
    });
    if (sla.state === "expired") {
      return NextResponse.json({ error: "O prazo desta decisao expirou. Atualize a fila para receber uma nova recomendacao.", code: "commercial_action_expired" }, { status: 409 });
    }
    const leadId = clean(action.leadId, 180);
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    if (actionType === "review_charge") assertTenantCapability(membership, "manage_commercial");
    else assertTenantCapability(membership, "edit_leads");

    const referenceId = clean(action.referenceId, 180);
    if (clean(action.type, 60) === "review_appointment" && referenceId) {
      const appointmentRef = adminDb.collection("appointments").doc(referenceId);
      const appointmentSnap = await appointmentRef.get();
      if (!appointmentSnap.exists || clean(appointmentSnap.data()?.tenantId, 180) !== tenantId) {
        return NextResponse.json({ error: "Sugestao de agenda nao encontrada." }, { status: 404 });
      }
      const appointment = appointmentSnap.data() as Record<string, unknown>;
      if (decision === "approved") {
        const conflict = await findConflict(tenantId, referenceId, appointment);
        if (conflict) return NextResponse.json({ error: "O horario sugerido entrou em conflito. Ajuste na Agenda.", code: "appointment_conflict", conflictId: conflict.id }, { status: 409 });
        await appointmentRef.set({ status: "scheduled", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        await trackAppointmentOutcome({ tenantId, leadId, appointmentId: referenceId, status: "scheduled" });
        await dispatchLeadConversionEvents({ tenantId, leadId, appointmentId: referenceId, reason: "meeting_scheduled" }).catch((error) => console.error("Falha ao disparar conversao da sugestao aprovada:", error));
      } else {
        await appointmentRef.set({ status: "canceled", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        await trackAppointmentOutcome({ tenantId, leadId, appointmentId: referenceId, status: "canceled" });
      }
    }

    if (
      ["review_proposal", "review_charge"].includes(clean(action.type, 60)) &&
      clean(action.referenceCollection, 80) === "orcamentos" &&
      referenceId
    ) {
      const budgetRef = adminDb.collection("orcamentos").doc(referenceId);
      const budgetSnap = await budgetRef.get();
      if (!budgetSnap.exists || clean(budgetSnap.data()?.tenantId, 180) !== tenantId) {
        return NextResponse.json({ error: "Proposta vinculada nao encontrada." }, { status: 404 });
      }
      const field = clean(action.type, 60) === "review_charge" ? "chargeApprovalStatus" : "agentReviewStatus";
      await budgetRef.set({
        [field]: decision,
        [`${field}By`]: user.uid,
        [`${field}At`]: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await Promise.all([
      actionRef.set({
        status: decision,
        reviewNote: clean(body.note, 600) || null,
        reviewedBy: user.uid,
        reviewedByName: user.name,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      adminDb.collection("leads").doc(leadId).collection("events").add({
        type: `commercial_agent_action_${decision}`,
        title: decision === "approved" ? "Sugestao da IA aprovada" : "Sugestao da IA recusada",
        detail: clean(action.title, 180),
        actionId,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, actionId, status: decision });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao revisar decisao do agente comercial:", error);
    return NextResponse.json({ error: "Falha ao revisar decisao da IA." }, { status: 500 });
  }
}
