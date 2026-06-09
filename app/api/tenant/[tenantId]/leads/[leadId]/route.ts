import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { runLeadAutomations } from "@/lib/server/automations";
import { trackLeadStageOutcome } from "@/lib/server/ai/learning-outcomes";
import { analyzeLeadCommercialState, syncLeadCommercialState } from "@/lib/server/crm/operations";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { mapPipelineStageToConversionStep, recordLeadConversionStep } from "@/lib/server/conversion-trail";
import { deleteTenantLead, recordDeletionAudit } from "@/lib/server/tenant-data-deletion";
import { upsertLeadCommercialDossier } from "@/lib/server/ai/lead-dossier";

type LeadDoc = Record<string, unknown> & {
  tenantId?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  sourceType?: string;
  status?: string;
  stage?: string;
  pipelineStage?: string;
  owner?: string;
  ownerId?: string;
  score?: number;
  heat?: string;
  priority?: string;
  notes?: string;
  potentialValue?: number;
  valorPotencial?: number;
  tags?: string[] | string;
  customFields?: Record<string, string | number | boolean | null>;
  updatedAt?: unknown;
  createdAt?: unknown;
};

type RelatedChatItem = Record<string, unknown> & {
  id: string;
  status?: string;
  queueStatus?: string;
  lastMessageTime?: unknown;
};

type Body = {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  status?: string;
  pipelineStage?: string;
  score?: number;
  heat?: string;
  priority?: string;
  potentialValue?: number;
  notes?: string;
  tags?: string[] | string;
};

function cleanString(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => cleanString(item, 32).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 10);
}

function toSeconds(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : Math.floor(parsed.getTime() / 1000);
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return Math.floor((value as { toDate: () => Date }).toDate().getTime() / 1000);
  }
  return 0;
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(-14);
}

async function getLeadRef(tenantId: string, leadId: string) {
  const leadRef = adminDb.collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
  }

  const lead = leadSnap.data() as LeadDoc;
  if ((lead.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Lead fora do tenant informado.");
  }

  return { leadRef, lead };
}

async function listNotes(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("lead_notes")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .limit(100)
    .get();

  return snap.docs
    .map(
      (doc): Record<string, unknown> & { id: string; createdAt?: unknown } => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .sort((a, b) => toSeconds(b.createdAt) - toSeconds(a.createdAt));
}

async function listTasks(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("lead_tasks")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .limit(100)
    .get();

  return snap.docs
    .map(
      (doc): Record<string, unknown> & { id: string; dueAt?: unknown; createdAt?: unknown } => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .sort((a, b) => {
      const statusA = String(a.status || "pending");
      const statusB = String(b.status || "pending");
      if (statusA !== statusB) return statusA === "done" ? 1 : -1;
      return toSeconds(a.dueAt || a.createdAt) - toSeconds(b.dueAt || b.createdAt);
    });
}

async function listTimeline(leadId: string) {
  const snap = await adminDb
    .collection("leads")
    .doc(leadId)
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(16)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
}

async function listLeadDocuments(leadId: string) {
  const snap = await adminDb
    .collection("leads")
    .doc(leadId)
    .collection("documents")
    .limit(30)
    .get();

  return snap.docs
    .map((doc): Record<string, unknown> & { id: string; updatedAt?: unknown; createdAt?: unknown } => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .sort((a, b) => toSeconds(b.updatedAt || b.createdAt) - toSeconds(a.updatedAt || a.createdAt));
}

async function listRelatedChats(tenantId: string, leadId: string, phone: string) {
  const normalizedPhone = normalizePhone(phone);

  const [byLeadSnap, byPhoneSnap] = await Promise.all([
    adminDb.collection("chats").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(12).get(),
    normalizedPhone
      ? adminDb.collection("chats").where("tenantId", "==", tenantId).where("contactPhone", "==", normalizedPhone).limit(12).get()
      : Promise.resolve(null),
  ]);

  const byLead = byLeadSnap.docs.map(
    (doc): RelatedChatItem => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    })
  );

  const byPhone =
    byPhoneSnap?.docs.map(
      (doc): RelatedChatItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    ) || [];

  const unique = new Map<string, RelatedChatItem>();
  for (const item of [...byLead, ...byPhone]) {
    unique.set(item.id, item);
  }

  return Array.from(unique.values())
    .sort((a, b) => toSeconds(b.lastMessageTime || b.updatedAt) - toSeconds(a.lastMessageTime || a.updatedAt))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      contactName: cleanString(item.contactName, 180) || "Contato",
      contactPhone: cleanString(item.contactPhone, 40),
      channel: cleanString(item.channel, 40) || "whatsapp",
      status: cleanString(item.status, 40) || "open",
      priority: cleanString(item.priority, 20) || "medium",
      queueStatus: cleanString(item.queueStatus, 40) || "open",
      ownerName: cleanString(item.ownerName, 120) || cleanString(item.assignedUserName, 120),
      lastMessage: cleanString(item.lastMessage, 320),
      lastMessageTime: item.lastMessageTime || item.updatedAt || null,
      unreadCount: typeof item.unreadCount === "number" ? item.unreadCount : 0,
    }));
}

