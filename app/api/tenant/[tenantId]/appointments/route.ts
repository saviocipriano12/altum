import { readQueryPages } from "@/lib/server/query-pages";
import { NextResponse } from "next/server";
import {createManualAppointment, appointmentDateIso as parseIso, AppointmentChangeError} from "@/lib/server/crm/appointment-mutation";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  TenantAccessError,
} from "@/lib/server/tenant";
import { trackAppointmentOutcome } from "@/lib/server/ai/learning-outcomes";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { upsertLeadCommercialDossier } from "@/lib/server/ai/lead-dossier";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess, canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";

type Body = {
  requestId?: string;
  leadId?: string | null;
  title?: string;
  type?: string;
  status?: string;
  startAt?: string;
  endAt?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  ownerUserId?: string | null;
};

const VALID_STATUSES = new Set(["draft", "scheduled", "confirmed", "completed", "canceled", "no_show"]);

type AppointmentItem = {
  id: string;
  startAt?: string | null;
  [key: string]: unknown;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantRole(membership, "client_viewer");

    const snap = await readQueryPages(adminDb.collection("appointments").where("tenantId", "==", tenantId));
    const items: AppointmentItem[] = snap.docs
      .map((doc): AppointmentItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
        expectedRevision: `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`,
      }))
      .filter((appointment) => canAccessAssignedCommercialRecord(membership, user.uid, appointment))
      .sort((a, b) => new Date(String(a.startAt || 0)).getTime() - new Date(String(b.startAt || 0)).getTime());

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof AppointmentChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar agenda do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar agenda." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "edit_leads");

    const body = (await req.json()) as Body;
    const title = clean(body.title, 180);
    const startAt = parseIso(body.startAt);
    if (!title || !startAt) {
      return NextResponse.json({ error: "Campos obrigatorios: title e startAt." }, { status: 400 });
    }

    const leadId = clean(body.leadId, 140);
    let lead: Record<string, unknown> | null = null;
    let expectedLead: FirebaseFirestore.DocumentSnapshot | undefined;
    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) {
        return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
      }
      expectedLead = leadSnap;
      lead = leadSnap.data() as Record<string, unknown>;
      if (String(lead.tenantId || "") !== tenantId) {
        return NextResponse.json({ error: "Lead fora do tenant informado." }, { status: 403 });
      }
      assertAssignedCommercialRecordAccess(membership, user.uid, lead);
    }

    const status = clean(body.status, 40);
    const appointmentStatus = VALID_STATUSES.has(status) ? status : "scheduled";
    const endAt = parseIso(body.endAt) || addMinutes(startAt, 60);
    if ((body.endAt && !parseIso(body.endAt)) || new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json({ error: "O fim do compromisso deve ser posterior ao início.", code: "invalid_appointment_range" }, { status: 400 });
    }
    const created = await createManualAppointment({tenantId, userId: user.uid, userName: user.name, leadId,
      expectedLead, ownerUserId: clean(body.ownerUserId, 140) || null, requestId: body.requestId,
      data: {title, type: clean(body.type, 80) || "reuniao", status: appointmentStatus, startAt, endAt,
        location: clean(body.location, 180) || null, meetingUrl: clean(body.meetingUrl, 500) || null, notes: clean(body.notes, 4000) || null}});
    const ref = adminDb.collection("appointments").doc(created.appointmentId);
    if (created.deduped) return NextResponse.json({ok: true, tenantId, id: ref.id, deduped: true});
    if (leadId) {
      await trackAppointmentOutcome({
        tenantId,
        leadId,
        appointmentId: ref.id,
        status: appointmentStatus,
      });

      if (appointmentStatus === "scheduled" || appointmentStatus === "confirmed") {
        await dispatchLeadConversionEvents({
          tenantId,
          leadId,
          appointmentId: ref.id,
          reason: "meeting_scheduled",
        }).catch((error) => {
          console.error("Falha ao disparar conversao de reuniao agendada:", error);
        });

        await upsertLeadCommercialDossier({
          tenantId,
          leadId,
          trigger: "appointment_scheduled",
          appointmentId: ref.id,
          sourceId: ref.id,
          lead,
          appointment: {
            title,
            startAt,
            endAt,
            location: clean(body.location, 180) || null,
            meetingUrl: clean(body.meetingUrl, 500) || null,
            notes: clean(body.notes, 4000) || null,
            ownerName: created.ownerName,
          },
          actorId: user.uid,
          actorName: user.name,
        });
      }
    }

    return NextResponse.json({ ok: true, tenantId, id: ref.id });
  } catch (error) {
    if (error instanceof AppointmentChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar agendamento do tenant:", error);
    return NextResponse.json({ error: "Falha ao criar agendamento." }, { status: 500 });
  }
}
