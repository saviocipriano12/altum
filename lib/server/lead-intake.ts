import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { runLeadAutomations } from "@/lib/server/automations";
import { buildBasicAssistedTouches, readLeadAssistedTouches } from "@/lib/server/attribution";
import { syncLeadCommercialState } from "@/lib/server/crm/operations";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { recordLeadConversionStep } from "@/lib/server/conversion-trail";
import { normalizePipelineStageId } from "@/lib/pipeline";

export type LeadAttributionInput = {
  source?: string;
  medium?: string;
  campaign?: string;
  campaignName?: string;
  term?: string;
  content?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  formId?: string;
  formName?: string;
  sourceLabel?: string;
  channel?: string;
  sourceType?: string;
  landingPage?: string;
  referrer?: string;
  gclid?: string;
  fbclid?: string;
};

type LeadSubmissionInput = {
  formId?: string | null;
  formName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  sourceLabel?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
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
  submission?: LeadSubmissionInput | null;
  automationActorId?: string | null;
  automationActorName?: string | null;
};

type LeadTouchSnapshot = {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  formId: string;
  formName: string;
  sourceLabel: string;
  channel: string;
  sourceType: string;
  landingPage: string;
  referrer: string;
  gclid: string;
  fbclid: string;
  clickIds: {
    gclid: string;
    fbclid: string;
  };
  occurredAt?: unknown;
};

type BuildLeadAttributionPatchInput = {
  existingData?: Record<string, unknown>;
  attribution?: LeadAttributionInput | null;
  submission?: LeadSubmissionInput | null;
  sourceLabel?: string | null;
  channel?: string | null;
  sourceType?: string | null;
};