async function listAppointments(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("appointments")
    .where("tenantId", "==", tenantId)
    .limit(60)
    .get();

  return snap.docs
    .map((doc): Record<string, unknown> & { id: string; startAt?: unknown } => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .filter((item) => cleanString(item.leadId, 140) === leadId)
    .sort((a, b) => toSeconds(a.startAt) - toSeconds(b.startAt));
}

function buildConversationSummary(chats: Array<Record<string, unknown>>) {
  const open = chats.filter((item) => String(item.status || "open").toLowerCase() === "open").length;
  const pending = chats.filter((item) => String(item.status || "").toLowerCase() === "pending").length;
  const resolved = chats.filter((item) => String(item.status || "").toLowerCase() === "resolved").length;
  const highPriority = chats.filter((item) => String(item.priority || "").toLowerCase() === "high").length;
  const unassigned = chats.filter((item) => !String(item.ownerName || "").trim()).length;
  const lastInteractionAt = chats
    .map((item) => item.lastMessageTime)
    .sort((a, b) => toSeconds(b) - toSeconds(a))[0] || null;

  return {
    total: chats.length,
    open,
    pending,
    resolved,
    highPriority,
    unassigned,
    lastInteractionAt,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const { lead } = await getLeadRef(tenantId, leadId);
    const [notes, tasks, timeline, documents, relatedChats, appointments, commercial] = await Promise.all([
      listNotes(tenantId, leadId),
      listTasks(tenantId, leadId),
      listTimeline(leadId),
      listLeadDocuments(leadId),
      listRelatedChats(tenantId, leadId, lead.telefone || ""),
      listAppointments(tenantId, leadId),
      analyzeLeadCommercialState({
        tenantId,
        leadId,
        lead,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId,
      lead: {
        id: leadId,
        ...lead,
        potentialValue:
          typeof lead.potentialValue === "number"
            ? lead.potentialValue
            : typeof lead.valorPotencial === "number"
              ? lead.valorPotencial
              : null,
        tags: parseTags(lead.tags),
        customFields:
          lead.customFields && typeof lead.customFields === "object"
            ? (lead.customFields as Record<string, string | number | boolean | null>)
            : {},
      },
      notes,
      tasks,
      appointments,
      timeline,
      documents,
      relatedChats,
      conversationSummary: buildConversationSummary(relatedChats),
      qualification: commercial.qualification,
      stagePolicy: commercial.stagePolicy,
      handoff: commercial.handoff,
      schedulingAdapter: commercial.schedulingAdapter,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar detalhe do lead:", error);
    return NextResponse.json({ error: "Falha ao carregar detalhe do lead." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "edit_leads");

    const { leadRef, lead } = await getLeadRef(tenantId, leadId);
    const body = (await req.json()) as Body;
    const previousStage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    const changes: string[] = [];

    const nome = cleanString(body.nome, 180);
    if (body.nome !== undefined && nome !== cleanString(lead.nome, 180)) {
      patch.nome = nome;
      changes.push(`nome: ${nome || "sem nome"}`);
    }

    const email = cleanString(body.email, 180);
    if (body.email !== undefined && email !== cleanString(lead.email, 180)) {
      patch.email = email;
      changes.push(`email atualizado`);
    }

    const telefone = cleanString(body.telefone, 40);
    if (body.telefone !== undefined && telefone !== cleanString(lead.telefone, 40)) {
      patch.telefone = telefone;
      changes.push(`telefone atualizado`);
    }

    const empresa = cleanString(body.empresa, 180);
    if (body.empresa !== undefined && empresa !== cleanString(lead.empresa, 180)) {
      patch.empresa = empresa;
      changes.push(`empresa: ${empresa || "nao informada"}`);
    }

    const origem = cleanString(body.origem, 120);
    if (body.origem !== undefined && origem !== cleanString(lead.origem, 120)) {
      patch.origem = origem;
      changes.push(`origem: ${origem || "nao informada"}`);
    }

    const channel = cleanString(body.channel, 80);
    if (body.channel !== undefined && channel !== cleanString(lead.channel, 80)) {
      patch.channel = channel;
      changes.push(`canal: ${channel || "nao informado"}`);
    }

    const status = cleanString(body.status, 60);
    if (body.status !== undefined && status !== cleanString(lead.status, 60)) {
      patch.status = status;
      changes.push(`status: ${status || "novo"}`);
    }

    const pipelineStage = normalizePipelineStageId(body.pipelineStage || "");
    if (body.pipelineStage !== undefined && pipelineStage !== previousStage) {
      patch.pipelineStage = pipelineStage;
      patch.stage = pipelineStage;
      patch.stageUpdatedAt = FieldValue.serverTimestamp();
      changes.push(`stage: ${pipelineStage || "captado"}`);
    }

    const score = cleanNumber(body.score);
    if (body.score !== undefined && score !== (typeof lead.score === "number" ? lead.score : null)) {
      patch.score = score;
      patch.scoreSource = "manual";
      changes.push(`score: ${score ?? 0}`);
    }

    const heat = cleanString(body.heat, 20);
    if (body.heat !== undefined && heat !== cleanString(lead.heat, 20)) {
      patch.heat = heat;
      changes.push(`heat: ${heat || "sem heat"}`);
    }

    const priority = cleanString(body.priority, 20);
    if (body.priority !== undefined && priority !== cleanString(lead.priority, 20)) {
      patch.priority = priority;
      changes.push(`prioridade: ${priority || "low"}`);
    }

    const potentialValue = cleanNumber(body.potentialValue);
    const currentPotentialValue =
      typeof lead.potentialValue === "number"
        ? lead.potentialValue
        : typeof lead.valorPotencial === "number"
          ? lead.valorPotencial
          : null;
    if (body.potentialValue !== undefined && potentialValue !== currentPotentialValue) {
      patch.potentialValue = potentialValue;
      changes.push(`potencial: ${potentialValue ?? 0}`);
    }

    const notes = cleanString(body.notes, 4000);
    if (body.notes !== undefined && notes !== cleanString(lead.notes, 4000)) {
      patch.notes = notes;
      changes.push("resumo comercial atualizado");
    }

    const tags = parseTags(body.tags);
    if (body.tags !== undefined && JSON.stringify(tags) !== JSON.stringify(parseTags(lead.tags))) {
      patch.tags = tags;
      changes.push(`tags: ${tags.length ? tags.join(", ") : "sem tags"}`);
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, tenantId, leadId, unchanged: true });
    }

    await Promise.all([
      leadRef.set(patch, { merge: true }),
      leadRef.collection("events").add({
        type: "lead_profile_update",
        title: "Lead atualizado",
        detail: changes.join(" | "),
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    if (body.pipelineStage !== undefined && pipelineStage !== previousStage) {
      await runLeadAutomations({
        tenantId,
        trigger: "lead_stage_changed",
        leadId,
        actorId: user.uid,
        actorName: user.name,
        previousStage,
        nextStage: pipelineStage,
      });

      await trackLeadStageOutcome({
        tenantId,
        leadId,
        previousStage,
        nextStage: pipelineStage,
      });

      if (pipelineStage === "qualificacao") {
        await dispatchLeadConversionEvents({
          tenantId,
          leadId,
          reason: "lead_qualified",
        }).catch((error) => {
          console.error("Falha ao disparar conversao de lead qualificado:", error);
        });
      }

      if (pipelineStage === "ganho") {
        await dispatchLeadConversionEvents({
          tenantId,
          leadId,
          reason: "sale_won",
        }).catch((error) => {
          console.error("Falha ao disparar conversao de venda:", error);
        });

        await upsertLeadCommercialDossier({
          tenantId,
          leadId,
          trigger: "sale_won",
          sourceId: "lead_patch_ganho",
          lead: { ...lead, ...patch },
          actorId: user.uid,
          actorName: user.name,
        });
      }

      const conversionStep = mapPipelineStageToConversionStep(pipelineStage);
      if (conversionStep) {
        await recordLeadConversionStep({
          tenantId,
          leadId,
          step: conversionStep,
          source: "lead_patch",
          actorId: user.uid,
          actorName: user.name,
          detail:
            conversionStep === "qualificado"
              ? "Lead qualificado por atualizacao manual."
              : conversionStep === "proposta"
                ? "Lead movido para proposta por atualizacao manual."
                : conversionStep === "fechamento"
                  ? "Lead movido para fechamento por atualizacao manual."
                  : conversionStep === "ganho"
                    ? "Lead marcado como ganho por atualizacao manual."
                    : `Lead entrou na etapa ${conversionStep}.`,
          metadata: {
            previousStage,
            nextStage: pipelineStage,
          },
        }).catch((error) => {
          console.error("Falha ao registrar trilha de conversao (lead patch):", error);
        });
      }
    }

    await syncLeadCommercialState({
      tenantId,
      leadId,
      actorId: user.uid,
      actorName: user.name,
      allowStageAdvance: body.pipelineStage === undefined,
      preserveManualScore: body.score !== undefined,
    });

    return NextResponse.json({ ok: true, tenantId, leadId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar lead do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar lead." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "edit_leads");
    await getLeadRef(tenantId, leadId);
    const result = await deleteTenantLead({ tenantId, leadId });
    await recordDeletionAudit({
      tenantId,
      actorId: user.uid,
      actorName: user.name,
      entity: "lead",
      ids: [leadId],
    });
    return NextResponse.json({ ok: true, tenantId, leadId, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao apagar lead:", error);
    return NextResponse.json({ error: "Falha ao apagar lead." }, { status: 500 });
  }
}
