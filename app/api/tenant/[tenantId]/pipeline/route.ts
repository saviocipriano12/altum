import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import {
  normalizePipelineStageId,
  normalizePipelineStages,
  type PipelineStageDefinition,
} from "@/lib/pipeline";
import { buildLeadStagePolicy, loadTenantPipelineConfig } from "@/lib/server/crm/pipeline";

type PipelineCommercialState = {
  lastAiSignals: Array<{
    decision: string | null;
    nextAction: string | null;
    confidence: number | null;
  }>;
  stagePolicy: {
    slaBreached: boolean;
    slaDueAt: string | null;
    ownerName: string | null;
  } | null;
};

type PipelineLead = {
  id: string;
  nome: string;
  empresa: string;
  owner: string;
  ownerId: string;
  stage: string;
  score: number | null;
  heat: string;
  priority: string;
  potentialValue: number;
  tags: string[];
  source: string;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
  stageUpdatedAt: unknown;
  aiSignalStrength: string;
  aiPlannerConfidence: number | null;
  aiLeadSummary: string;
  aiNextAction: string;
  aiRecommendedOffer: string;
  aiResponseGoal: string;
  aiCommercialTemperature: string;
  aiConversationStage: string;
  campaignName: string;
  sourceLabel: string;
  qualification: {
    score: number | null;
    band: string;
    label: string;
    recommendedStage: string;
    nextAction: string;
  } | null;
  commercialState: PipelineCommercialState | null;
};

type Body = {
  stages?: Array<Partial<PipelineStageDefinition>>;
};