type BuildLeadAttributionPatchResult = {
  patch: Record<string, unknown>;
  firstTouch: LeadTouchSnapshot;
  lastTouch: LeadTouchSnapshot;
  assistedTouches: LeadTouchSnapshot[];
  originLabel: string;
  campaignLabel: string;
  sourceLabel: string;
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

function canMatchBySourceId(sourceType: string, sourceId: string) {
  if (!sourceId) return false;
  return [
    "meta_lead_ads",
    "whatsapp_inbound",
    "instagram_dm",
    "facebook_messenger",
    "site_chat_conversation",
    "site_chat_widget_conversation",
  ].includes(sourceType);
}

async function findExistingLead(input: {
  tenantId: string;
  email: string;
  telefone: string;
  externalProfileId: string;
  sourceId: string;
  sourceType: string;
}) {
  if (canMatchBySourceId(input.sourceType, input.sourceId)) {
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

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readExistingTouch(existingData: Record<string, unknown>, key: "first_touch" | "last_touch") {
  const topLevel = readObject(existingData[key]);
  if (Object.keys(topLevel).length > 0) return topLevel;

  const attribution = readObject(existingData.attribution);
  const nested = readObject(key === "first_touch" ? attribution.firstTouch : attribution.lastTouch);
  if (Object.keys(nested).length > 0) return nested;

  return {};
}

function buildTouchFromExisting(existingData: Record<string, unknown>, key: "first_touch" | "last_touch"): LeadTouchSnapshot {
  const touch = readExistingTouch(existingData, key);
  return {
    source: clean(touch.source || touch.utmSource, 120),
    medium: clean(touch.medium || touch.utmMedium, 120),
    campaign: clean(touch.campaign || touch.campaignName || touch.utmCampaign, 180),
    term: clean(touch.term || touch.utmTerm, 160),
    content: clean(touch.content || touch.utmContent, 240),
    campaignId: clean(touch.campaignId, 180),
    adsetId: clean(touch.adsetId, 180),
    adId: clean(touch.adId, 180),
    formId: clean(touch.formId, 180),
    formName: clean(touch.formName, 140),
    sourceLabel: clean(touch.sourceLabel, 140),
    channel: clean(touch.channel, 80),
    sourceType: clean(touch.sourceType, 80),
    landingPage: clean(touch.landingPage, 500),
    referrer: clean(touch.referrer, 500),
    gclid: clean(touch.gclid || readObject(touch.clickIds).gclid, 240),
    fbclid: clean(touch.fbclid || readObject(touch.clickIds).fbclid, 240),
    clickIds: {
      gclid: clean(touch.gclid || readObject(touch.clickIds).gclid, 240),
      fbclid: clean(touch.fbclid || readObject(touch.clickIds).fbclid, 240),
    },
    occurredAt: touch.occurredAt,
  };
}

function hasTouchSignal(touch: LeadTouchSnapshot) {
  return Boolean(
    touch.source ||
      touch.medium ||
      touch.campaign ||
      touch.term ||
      touch.content ||
      touch.campaignId ||
      touch.adsetId ||
      touch.adId ||
      touch.formId ||
      touch.formName ||
      touch.sourceLabel ||
      touch.channel ||
      touch.sourceType ||
      touch.landingPage ||
      touch.referrer ||
      touch.gclid ||
      touch.fbclid
  );
}

function buildTouch(input: BuildLeadAttributionPatchInput): LeadTouchSnapshot {
  const attribution = input.attribution || {};
  const submission = input.submission || {};

  const source = clean(submission.utmSource || attribution.source, 120);
  const medium = clean(submission.utmMedium || attribution.medium, 120);
  const campaign = clean(submission.utmCampaign || attribution.campaign || attribution.campaignName, 180);
  const term = clean(submission.utmTerm || attribution.term, 160);
  const content = clean(submission.utmContent || attribution.content, 240);
  const campaignId = clean(attribution.campaignId, 180);
  const adsetId = clean(attribution.adsetId, 180);
  const adId = clean(attribution.adId, 180);
  const formId = clean(submission.formId || attribution.formId, 180);
  const formName = clean(submission.formName || attribution.formName, 140);
  const sourceLabel = clean(submission.sourceLabel || attribution.sourceLabel || input.sourceLabel, 140);
  const channel = clean(attribution.channel || input.channel, 80);
  const sourceType = clean(attribution.sourceType || input.sourceType, 80);
  const landingPage = clean(submission.landingPage || attribution.landingPage, 500);
  const referrer = clean(submission.referrer || attribution.referrer, 500);
  const gclid = clean(submission.gclid || attribution.gclid, 240);
  const fbclid = clean(submission.fbclid || attribution.fbclid, 240);

  return {
    source,
    medium,
    campaign,
    term,
    content,
    campaignId,
    adsetId,
    adId,
    formId,
    formName,
    sourceLabel,
    channel,
    sourceType,
    landingPage,
    referrer,
    gclid,
    fbclid,
    clickIds: {
      gclid,
      fbclid,
    },
  };
}

function buildTouchWriteSnapshot(base: LeadTouchSnapshot) {
  return {
    ...base,
    clickIds: {
      gclid: base.gclid,
      fbclid: base.fbclid,
    },
    occurredAt: FieldValue.serverTimestamp(),
  };
}

export function buildLeadAttributionPatch(input: BuildLeadAttributionPatchInput): BuildLeadAttributionPatchResult {
  const existingData = input.existingData || {};
  const currentTouch = buildTouch(input);
  const existingFirstTouch = buildTouchFromExisting(existingData, "first_touch");
  const existingLastTouch = buildTouchFromExisting(existingData, "last_touch");
  const existingAssists = readLeadAssistedTouches(existingData).map((item) => ({
    ...item,
    clickIds: item.clickIds,
  })) as LeadTouchSnapshot[];

  const firstTouch = hasTouchSignal(existingFirstTouch)
    ? existingFirstTouch
    : buildTouchWriteSnapshot(currentTouch);
  const lastTouch = hasTouchSignal(currentTouch)
    ? buildTouchWriteSnapshot(currentTouch)
    : hasTouchSignal(existingLastTouch)
      ? existingLastTouch
      : buildTouchWriteSnapshot(currentTouch);
  const assistedTouches = buildBasicAssistedTouches({
    firstTouch,
    lastTouch,
    existingAssists,
  }) as LeadTouchSnapshot[];

  const attributionSource = currentTouch.source || clean(existingData.utmSource, 120) || firstTouch.source;
  const attributionMedium = currentTouch.medium || clean(existingData.utmMedium, 120) || firstTouch.medium;
  const attributionCampaign =
    currentTouch.campaign || clean(existingData.utmCampaign || existingData.campaignName, 180) || firstTouch.campaign;
  const attributionTerm = currentTouch.term || clean(existingData.utmTerm, 160) || firstTouch.term;
  const attributionContent = currentTouch.content || clean(existingData.utmContent, 240) || firstTouch.content;
  const gclid = currentTouch.gclid || clean(existingData.gclid, 240) || firstTouch.gclid;
  const fbclid = currentTouch.fbclid || clean(existingData.fbclid, 240) || firstTouch.fbclid;
  const originLabel =
    currentTouch.sourceLabel || currentTouch.source || clean(existingData.origem, 140) || clean(input.sourceLabel, 140);
  const sourceLabel = currentTouch.sourceLabel || firstTouch.sourceLabel || clean(input.sourceLabel, 140);
  const campaignLabel = attributionCampaign || clean(existingData.campaignName, 180);
  const campaignId = currentTouch.campaignId || clean(existingData.campaignId, 180) || firstTouch.campaignId;
  const adsetId = currentTouch.adsetId || clean(existingData.adsetId, 180) || firstTouch.adsetId;
  const adId = currentTouch.adId || clean(existingData.adId, 180) || firstTouch.adId;
  const formId = currentTouch.formId || clean(existingData.formId, 180) || firstTouch.formId;
  const formName = currentTouch.formName || clean(existingData.formName, 140) || firstTouch.formName;
  const landingPage =
    currentTouch.landingPage || clean(existingData.landingPage, 500) || firstTouch.landingPage;
  const referrer = currentTouch.referrer || clean(existingData.referrer, 500) || firstTouch.referrer;
  const channel = currentTouch.channel || clean(existingData.channel, 80) || firstTouch.channel;
  const sourceType = currentTouch.sourceType || clean(existingData.sourceType, 80) || firstTouch.sourceType;

  return {
    patch: {
      origem: originLabel,
      campaignName: campaignLabel,
      campaignId,
      adsetId,
      adId,
      formId,
      formName,
      landingPage,
      referrer,
      utmSource: attributionSource,
      utmMedium: attributionMedium,
      utmCampaign: attributionCampaign,
      utmTerm: attributionTerm,
      utmContent: attributionContent,
      gclid,
      fbclid,
      first_touch: firstTouch,
      last_touch: lastTouch,
      assisted_touches: assistedTouches,
      attribution: {
        source: attributionSource,
        medium: attributionMedium,
        campaign: attributionCampaign,
        term: attributionTerm,
        content: attributionContent,
        campaignId,
        adsetId,
        adId,
        formId,
        formName,
        sourceLabel,
        channel,
        sourceType,
        landingPage,
        referrer,
        gclid,
        fbclid,
        clickIds: {
          gclid,
          fbclid,
        },
        firstTouch,
        lastTouch,
        assistedTouches,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    firstTouch,
    lastTouch,
    assistedTouches,
    originLabel,
    campaignLabel,
    sourceLabel,
  };
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
    sourceType,
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

  const attributionState = buildLeadAttributionPatch({
    existingData,
    attribution: input.attribution,
    submission: input.submission,
    sourceLabel,
    channel: input.channel,
    sourceType,
  });

  const notesParts = [
    mensagem ? `Mensagem: ${mensagem}` : "",
    ...(input.notes || []).map((item) => clean(item, 300)).filter(Boolean),
    attributionState.patch.utmSource ? `UTM source: ${String(attributionState.patch.utmSource)}` : "",
    attributionState.patch.utmMedium ? `UTM medium: ${String(attributionState.patch.utmMedium)}` : "",
    attributionState.patch.utmCampaign ? `UTM campaign: ${String(attributionState.patch.utmCampaign)}` : "",
    attributionState.patch.utmTerm ? `UTM term: ${String(attributionState.patch.utmTerm)}` : "",
    attributionState.patch.utmContent ? `UTM content: ${String(attributionState.patch.utmContent)}` : "",
    attributionState.patch.gclid ? `GCLID: ${String(attributionState.patch.gclid)}` : "",
    attributionState.patch.fbclid ? `FBCLID: ${String(attributionState.patch.fbclid)}` : "",
  ].filter(Boolean);

  await leadRef.set(
    {
      tenantId,
      nome: nome || clean(existingData.nome, 180) || "Lead sem nome",
      email: email || clean(existingData.email, 180),
      telefone: telefone || clean(existingData.telefone, 40),
      empresa: empresa || clean(existingData.empresa, 180),
      channel: clean(input.channel, 60) || clean(existingData.channel, 60),
      sourceType,
      sourceId: sourceId || clean(existingData.sourceId, 180),
      sourceLabel: attributionState.sourceLabel || sourceLabel || clean(existingData.sourceLabel, 140),
      externalProfileId: externalProfileId || clean(existingData.externalProfileId, 180),
      ownerId: clean(input.defaultOwnerId, 140) || clean(existingData.ownerId, 140) || null,
      owner: clean(input.defaultOwnerName, 140) || clean(existingData.owner, 140) || null,
      pipelineStage: normalizePipelineStageId(
        input.defaultPipelineStage || existingData.pipelineStage || existingData.stage || "captado"
      ),
      stage: normalizePipelineStageId(
        input.defaultPipelineStage || existingData.pipelineStage || existingData.stage || "captado"
      ),
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
      ...attributionState.patch,
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
      metadata: {
        tenantId,
        attributionSource: attributionState.patch.utmSource || "",
        attributionMedium: attributionState.patch.utmMedium || "",
        attributionCampaign: attributionState.patch.utmCampaign || "",
        gclid: attributionState.patch.gclid || "",
        fbclid: attributionState.patch.fbclid || "",
        firstTouchPreserved: hasTouchSignal(buildTouchFromExisting(existingData, "first_touch")),
      },
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
          utmSource: attributionState.patch.utmSource || "",
          utmMedium: attributionState.patch.utmMedium || "",
          utmCampaign: attributionState.patch.utmCampaign || "",
          utmTerm: attributionState.patch.utmTerm || "",
          utmContent: attributionState.patch.utmContent || "",
          gclid: attributionState.patch.gclid || "",
          fbclid: attributionState.patch.fbclid || "",
          landingPage: attributionState.patch.landingPage || "",
          referrer: attributionState.patch.referrer || "",
          firstTouch: attributionState.firstTouch,
          lastTouch: attributionState.lastTouch,
          assistedTouches: attributionState.assistedTouches,
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

    await dispatchLeadConversionEvents({
      tenantId,
      leadId: leadRef.id,
      reason: "lead_created",
    }).catch((error) => {
      console.error("Falha ao disparar conversoes do lead criado:", error);
    });

    await recordLeadConversionStep({
      tenantId,
      leadId: leadRef.id,
      step: "captado",
      source: clean(input.channel, 80) || "inbound",
      actorId: clean(input.automationActorId, 140) || "altum_inbound",
      actorName: clean(input.automationActorName, 140) || "ALTUM Inbound",
      detail: `Lead captado via ${clean(input.sourceLabel, 120) || "Inbound"}.`,
      metadata: {
        sourceType,
        sourceId: sourceId || null,
      },
    }).catch((error) => {
      console.error("Falha ao registrar trilha de conversao (captado):", error);
    });
  }

  await syncLeadCommercialState({
    tenantId,
    leadId: leadRef.id,
    actorId: clean(input.automationActorId, 140) || "altum_inbound",
    actorName: clean(input.automationActorName, 140) || "ALTUM Inbound",
    allowStageAdvance: true,
  });

  return {
    leadId: leadRef.id,
    created: !existingLead,
  };
}
