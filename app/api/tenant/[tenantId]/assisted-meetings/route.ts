import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import {observeAssistedMeeting, commitAssistedMeeting, AssistedMeetingChangeError} from "@/lib/server/crm/assisted-meeting-mutation";
import { upsertLeadCommercialDossier } from "@/lib/server/ai/lead-dossier";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import {
  generateAssistedMeetingSummary,
  summaryToMarkdown,
} from "@/lib/server/ai/meeting-assistant";

type Body = {
  requestId?: string;
  completeAppointment?: boolean;
  appointmentId?: string | null;
  leadId?: string | null;
  title?: string;
  transcript?: string;
  notes?: string;
  objective?: string;
  language?: string;
  meetingUrl?: string | null;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function normalizeSession(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    appointmentId: clean(data.appointmentId, 180) || null,
    leadId: clean(data.leadId, 180) || null,
    leadName: clean(data.leadName, 180) || null,
    title: clean(data.title, 180) || "Reuniao assistida",
    objective: clean(data.objective, 500),
    language: clean(data.language, 40) || "pt_BR",
    meetingUrl: clean(data.meetingUrl, 800) || null,
    summary: data.summary || null,
    dossierStatus: data.dossierStatus || null,
    markdown: clean(data.markdown, 10000),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function resolveAppointment(tenantId: string, appointmentId: string) {
  if (!appointmentId) return { ref: null, data: null as Record<string, unknown> | null };
  const ref = adminDb.collection("appointments").doc(appointmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new RouteAuthError(404, "appointment_not_found", "Reuniao nao encontrada.");
  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId, 160) !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Reuniao fora do tenant informado.");
  }
  return { ref, data };
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb
      .collection("assisted_meetings")
      .where("tenantId", "==", tenantId)
      .limit(80)
      .get();

    const leadIds = [...new Set(snap.docs.map(doc => doc.data().leadId).filter((id): id is string => typeof id === "string" && Boolean(id) && id.length <= 180 && !id.includes("/")))];
    const parents = leadIds.length ? await adminDb.getAll(...leadIds.map(id => adminDb.collection("leads").doc(id))) : [];
    const byId = new Map(parents.map(parent => [parent.id, parent]));
    const items = snap.docs.filter(doc => {
      const data = doc.data(), parent = byId.get(data.leadId);
      if (!parent?.exists || parent.data()?.tenantId !== tenantId || !canAccessAssignedCommercialRecord(membership, user.uid, parent.data()!)) return false;
      if (data.sourceLeadGeneration) return typeof data.sourceLeadGeneration.isEqual === "function" && data.sourceLeadGeneration.isEqual(parent.createTime);
      // Legacy sessions cannot belong to a parent created after their own record.
      return doc.createTime.seconds > parent.createTime!.seconds || doc.createTime.seconds === parent.createTime!.seconds && doc.createTime.nanoseconds >= parent.createTime!.nanoseconds;
    }).map(normalizeSession).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar reunioes assistidas:", error);
    return NextResponse.json({ error: "Falha ao listar reunioes assistidas." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertTenantCapability(membership, "edit_leads");

    const body = (await req.json().catch(() => ({}))) as Body;
    const appointmentId = clean(body.appointmentId, 180);
    if (body.appointmentId != null && (typeof body.appointmentId !== "string" || body.appointmentId !== appointmentId || appointmentId.includes("/")) ||
      body.leadId != null && (typeof body.leadId !== "string" || body.leadId !== clean(body.leadId, 180) || body.leadId.includes("/"))) throw new AssistedMeetingChangeError(400, "meeting_context_invalid", "Cliente ou compromisso inválido.");
    const {data: appointment} = await resolveAppointment(tenantId, appointmentId);
    const leadId = clean(body.leadId, 180) || clean(appointment?.leadId, 180);
    if (!leadId) return NextResponse.json({error: "Selecione um cliente ou compromisso vinculado."}, {status: 400});
    if (body.requestId !== undefined && typeof body.requestId !== "string" || body.completeAppointment !== undefined && typeof body.completeAppointment !== "boolean") throw new AssistedMeetingChangeError(400, "meeting_input_invalid", "Pedido da reunião inválido.");
    const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 80000) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 8000) : "";
    if (!transcript && !notes) return NextResponse.json({error: "Informe transcrição ou notas da reunião."}, {status: 400});
    const input = {tenantId, actorId: user.uid, actorName: user.name, leadId, appointmentId, requestId: body.requestId,
      data: {title: clean(body.title, 180), transcript, notes, objective: clean(body.objective, 700) || "Transformar a reunião em próximos passos comerciais claros.",
        language: clean(body.language, 40) || "pt_BR", meetingUrl: clean(body.meetingUrl, 800) || null, completeAppointment: body.completeAppointment === true}};
    const observed = await observeAssistedMeeting(input);
    if (!observed.replayed) {
      const summary = await generateAssistedMeetingSummary({transcript, notes, objective: input.data.objective, language: input.data.language,
        lead: observed.lead.data()!, appointment: observed.appointment?.data() || null});
      await commitAssistedMeeting({...input, observed, summary, markdown: summaryToMarkdown(summary)});
    }
    let saved = await observed.sessionRef.get();
    if (!saved.exists) throw new AssistedMeetingChangeError(409, "meeting_removed", "O registro da reunião foi removido. Atualize antes de tentar novamente.");
    if (saved.data()?.dossierStatus === "pending") {
      const data = saved.data()!;
      await upsertLeadCommercialDossier({tenantId, leadId, trigger: data.completeAppointment ? "appointment_completed" : "meeting_analyzed",
        appointmentId: appointmentId || null, sourceId: saved.id, assistedMeetingFence: saved,
        actorId: user.uid, actorName: user.name, appointment: observed.appointment?.data() || null})
        .catch(error => console.error("Reunião salva; brief aguardando revisão ou recuperação:", error));
      saved = await observed.sessionRef.get();
    }
    return NextResponse.json({ok: true, tenantId, id: saved.id, item: normalizeSession(saved), replayed: observed.replayed});
  } catch (error) {
    if (error instanceof AssistedMeetingChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao salvar reuniao assistida:", error);
    return NextResponse.json({ error: "Falha ao salvar reuniao assistida." }, { status: 500 });
  }
}
