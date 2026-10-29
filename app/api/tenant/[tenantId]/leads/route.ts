import { NextResponse } from "next/server";
import { commercialRecordIdentity, commercialPotentialValue, parseCommercialPotentialValue, type CommercialRecordIdentity } from "@/lib/crm-commercial-record";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, getTenantSettings, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { commitManualLeadCreationOccurrence, intakeCreationJobId, processIntakeCreation } from "@/lib/server/crm/intake-occurrence";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { deriveSalesJourney, type SalesJourneyRecommendation } from "@/lib/sales-journey";
import { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { inferClientAccessProfile } from "@/lib/client-access-profiles";
import { assertPipelineStageExists, InvalidPipelineStageError, loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";

const DEFAULT_LEADS_LIMIT = 200;
const MAX_LEADS_LIMIT = 250;

type LeadItem = CommercialRecordIdentity & {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  photoUrl?: string;
  profilePhotoUrl?: string;
  contactPhotoUrl?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  status?: string;
  stage?: string;
  pipelineStage?: string;
  owner?: string;
  ownerId?: string;
  score?: number | null;
  heat?: string;
  priority?: string;
  potentialValue?: number | null;
  tags?: string[];
  notes?: string;
  customFields?: Record<string, string | number | boolean | null>;
  qualification?: Record<string, unknown>;
  handoff?: Record<string, unknown>;
  commercialState?: Record<string, unknown>;
  commercialDossier?: Record<string, unknown> | null;
  commercialDossierUpdatedAt?: unknown;
  aiNextAction?: string;
  aiRecommendedOffer?: string;
  aiDominantObjection?: string;
  salesJourney?: SalesJourneyRecommendation;
  createdAt?: unknown;
  updatedAt?: unknown;
  chatSummary?: {
    total: number;
    open: number;
    pending: number;
    unresolved: number;
    highPriority: number;
    lastInteractionAt: unknown;
  };
  timeline: Array<Record<string, unknown>>;
};

type ChatRow = {
  id: string;
} & Record<string, unknown>;

type CreateLeadBody = {
  nome?: unknown;
  email?: unknown;
  telefone?: unknown;
  empresa?: unknown;
  origem?: unknown;
  channel?: unknown;
  pipelineStage?: unknown;
  priority?: unknown;
  heat?: unknown;
  potentialValue?: unknown;
  notes?: unknown;
};

function parseTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase().slice(0, 32) : ""))
        .filter(Boolean)
    )
  ).slice(0, 10);
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(-14);
}

