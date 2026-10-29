import {commitAppointmentChange, AppointmentChangeError, appointmentDateIso as parseIso} from "@/lib/server/crm/appointment-mutation";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import { trackAppointmentOutcome } from "@/lib/server/ai/learning-outcomes";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { upsertLeadCommercialDossier } from "@/lib/server/ai/lead-dossier";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";

type Body = {
  expectedVersion?: number;
  expectedRevision?: string;
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

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; appointmentId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, appointmentId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "edit_leads");

    const ref = adminDb.collection("appointments").doc(appointmentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Agendamento nao encontrado." }, { status: 404 });
    }

    const current = snap.data() as Record<string, unknown>;
    if (String(current.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Agendamento fora do tenant informado." }, { status: 403 });
    }
    assertAssignedCommercialRecordAccess(membership, user.uid, current);

    const body = (await req.json()) as Body;
    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };
    const changes: string[] = [];

    const title = clean(body.title, 180);
    if (body.title !== undefined && title !== clean(current.title, 180)) {
      patch.title = title;
      changes.push(`titulo: ${title}`);
    }

    const type = clean(body.type, 80);
    if (body.type !== undefined && type !== clean(current.type, 80)) {
      patch.type = type || "reuniao";
      changes.push("tipo atualizado");
    }

    const status = clean(body.status, 40);
    if (body.status !== undefined && VALID_STATUSES.has(status) && status !== clean(current.status, 40)) {
      patch.status = status;
      changes.push(`status: ${status}`);
    }

    const startAt = parseIso(body.startAt);
    if (body.startAt !== undefined && !startAt) {
      return NextResponse.json({ error: "Informe uma data de início válida.", code: "invalid_appointment_range" }, { status: 400 });
    }
    if (body.startAt !== undefined && startAt !== String(current.startAt || "")) {
      patch.startAt = startAt;
      changes.push("inicio atualizado");
    }

    const endAt = parseIso(body.endAt);
    if (body.endAt && !endAt) {
      return NextResponse.json({ error: "Informe uma data de fim válida.", code: "invalid_appointment_range" }, { status: 400 });
    }
    if (body.endAt !== undefined && endAt !== String(current.endAt || "")) {
      patch.endAt = endAt;
      changes.push("fim atualizado");
    }

    const location = clean(body.location, 180);
    if (body.location !== undefined && location !== clean(current.location, 180)) {
      patch.location = location || null;
      changes.push("local atualizado");
    }

    const meetingUrl = clean(body.meetingUrl, 500);
    if (body.meetingUrl !== undefined && meetingUrl !== clean(current.meetingUrl, 500)) {
      patch.meetingUrl = meetingUrl || null;
      changes.push("link atualizado");
    }

    const notes = clean(body.notes, 4000);
    if (body.notes !== undefined && notes !== clean(current.notes, 4000)) {
      patch.notes = notes || null;
      changes.push("notas atualizadas");
    }

    const ownerUserId = clean(body.ownerUserId, 140);
    if (body.ownerUserId !== undefined && ownerUserId !== clean(current.ownerUserId, 140)) {
      if (!hasTeamWideCommercialAccess(membership)) {
        throw new TenantAccessError(
          "appointment_transfer_denied",
          "Somente gestores podem transferir um compromisso para outro vendedor."
        );
      }
      patch.ownerUserId = ownerUserId || null;
      if (ownerUserId) {
        const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${ownerUserId}`).get();
        if (membershipSnap.exists) {
          patch.ownerName = String((membershipSnap.data() as { name?: string }).name || current.ownerName || user.name);
        }
      } else {
        patch.ownerName = null;
      }
      changes.push("responsavel atualizado");
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, tenantId, appointmentId, unchanged: true });
    }

    const nextStatus =
      body.status !== undefined && VALID_STATUSES.has(status) ? status : clean(current.status, 40) || "scheduled";
    const nextStartAt = String(patch.startAt || current.startAt || "");
    const nextEndAt = String(patch.endAt || current.endAt || "") || (nextStartAt ? addMinutes(nextStartAt, 60) : "");
    const leadId = clean(current.leadId, 140);

    if ((body.startAt !== undefined || body.endAt !== undefined) &&
      (!nextStartAt || !nextEndAt || new Date(nextEndAt).getTime() <= new Date(nextStartAt).getTime())) {
      return NextResponse.json({ error: "O fim do compromisso deve ser posterior ao início.", code: "invalid_appointment_range" }, { status: 400 });
    }

    const mutation = await commitAppointmentChange({tenantId, appointmentId, userId: user.uid, userName: user.name,
      expected: snap, patch, expectedVersion: body.expectedVersion, expectedRevision: body.expectedRevision, detail: changes.join(" | ")});

    if (leadId) {
      await trackAppointmentOutcome({
        tenantId,
        leadId,
        appointmentId,
        status: nextStatus,
      });

      if (nextStatus === "scheduled" || nextStatus === "confirmed") {
        await dispatchLeadConversionEvents({
          tenantId,
          leadId,
          appointmentId,
          reason: "meeting_scheduled",
        }).catch((error) => {
          console.error("Falha ao disparar conversao de reuniao agendada:", error);
        });
      }

      if (nextStatus === "completed") {
        await dispatchLeadConversionEvents({
          tenantId,
          leadId,
          appointmentId,
          reason: "meeting_completed",
        }).catch((error) => {
          console.error("Falha ao disparar conversao de reuniao concluida:", error);
        });

        const leadSnap = await adminDb.collection("leads").doc(leadId).get();
        if (leadSnap.exists) {
          await upsertLeadCommercialDossier({
            tenantId,
            leadId,
            trigger: "appointment_completed",
            appointmentId,
            sourceId: appointmentId,
            lead: leadSnap.data() as Record<string, unknown>,
            appointment: {
              ...current,
              ...patch,
              id: appointmentId,
              status: nextStatus,
            },
            actorId: user.uid,
            actorName: user.name,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, tenantId, appointmentId, version: mutation.version });
  } catch (error) {
    if (error instanceof AppointmentChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar agendamento do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar agendamento." }, { status: 500 });
  }
}
