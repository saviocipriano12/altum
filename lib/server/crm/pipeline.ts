import { adminDb } from "@/app/lib/server/firebase-admin";
import { getBusinessProfilePipelineStages } from "@/lib/business-profiles";
import {
  getPipelineStageDefinition,
  getPipelineStageIndex,
  normalizePipelineStageId,
  normalizePipelineStages,
  type PipelineStageDefinition,
} from "@/lib/pipeline";
import { getTenantSettings } from "@/lib/server/tenant";

export type TenantPipelineOwner = {
  userId: string;
  name: string;
  email: string;
  role: string;
  team: string;
  availability: string;
};

export type LeadStagePolicy = {
  stageId: string;
  stageLabel: string;
  slaHours: number | null;
  followUpHours: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  stageUpdatedAt: unknown;
  slaDueAt: string | null;
  slaBreached: boolean;
};

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export async function listTenantPipelineOwners(tenantId: string) {
  const snap = await adminDb.collection("tenant_users").where("tenantId", "==", tenantId).limit(80).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        userId: cleanText(data.userId, 140),
        name: cleanText(data.name, 140) || cleanText(data.email, 180) || "Sem nome",
        email: cleanText(data.email, 180),
        role: cleanText(data.role, 40) || "client_viewer",
        team: cleanText(data.team, 80),
        availability: cleanText(data.availability, 20) || "online",
      } satisfies TenantPipelineOwner;
    })
    .filter((item) => item.userId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function loadTenantPipelineConfig(tenantId: string) {
  const [owners, direct, settings] = await Promise.all([
    listTenantPipelineOwners(tenantId),
    adminDb.collection("pipeline").doc(tenantId).get(),
    getTenantSettings(tenantId),
  ]);

  if (direct.exists) {
    const data = direct.data() as Record<string, unknown>;
    if ((data.tenantId || tenantId) === tenantId) {
      const stages = normalizePipelineStages(data.stages);
      return { stages, owners };
    }
  }

  const querySnap = await adminDb.collection("pipeline").where("tenantId", "==", tenantId).limit(1).get();
  if (!querySnap.empty) {
    const data = querySnap.docs[0].data() as Record<string, unknown>;
    return { stages: normalizePipelineStages(data.stages), owners };
  }

  return {
    stages: getBusinessProfilePipelineStages(settings?.businessProfileId),
    owners,
  };
}

export function comparePipelineStages(currentStage: string, targetStage: string, stages: PipelineStageDefinition[]) {
  return getPipelineStageIndex(targetStage, stages) - getPipelineStageIndex(currentStage, stages);
}

export function buildLeadStagePolicy(input: {
  lead: Record<string, unknown>;
  stages: PipelineStageDefinition[];
}) {
  const currentStage = normalizePipelineStageId(input.lead.pipelineStage || input.lead.stage || "captado");
  const stage = getPipelineStageDefinition(currentStage, input.stages);
  const stageUpdatedAt = input.lead.stageUpdatedAt || input.lead.updatedAt || input.lead.createdAt || null;
  const stageStartDate = toDate(stageUpdatedAt);
  const slaDueAt =
    stageStartDate && typeof stage.slaHours === "number" && stage.slaHours > 0
      ? new Date(stageStartDate.getTime() + stage.slaHours * 3600_000).toISOString()
      : null;

  return {
    stageId: stage.id,
    stageLabel: stage.label,
    slaHours: typeof stage.slaHours === "number" ? stage.slaHours : null,
    followUpHours: typeof stage.followUpHours === "number" ? stage.followUpHours : null,
    ownerUserId: stage.ownerUserId || cleanText(input.lead.ownerId, 140) || null,
    ownerName: stage.ownerName || cleanText(input.lead.owner, 140) || null,
    stageUpdatedAt,
    slaDueAt,
    slaBreached: Boolean(slaDueAt && new Date(slaDueAt).getTime() <= Date.now()),
  } satisfies LeadStagePolicy;
}