function cleanString(value: unknown, max = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function listChatsForLeadPage(tenantId: string, leads: LeadItem[], compact: boolean) {
  const leadIds = Array.from(new Set(leads.map((lead) => lead.id).filter(Boolean)));
  const phones = Array.from(new Set(leads.map((lead) => cleanString(lead.telefone, 60)).filter(Boolean)));
  const readChats = (query: FirebaseFirestore.Query) => (compact ? query.select(
    "tenantId", "leadId", "contactPhone", "status", "priority", "lastMessageTime", "updatedAt", "contactPhotoUrl",
    "lastMessage", "lastClientMessageAt", "lastAgentMessageAt", "channel", "followUpCount",
    "assignedTo", "ownerId", "ownerUserId", "assignedUserId", "responsavelId", "channelScope", "channelOwnerUserId"
  ) : query).get();
  const queries = [
    ...chunks(leadIds, 30).map((ids) =>
      readChats(adminDb.collection("chats").where("tenantId", "==", tenantId).where("leadId", "in", ids))
    ),
    ...chunks(phones, 30).map((values) =>
      readChats(adminDb.collection("chats").where("tenantId", "==", tenantId).where("contactPhone", "in", values))
    ),
  ];
  if (queries.length === 0) return [] as ChatRow[];

  const snapshots = await Promise.all(queries);
  const byId = new Map<string, ChatRow>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      byId.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
    }
  }
  return Array.from(byId.values());
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantRole(membership, "client_viewer");

    const url = new URL(req.url);
    const compact = url.searchParams.get("view") === "compact";
    const requestedLimit = Number(url.searchParams.get("limit") || DEFAULT_LEADS_LIMIT);
    const requestedOffset = Number(url.searchParams.get("offset") || 0);
    const pageLimit = Math.min(MAX_LEADS_LIMIT, Math.max(20, Math.round(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LEADS_LIMIT)));
    const pageOffset = Math.max(0, Math.round(Number.isFinite(requestedOffset) ? requestedOffset : 0));
    const teamWideAccess = hasTeamWideCommercialAccess(membership);
    const leadsQuery = teamWideAccess
      ? adminDb.collection("leads").where("tenantId", "==", tenantId)
      : adminDb.collection("leads").where("tenantId", "==", tenantId).where("ownerId", "==", user.uid);

    const [leadsSnap, totalSnap, settings] = await Promise.all([
      leadsQuery.offset(pageOffset).limit(pageLimit).get(),
      leadsQuery.count().get(),
      compact ? Promise.resolve({}) : getTenantSettings(tenantId),
    ]);

    const leads: LeadItem[] = leadsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...commercialRecordIdentity(data),
          nome: typeof data.nome === "string" ? data.nome : "Lead",
          email: typeof data.email === "string" ? data.email : "",
          telefone: typeof data.telefone === "string" ? data.telefone : "",
          photoUrl: cleanString(data.photoUrl),
          profilePhotoUrl: cleanString(data.profilePhotoUrl),
          contactPhotoUrl: cleanString(data.contactPhotoUrl),
          empresa: typeof data.empresa === "string" ? data.empresa : "",
          origem: typeof data.origem === "string" ? data.origem : "",
          channel: typeof data.channel === "string" ? data.channel : "",
          status: typeof data.status === "string" ? data.status : "novo",
          stage: typeof data.stage === "string" ? data.stage : "",
          pipelineStage: typeof data.pipelineStage === "string" ? data.pipelineStage : "captado",
          owner: typeof data.owner === "string" ? data.owner : "",
          ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
          score: typeof data.score === "number" ? data.score : null,
          heat: typeof data.heat === "string" ? data.heat : "",
          priority: typeof data.priority === "string" ? data.priority : "",
          potentialValue: commercialPotentialValue(data),
          tags: parseTags(data.tags),
          notes: typeof data.notes === "string" ? data.notes : "",
          customFields:
            data.customFields && typeof data.customFields === "object"
              ? (data.customFields as Record<string, string | number | boolean | null>)
              : {},
          qualification:
            data.qualification && typeof data.qualification === "object"
              ? (data.qualification as Record<string, unknown>)
              : undefined,
          handoff:
            data.handoff && typeof data.handoff === "object"
              ? (data.handoff as Record<string, unknown>)
              : undefined,
          commercialState:
            data.commercialState && typeof data.commercialState === "object"
              ? (data.commercialState as Record<string, unknown>)
              : undefined,
          commercialDossier:
            data.commercialDossier && typeof data.commercialDossier === "object"
              ? (data.commercialDossier as Record<string, unknown>)
              : null,
          commercialDossierUpdatedAt: data.commercialDossierUpdatedAt || null,
          aiNextAction: cleanString(data.aiNextAction, 160),
          aiRecommendedOffer: cleanString(data.aiRecommendedOffer, 180),
          aiDominantObjection: cleanString(data.aiDominantObjection, 120),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          chatSummary: {
            total: 0,
            open: 0,
            pending: 0,
            unresolved: 0,
            highPriority: 0,
            lastInteractionAt: null,
          },
          timeline: [],
        };
      })
      .filter((lead) => canAccessAssignedCommercialRecord(membership, user.uid, lead))
      .map((lead) => ({
        ...lead,
        score:
          typeof lead.score === "number"
            ? lead.score
            : typeof lead.qualification?.score === "number"
              ? (lead.qualification.score as number)
              : null,
      }))
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));

    // Read only the visible page's summary fields in compact mode; omitted reads
    // must never be presented as zero pending conversations.
    const chatRows = (await listChatsForLeadPage(tenantId, leads, compact))
      .filter(chat => canAccessAssignedCommercialRecord(membership, user.uid, chat));
    const chatSummaryByLead = new Map<string, LeadItem["chatSummary"]>();
    const chatsByLead = new Map<string, ChatRow[]>();

    for (const lead of leads) {
      const phone = normalizePhone(lead.telefone);
      const relatedChats = chatRows.filter((chat) => {
        const chatLeadId = typeof chat.leadId === "string" ? chat.leadId : "";
        if (chatLeadId) return chatLeadId === lead.id;
        if (!phone) return false;
        return normalizePhone(chat.contactPhone) === phone;
      });

      chatsByLead.set(lead.id, relatedChats);
      const open = relatedChats.filter((chat) => String(chat.status || "open").toLowerCase() === "open").length;
      const pending = relatedChats.filter((chat) => String(chat.status || "").toLowerCase() === "pending").length;
      const unresolved = relatedChats.filter((chat) => {
        const status = String(chat.status || "open").toLowerCase();
        return status !== "resolved" && status !== "archived";
      }).length;
      const highPriority = relatedChats.filter((chat) => String(chat.priority || "").toLowerCase() === "high").length;
      const lastInteractionAt = relatedChats
        .map((chat) => chat.lastMessageTime || chat.updatedAt || null)
        .sort((a, b) => toTime(b) - toTime(a))[0] || null;
      chatSummaryByLead.set(lead.id, {
        total: relatedChats.length,
        open,
        pending,
        unresolved,
        highPriority,
        lastInteractionAt,
      });
    }

    const items = leads.map((lead) => ({
      ...lead,
      contactPhotoUrl:
        lead.contactPhotoUrl ||
        (chatsByLead.get(lead.id) || [])
          .map((chat) => cleanString(chat.contactPhotoUrl))
          .find(Boolean) ||
        "",
      chatSummary: chatSummaryByLead.get(lead.id) || lead.chatSummary,
      salesJourney: deriveSalesJourney({ lead, chats: chatsByLead.get(lead.id) || [], settings: settings as Record<string, unknown> }),
      timeline: [],
    }));

    const total = Math.max(0, Number(totalSnap.data().count || 0));
    const nextOffset = pageOffset + items.length;
    return NextResponse.json({
      ok: true,
      tenantId,
      items,
      pagination: {
        offset: pageOffset,
        limit: pageLimit,
        total,
        nextOffset: nextOffset < total ? nextOffset : null,
        hasMore: nextOffset < total,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar leads do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar leads." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "edit_leads");

    const body = (await req.json().catch(() => ({}))) as CreateLeadBody;
    const nome = cleanString(body.nome, 180);
    const email = cleanString(body.email, 180).toLowerCase();
    const telefone = normalizePhoneBR(cleanString(body.telefone, 60));
    if (!nome && !email && !telefone) {
      return NextResponse.json(
        { error: "Informe ao menos nome, telefone ou e-mail." },
        { status: 400 }
      );
    }

    const potentialValue = parseCommercialPotentialValue(body.potentialValue);
    if (!potentialValue.ok) return NextResponse.json({ error: "Informe um valor previsto válido ou deixe vazio." }, { status: 400 });
    const tenantLeads = await adminDb.collection("leads").where("tenantId", "==", tenantId).get();
    const duplicate = tenantLeads.docs.find((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const sameEmail = email && cleanString(data.email, 180).toLowerCase() === email;
      const samePhone = telefone && normalizePhone(data.telefone) === normalizePhone(telefone);
      return Boolean(sameEmail || samePhone);
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Este contato ja existe no CRM.", leadId: duplicate.id },
        { status: 409 }
      );
    }

    await assertTenantLimitAvailable({
      tenantId,
      limitId: "contacts",
      currentUsage: tenantLeads.size,
      increment: 1,
    });

    const leadRef = adminDb.collection("leads").doc();
    const creationEventRef = leadRef.collection("events").doc();
    const requestedStage = body.pipelineStage === undefined ? null : normalizePipelineStageId(body.pipelineStage, "");
    const pipelineStage = requestedStage || "captado";
    const creatorIsSeller = inferClientAccessProfile({
      role: membership.role,
      capabilities: membership.capabilities,
    }).id === "seller";
    const payload = {
      tenantId,
      nome: nome || "Contato sem nome",
      email,
      telefone,
      empresa: cleanString(body.empresa, 180),
      origem: cleanString(body.origem, 120) || "manual",
      channel: cleanString(body.channel, 80) || "manual",
      sourceType: "manual",
      status: "novo",
      stage: pipelineStage,
      pipelineStage,
      priority: cleanString(body.priority, 40) || "medium",
      heat: cleanString(body.heat, 20) || "morno",
      potentialValue: potentialValue.value,
      notes: cleanString(body.notes, 4000),
      ownerId: creatorIsSeller ? user.uid : null,
      ownerUserId: creatorIsSeller ? user.uid : null,
      assignedTo: creatorIsSeller ? user.uid : null,
      owner: creatorIsSeller ? user.name : null,
      ownerName: creatorIsSeller ? user.name : null,
      assignedUserName: creatorIsSeller ? user.name : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const savedPayload = await adminDb.runTransaction(async transaction => {
      const pipeline = await loadTenantPipelineInTransaction(transaction, tenantId);
      const stageId = requestedStage === null ? pipeline.stages[0]?.id || "" : requestedStage;
      assertPipelineStageExists(pipeline.stages, stageId);
      const record = await commitManualLeadCreationOccurrence(transaction, {
        leadRef, eventRef: creationEventRef, record: { ...payload, stage: stageId, pipelineStage: stageId }, actorId: user.uid, actorName: user.name,
      });
      transaction.create(adminDb.collection("audit_logs").doc(), {
        type: "tenant_lead_created",
        tenantId,
        leadId: leadRef.id,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      });
      return record;
    });
    await upsertContactProfile({
        tenantId,
        phone: telefone,
        email,
        leadId: leadRef.id,
        channel: payload.channel,
        name: payload.nome,
        company: payload.empresa,
      });

    await processIntakeCreation(intakeCreationJobId(creationEventRef.id), tenantId).catch((automationError) => {
      console.error("Contato criado, mas a automacao inicial falhou:", {
        tenantId,
        leadId: leadRef.id,
        error: automationError,
      });
    });

    return NextResponse.json({ ok: true, tenantId, leadId: leadRef.id, item: { id: leadRef.id, ...savedPayload } }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "tenant_limit_exceeded" ? 409 : 403 }
      );
    }
    if (error instanceof InvalidPipelineStageError) return NextResponse.json({ error: error.message, code: "invalid_pipeline_stage" }, { status: 400 });
    if (error instanceof TenantPipelineConfigurationError) return NextResponse.json({ error: error.message, code: "pipeline_configuration_invalid" }, { status: 409 });
    console.error("Erro ao criar lead do tenant:", error);
    return NextResponse.json({ error: "Falha ao criar contato." }, { status: 500 });
  }
}
