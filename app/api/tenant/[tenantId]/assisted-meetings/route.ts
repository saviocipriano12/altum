import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { upsertLeadCommercialDossier } from "@/lib/server/ai/lead-dossier";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  generateAssistedMeetingSummary,
  summaryToMarkdown,
  type AssistedMeetingSummary,
} from "@/lib/server/ai/meeting-assistant";

type Body = {
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

function normalizeSession(doc: FirebaseFirestore.QueryDocumentSnapshot) {
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
    markdown: clean(data.markdown, 10000),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function compactSummary(summary: AssistedMeetingSummary) {
  return {
    temperature: summary.qualification.temperature,
    confidence: summary.qualification.confidence,
    recommendedStage: summary.qualification.recommendedStage,
    executiveSummary: summary.executiveSummary,
    nextSteps: summary.nextSteps,
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

async function resolveLead(tenantId: string, leadId: string) {
  if (!leadId) return { ref: null, data: null as Record<string, unknown> | null };
  const ref = adminDb.collection("leads").doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId, 160) !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Lead fora do tenant informado.");
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

    const items = snap.docs
      .map(normalizeSession)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

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
    const { ref: appointmentRef, data: appointment } = await resolveAppointment(tenantId, appointmentId);
    const leadId = clean(body.leadId, 180) || clean(appointment?.leadId, 180);
    const { ref: leadRef, data: lead } = await resolveLead(tenantId, leadId);
    if (!leadRef || !lead) {
      return NextResponse.json({ error: "Selecione um lead ou uma reuniao vinculada a um lead." }, { status: 400 });
    }

    const transcript = clean(body.transcript, 16000);
    const notes = clean(body.notes, 4000);
    if (!transcript && !notes) {
      return NextResponse.json({ error: "Informe transcricao ou notas da reuniao." }, { status: 400 });
    }

    const title = clean(body.title, 180) || clean(appointment?.title, 180) || "Reuniao assistida";
    const meetingUrl = clean(body.meetingUrl, 800) || clean(appointment?.meetingUrl, 800) || null;
    const objective = clean(body.objective, 700) || "Transformar a reuniao em proximos passos comerciais claros.";
    const language = clean(body.language, 40) || "pt_BR";
    const summary = await generateAssistedMeetingSummary({
      transcript,
      notes,
      objective,
      language,
      lead,
      appointment,
    });
    const markdown = summaryToMarkdown(summary);
    const sessionRef = adminDb.collection("assisted_meetings").doc();

    const session = {
      tenantId,
      appointmentId: appointmentId || null,
      leadId,
      leadName: clean(lead.nome, 180) || null,
      title,
      objective,
      language,
      meetingUrl,
      transcript,
      notes,
      summary,
      markdown,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const writes: Promise<unknown>[] = [
      sessionRef.set(session),
      leadRef.set(
        {
          lastAssistedMeetingId: sessionRef.id,
          lastAssistedMeetingAt: FieldValue.serverTimestamp(),
          aiLeadSummary: summary.executiveSummary,
          aiCommercialTemperature: summary.qualification.temperature,
          aiNextAction: summary.nextSteps[0] || summary.crmUpdate,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      leadRef.collection("documents").doc(`assisted_meeting_${sessionRef.id}`).set(
        {
          id: `assisted_meeting_${sessionRef.id}`,
          type: "assisted_meeting",
          title,
          summary: compactSummary(summary),
          markdown,
          appointmentId: appointmentId || null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          createdByName: user.name,
        },
        { merge: true }
      ),
      leadRef.collection("events").add({
        type: "assisted_meeting_summary",
        title: "Reuniao analisada por IA",
        detail: summary.executiveSummary,
        assistedMeetingId: sessionRef.id,
        appointmentId: appointmentId || null,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
      adminDb.collection("lead_notes").add({
        tenantId,
        leadId,
        title: "Resumo de reuniao assistida",
        body: markdown,
        source: "assisted_meeting",
        assistedMeetingId: sessionRef.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
        createdByName: user.name,
      }),
    ];

    if (appointmentRef) {
      writes.push(
        appointmentRef.set(
          {
            status: "completed",
            meetingUrl,
            notes: [clean(appointment?.notes, 3000), summary.crmUpdate].filter(Boolean).join("\n\n"),
            aiMeetingSummary: summary,
            assistedMeetingId: sessionRef.id,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      );
    }

    await Promise.all(writes);

    await upsertLeadCommercialDossier({
      tenantId,
      leadId,
      trigger: "appointment_completed",
      appointmentId: appointmentId || sessionRef.id,
      sourceId: sessionRef.id,
      lead,
      appointment: {
        ...(appointment || {}),
        title,
        meetingUrl,
        notes: summary.crmUpdate,
        startAt: clean(appointment?.startAt, 80),
      },
      actorId: user.uid,
      actorName: user.name,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      id: sessionRef.id,
      item: {
        id: sessionRef.id,
        ...session,
        transcript: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
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
