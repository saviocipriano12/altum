import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { runLeadAutomations } from "@/lib/server/automations";
import { normalizePipelineStageId } from "@/lib/pipeline";

type LeadAttributionInput = {
  source?: string;
  medium?: string;
  campaign?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  formId?: string;
  formName?: string;
};

type RecordInboundLeadInput = {
  tenantId: string;
  sourceType: string;
  sourceId?: string | null;
  sourceLabel: string;
  channel: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  customFields?: Record<string, string | number | boolean | null>;
  notes?: string[];
  tags?: string[] | string;
  defaultOwnerId?: string | null;
  defaultOwnerName?: string | null;
  defaultPipelineStage?: string | null;
  externalProfileId?: string | null;
  attribution?: LeadAttributionInput;
  submission?: {
    formId?: string | null;
    formName?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    sourceLabel?: string | null;
  } | null;
  automationActorId?: string | null;
  automationActorName?: string | null;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanTags(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      source
        .map((item) => clean(item, 32).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 10);
}

async function findExistingLead(input: {
  tenantId: string;
  email: string;
  telefone: string;
  externalProfileId: string;
  sourceId: string;
}) {
  if (input.sourceId) {
    const sourceSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", input.tenantId)
      .where("sourceId", "==", input.sourceId)
      .limit(1)
      .get();
    if (!sourceSnap.empty) return sourceSnap.docs[0];
  }

  if (input.externalProfileId) {
    const externalSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", input.tenantId)
      .where("externalProfileId", "==", input.externalProfileId)
      .limit(1)
      .get();
    if (!externalSnap.empty) return externalSnap.docs[0];
  }

  if (input.telefone) {
    const phoneSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", input.tenantId)
      .where("telefone", "==", input.telefone)
      .limit(1)
      .get();
    if (!phoneSnap.empty) return phoneSnap.docs[0];
  }

  if (input.email) {
    const emailSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", input.tenantId)
      .where("email", "==", input.email)
      .limit(1)
      .get();
    if (!emailSnap.empty) return emailSnap.docs[0];
  }

  return null;
}

export async function recordInboundLead(input: RecordInboundLeadInput) {
  const tenantId = clean(input.tenantId, 140);
  const nome = clean(input.nome, 180);
  const email = clean(input.email, 180).toLowerCase();
  const telefone = normalizePhoneBR(clean(input.telefone, 40));
  const empresa = clean(input.empresa, 180);
  const mensagem = clean(input.mensagem, 4000);
  const sourceType = clean(input.sourceType, 80).toLowerCase();
  const sourceId = clean(input.sourceId, 180);
  const externalProfileId = clean(input.externalProfileId, 180);
  const sourceLabel = clean(input.sourceLabel, 120) || "Inbound";
  const customFields = Object.fromEntries(
    Object.entries(input.customFields || {})
      .map(([key, value]) => {
        const normalizedKey = clean(key, 80).toLowerCase().replace(/\s+/g, "_");
        if (!normalizedKey) return null;
        if (typeof value === "boolean") return [normalizedKey, value] as const;
        if (typeof value === "number" && Number.isFinite(value)) return [normalizedKey, value] as const;
        const text = clean(value, 4000);
        return text ? ([normalizedKey, text] as const) : null;
      })
      .filter((item): item is readonly [string, string | number | boolean] => Boolean(item))
  );

  if (!tenantId) {
    throw new Error("Tenant invalido para intake de lead.");
  }

  if (!nome && !email && !telefone && !externalProfileId) {
    throw new Error("Lead inbound sem identificadores minimos.");
  }

  const existingLead = await findExistingLead({
    tenantId,
    email,
    telefone,
    externalProfileId,
    sourceId,
  });
  const leadRef = existingLead ? existingLead.ref : adminDb.collection("leads").doc();
  const existingData = existingLead ? (existingLead.data() as Record<string, unknown>) : {};

  const normalizedTags = Array.from(
    new Set([
      ...cleanTags(existingData.tags),
      ...cleanTags(input.tags),
      clean(input.channel, 40).toLowerCase(),
      sourceType,
    ].filter(Boolean))
  ).slice(0, 10);

  const attribution = input.attribution || {};
  const utmSource = clean(input.submission?.utmSource || attribution.source, 120).toLowerCase();
  const utmMedium = clean(input.submission?.utmMedium || attribution.medium, 120).toLowerCase();
  const utmCampaign = clean(input.submission?.utmCampaign || attribution.campaign, 120).toLowerCase();

  const notesParts = [
    mensagem ? `Mensagem: ${mensagem}` : "",
    ...(input.notes || []).map((item) => clean(item, 300)).filter(Boolean),
    utmSource ? `UTM source: ${utmSource}` : "",
    utmMedium ? `UTM medium: ${utmMedium}` : "",
    utmCampaign ? `UTM campaign: ${utmCampaign}` : "",
  ].filter(Boolean);

  await leadRef.set(
    {
      tenantId,
      nome: nome || clean(existingData.nome, 180) || "Lead sem nome",
      email: email || clean(existingData.email, 180),
      telefone: telefone || clean(existingData.telefone, 40),
      empresa: empresa || clean(existingData.empresa, 180),
      origem: sourceLabel,
      channel: clean(input.channel, 60) || clean(existingData.channel, 60),
      sourceType,
      sourceId: sourceId || clean(existingData.sourceId, 180),
      externalProfileId: externalProfileId || clean(existingData.externalProfileId, 180),
      utmSource,
      utmMedium,
      utmCampaign,
      attribution: {
        source: utmSource || clean(attribution.source, 120) || sourceLabel.toLowerCase(),
        medium: utmMedium || clean(attribution.medium, 120) || clean(input.channel, 60),
        campaign: utmCampaign || clean(attribution.campaign, 120),
        campaignId: clean(attribution.campaignId, 180),
        adsetId: clean(attribution.adsetId, 180),
        adId: clean(attribution.adId, 180),
        formId: clean(attribution.formId, 180),
        formName: clean(attribution.formName, 140),
        updatedAt: FieldValue.serverTimestamp(),
      },
      pipelineStage: normalizePipelineStageId(
        input.defaultPipelineStage || existingData.pipelineStage || existingData.stage || "captado"
      ),
      stage: normalizePipelineStageId(
        input.defaultPipelineStage || existingData.pipelineStage || existingData.stage || "captado"
      ),
      ownerId: clean(input.defaultOwnerId, 140) || clean(existingData.ownerId, 140) || null,
      owner: clean(input.defaultOwnerName, 140) || clean(existingData.owner, 140) || null,
      tags: normalizedTags,
      customFields: {
        ...((existingData.customFields && typeof existingData.customFields === "object")
          ? (existingData.customFields as Record<string, unknown>)
          : {}),
        ...customFields,
      },
      notes: notesParts.join(" | ") || clean(existingData.notes, 4000),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existingLead
        ? existingData.createdAt || FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await Promise.all([
    leadRef.collection("events").add({
      type: sourceType,
      title: existingLead ? "Nova entrada inbound" : "Lead capturado",
      detail: `${sourceLabel} recebido pela plataforma.`,
      sourceType,
      sourceId,
      createdAt: FieldValue.serverTimestamp(),
    }),
    input.submission
      ? adminDb.collection("capture_submissions").add({
          tenantId,
          formId: clean(input.submission.formId, 180) || sourceId || null,
          formName: clean(input.submission.formName, 140) || sourceLabel,
          leadId: leadRef.id,
          leadName: nome || clean(existingData.nome, 180) || "Lead sem nome",
          email,
          phone: telefone,
          customFields,
          sourceLabel: clean(input.submission.sourceLabel, 120) || sourceLabel,
          utmSource,
          utmMedium,
          utmCampaign,
          createdAt: FieldValue.serverTimestamp(),
        })
      : Promise.resolve(),
  ]);

  if (!existingLead) {
    await runLeadAutomations({
      tenantId,
      trigger: "lead_created",
      leadId: leadRef.id,
      actorId: clean(input.automationActorId, 140) || "altum_inbound",
      actorName: clean(input.automationActorName, 140) || "ALTUM Inbound",
    });
  }

  return {
    leadId: leadRef.id,
    created: !existingLead,
  };
}
