import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  TenantAccessError,
} from "@/lib/server/tenant";

type Body = {
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

const VALID_STATUSES = new Set(["scheduled", "confirmed", "completed", "canceled", "no_show"]);

type AppointmentItem = {
  id: string;
  startAt?: string | null;
  [key: string]: unknown;
};

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

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(240).get();
    const items: AppointmentItem[] = snap.docs
      .map((doc): AppointmentItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => new Date(String(a.startAt || 0)).getTime() - new Date(String(b.startAt || 0)).getTime());

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
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
    assertTenantCapability(membership, "edit_leads");

    const body = (await req.json()) as Body;
    const title = clean(body.title, 180);
    const startAt = parseIso(body.startAt);
    if (!title || !startAt) {
      return NextResponse.json({ error: "Campos obrigatorios: title e startAt." }, { status: 400 });
    }

    const leadId = clean(body.leadId, 140);
    let lead: Record<string, unknown> | null = null;
    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) {
        return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
      }
      lead = leadSnap.data() as Record<string, unknown>;
      if (String(lead.tenantId || "") !== tenantId) {
        return NextResponse.json({ error: "Lead fora do tenant informado." }, { status: 403 });
      }
    }

    const ownerUserId = clean(body.ownerUserId, 140) || clean(lead?.ownerId, 140) || user.uid;
    let ownerName = clean(lead?.owner, 180) || user.name;
    if (ownerUserId) {
      const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${ownerUserId}`).get();
      if (membershipSnap.exists) {
        ownerName = String((membershipSnap.data() as { name?: string }).name || ownerName);
      }
    }

    const status = clean(body.status, 40);
    const ref = await adminDb.collection("appointments").add({
      tenantId,
      leadId: leadId || null,
      leadName: clean(lead?.nome, 180) || null,
      leadCompany: clean(lead?.empresa, 180) || null,
      title,
      type: clean(body.type, 80) || "reuniao",
      status: VALID_STATUSES.has(status) ? status : "scheduled",
      startAt,
      endAt: parseIso(body.endAt),
      location: clean(body.location, 180) || null,
      meetingUrl: clean(body.meetingUrl, 500) || null,
      notes: clean(body.notes, 4000) || null,
      ownerUserId: ownerUserId || null,
      ownerName,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (leadId) {
      await adminDb.collection("leads").doc(leadId).collection("events").add({
        type: "appointment_created",
        title: "Agendamento criado",
        detail: `${title} agendado para ${new Date(startAt).toLocaleString("pt-BR")}.`,
        appointmentId: ref.id,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ ok: true, tenantId, id: ref.id });
  } catch (error) {
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