function cleanText(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
        .map((item) => cleanText(item, 32).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 8);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatQualification(value: unknown): PipelineLead["qualification"] {
  const data = asRecord(value);
  if (!data) return null;

  return {
    score: cleanNumber(data.score),
    band: cleanText(data.band, 40),
    label: cleanText(data.label, 120),
    recommendedStage: cleanText(data.recommendedStage, 80),
    nextAction: cleanText(data.nextAction, 120),
  };
}

function formatCommercialState(value: unknown): PipelineLead["commercialState"] {
  const data = asRecord(value);
  if (!data) return null;
  const stagePolicy = asRecord(data.stagePolicy);
  const signals = Array.isArray(data.lastAiSignals) ? data.lastAiSignals : [];

  return {
    lastAiSignals: signals
      .map((item) => {
        const signal = asRecord(item);
        if (!signal) return null;
        return {
          decision: cleanText(signal.decision, 40) || null,
          nextAction: cleanText(signal.nextAction, 120) || null,
          confidence: cleanNumber(signal.confidence),
        };
      })
      .filter(Boolean)
      .slice(0, 3) as PipelineCommercialState["lastAiSignals"],
    stagePolicy: stagePolicy
      ? {
          slaBreached: Boolean(stagePolicy.slaBreached),
          slaDueAt: cleanText(stagePolicy.slaDueAt, 40) || null,
          ownerName: cleanText(stagePolicy.ownerName, 120) || null,
        }
      : null,
  };
}

function toMillis(value: unknown) {
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

function formatLead(docId: string, data: Record<string, unknown>): PipelineLead {
  return {
    id: docId,
    nome: cleanText(data.nome, 180) || "Lead",
    empresa: cleanText(data.empresa, 180),
    owner: cleanText(data.owner, 120),
    ownerId: cleanText(data.ownerId, 120),
    stage: normalizePipelineStageId(data.pipelineStage || data.stage),
    score: cleanNumber(data.score),
    heat: cleanText(data.heat, 20),
    priority: cleanText(data.priority, 20),
    potentialValue:
      cleanNumber(data.potentialValue) ??
      cleanNumber(data.valorPotencial) ??
      0,
    tags: parseTags(data.tags),
    source: cleanText(data.origem || data.channel, 80),
    status: cleanText(data.status, 40) || "novo",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    stageUpdatedAt: data.stageUpdatedAt,
    aiSignalStrength: cleanText(data.aiSignalStrength, 40),
    aiPlannerConfidence: cleanNumber(data.aiPlannerConfidence),
    aiLeadSummary: cleanText(data.aiLeadSummary, 260),
    aiNextAction: cleanText(data.aiNextAction, 120),
    aiRecommendedOffer: cleanText(data.aiRecommendedOffer, 160),
    aiResponseGoal: cleanText(data.aiResponseGoal, 80),
    aiCommercialTemperature: cleanText(data.aiCommercialTemperature, 40),
    aiConversationStage: cleanText(data.aiConversationStage, 80),
    campaignName: cleanText(data.campaignName || data.utmCampaign, 180),
    sourceLabel: cleanText(data.sourceLabel || data.origem || data.channel, 140),
    qualification: formatQualification(data.qualification),
    commercialState: formatCommercialState(data.commercialState),
  };
}

function getStageStartedAt(lead: PipelineLead) {
  return toMillis(lead.stageUpdatedAt) || toMillis(lead.updatedAt) || toMillis(lead.createdAt);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const [{ stages, owners }, leadsSnap] = await Promise.all([
      loadTenantPipelineConfig(tenantId),
      adminDb.collection("leads").where("tenantId", "==", tenantId).limit(240).get(),
    ]);

    const now = Date.now();
    const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
    const leads = leadsSnap.docs
      .map((doc) => formatLead(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => getStageStartedAt(b) - getStageStartedAt(a));

    const columns = stages.map((stage) => {
      const items = leads
        .filter((lead) => {
          const normalizedStage = normalizePipelineStageId(lead.stage);
          if (stageMap.has(normalizedStage)) {
            return normalizedStage === stage.id;
          }
          return stage.id === stages[0]?.id;
        })
        .map((lead) => {
          const stageStartedAt = getStageStartedAt(lead);
          const daysInStage = stageStartedAt > 0 ? Math.max(0, Math.floor((now - stageStartedAt) / 86400000)) : 0;
          const stagePolicy = buildLeadStagePolicy({
            lead,
            stages,
          });

          return {
            ...lead,
            ageDays: daysInStage,
            slaBreached: stagePolicy.slaBreached,
          };
        });

      const value = items.reduce((sum, lead) => sum + Number(lead.potentialValue || 0), 0);
      const avgScore =
        items.length > 0
          ? Math.round(
              items.reduce((sum, lead) => sum + Number(lead.score || 0), 0) / Math.max(1, items.length)
            )
          : 0;
      const avgAgeDays =
        items.length > 0
          ? Math.round(items.reduce((sum, lead) => sum + Number(lead.ageDays || 0), 0) / Math.max(1, items.length))
          : 0;

      return {
        stage,
        count: items.length,
        totalValue: value,
        avgScore,
        avgAgeDays,
        slaBreachedCount: items.filter((lead) => Boolean(lead.slaBreached)).length,
        items,
      };
    });

    const openCount = columns
      .filter((column) => !column.stage.isTerminal)
      .reduce((sum, column) => sum + column.count, 0);
    const wonCount = columns.find((column) => column.stage.id === "ganho")?.count || 0;
    const lostCount = columns.find((column) => column.stage.id === "perdido")?.count || 0;
    const totalValue = columns.reduce((sum, column) => sum + Number(column.totalValue || 0), 0);

    return NextResponse.json({
      ok: true,
      tenantId,
      stages,
      owners,
      columns,
      summary: {
        totalLeads: leads.length,
        openCount,
        wonCount,
        lostCount,
        totalValue,
        winRate: leads.length ? Number(((wonCount / leads.length) * 100).toFixed(1)) : 0,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar pipeline do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar pipeline." }, { status: 500 });
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
    assertTenantCapability(membership, "manage_pipeline");

    const body = (await req.json()) as Body;
    const stages = normalizePipelineStages(body.stages);

    await adminDb.collection("pipeline").doc(tenantId).set(
      {
        tenantId,
        stages,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tenantId, stages });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao salvar pipeline do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar pipeline." }, { status: 500 });
  }
}
