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

type Body = {
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

const VALID_STATUSES = new Set(["scheduled", "confirmed", "completed", "canceled", "no_show"]);

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseIso(value: unknown) {
  const text = clean(value, 80);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

async function findAppointmentConflict(input: {
  tenantId: string;
  appointmentId: string;
  startAt: string;
  endAt: string;
  ownerUserId?: string | null;
  leadId?: string | null;
}) {
  const startMs = new Date(input.startAt).getTime();
  const endMs = new Date(input.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  const snap = await adminDb.collection("appointments").where("tenantId", "==", input.tenantId).limit(500).get();
  const ownerUserId = clean(input.ownerUserId, 140);
  const leadId = clean(input.leadId, 140);

  return (
    snap.docs.find((doc) => {
      if (doc.id === input.appointmentId) return false;
      const data = doc.data() as Record<string, unknown>;
      const status = clean(data.status, 40) || "scheduled";
      if (!["scheduled", "confirmed"].includes(status)) return false;

      const currentStart = new Date(String(data.startAt || "")).getTime();
      const currentEnd = data.endAt
        ? new Date(String(data.endAt)).getTime()
        : currentStart + 60 * 60 * 1000;
      if (!Number.isFinite(currentStart) || !Number.isFinite(currentEnd)) return false;
      if (!rangesOverlap(startMs, endMs, currentStart, currentEnd)) return false;

      const sameLead = leadId && clean(data.leadId, 140) === leadId;
      const currentOwner = clean(data.ownerUserId, 140);
      const sameOwner = ownerUserId ? currentOwner === ownerUserId : !currentOwner;
      return Boolean(sameLead || sameOwner);
    }) || null
  );
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; appointmentId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, appointmentId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
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
    if (body.startAt !== undefined && startAt !== String(current.startAt || "")) {
      patch.startAt = startAt;
      changes.push("inicio atualizado");
    }

    const endAt = parseIso(body.endAt);
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
    const nextOwnerUserId =
      body.ownerUserId !== undefined ? clean(body.ownerUserId, 140) : clean(current.ownerUserId, 140);
    const leadId = clean(current.leadId, 140);

    if (["scheduled", "confirmed"].includes(nextStatus) && nextStartAt && nextEndAt) {
      const conflict = await findAppointmentConflict({
        tenantId,
        appointmentId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        ownerUserId: nextOwnerUserId,
        leadId,
      });
      if (conflict) {
        return NextResponse.json(
          {
            error: "Horario indisponivel para este responsavel ou lead.",
            code: "appointment_conflict",
            conflictId: conflict.id,
          },
          { status: 409 }
        );
      }
    }

    await ref.set(patch, { merge: true });

    if (leadId) {
      await adminDb.collection("leads").doc(leadId).collection("events").add({
        type: "appointment_updated",
        title: "Agendamento atualizado",
        detail: changes.join(" | "),
        appointmentId,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      });

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
      }
    }

    return NextResponse.json({ ok: true, tenantId, appointmentId });
  } catch (error) {
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
