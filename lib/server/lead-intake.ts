import { createHash } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { INTAKE_CREATED_JOB_TYPE, intakeCreationJobId, processIntakeCreation } from "@/lib/server/crm/intake-occurrence";
import { buildBasicAssistedTouches, readLeadAssistedTouches } from "@/lib/server/attribution";
import { syncLeadCommercialState } from "@/lib/server/crm/operations";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { recordLeadConversionStep } from "@/lib/server/conversion-trail";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { contactLinkReader, contactLinkedLeadIds } from "@/lib/server/crm/contact-links";

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
  fbc?: string;
  fbp?: string;
  ctwaClid?: string;
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
  fbc?: string | null;
  fbp?: string | null;
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
  skipLeadCreatedWorkflows?: boolean;
  preserveExistingAttribution?: boolean;
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
  fbc: string;
  fbp: string;
  ctwaClid: string;
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
  preserveExistingAttribution?: boolean;
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
    "instagram_comment",
    "instagram_new_follower",
    "facebook_messenger",
    "messenger_comment",
    "messenger_new_follower",
    "site_chat_conversation",
    "site_chat_widget_conversation",
    "crm_import",
  ].includes(sourceType);
}

type IntakeIdentity = {
  tenantId: string;
  email: string;
  telefone: string;
  externalProfileId: string;
  sourceId: string;
  sourceType: string;
  channel: string;
};

async function findExistingLead(input: IntakeIdentity, tx?: FirebaseFirestore.Transaction) {
  if (!input.channel && (input.externalProfileId || canMatchBySourceId(input.sourceType, input.sourceId))) {
    throw new Error("Identidade de origem sem escopo verificavel; informar canal antes de continuar.");
  }
  const selectors = [
    { field: "sourceId", value: canMatchBySourceId(input.sourceType, input.sourceId) ? input.sourceId : "", scoped: true },
    { field: "externalProfileId", value: input.externalProfileId, scoped: true },
    { field: "telefone", value: input.telefone, scoped: false },
    { field: "email", value: input.email, scoped: false },
  ];
  const matches = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const selector of selectors) {
    if (!selector.value) continue;
    // Purchases may legitimately share identifiers. Inspect every page before
    // distinguishing a person's intake anchor from their commercial records.
    const query = adminDb.collection("leads").where("tenantId", "==", input.tenantId)
      .where(selector.field, "==", selector.value).orderBy(FieldPath.documentId()).limit(200);
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    const candidates: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    while (true) {
      const pageQuery = cursor ? query.startAfter(cursor) : query;
      const snapshot = tx ? await tx.get(pageQuery) : await pageQuery.get();
      candidates.push(...snapshot.docs.filter(doc => {
      if (!selector.scoped) return true;
      const data = doc.data();
      const channel = clean(data.channel, 60).toLowerCase();
      const sourceType = clean(data.sourceType, 80).toLowerCase();
      if (selector.field === "sourceId" && sourceType && sourceType !== input.sourceType) return false;
      if (channel && channel !== input.channel) return false;
      if (!channel || !input.channel || (selector.field === "sourceId" && !sourceType)) {
        throw new Error("Identidade de origem sem escopo verificavel; revisar cadastro antes de continuar.");
      }
      return true;
      }));
      if (snapshot.size < 200) break;
      cursor = snapshot.docs.at(-1);
    }
    for (const candidate of candidates) matches.set(candidate.id, candidate);
  }
  if (!matches.size) return null;
  const anchors = [...matches.values()].filter(doc => doc.data().recordKind !== "opportunity");
  if (!anchors.length) throw new Error("Contexto de oportunidade necessario: uma negociacao nao pode substituir o cadastro de entrada do cliente.");
  if (anchors.length > 1) throw new Error("Identidade ambigua ou conflitante no intake; revisar cadastros antes de continuar.");
  const anchor = anchors[0], canonical = contactLinkReader(input.tenantId, tx);
  let requiresOpportunityContext = false;
  if (anchor.data().contactId) {
    const person = await canonical(anchor.data().contactId), linked = contactLinkedLeadIds(person.data()!);
    if (!linked.includes(anchor.id)) throw new Error("Identidade conflitante: cadastro sem vinculo reciproco com o cliente.");
    requiresOpportunityContext = linked.some(id => id !== anchor.id);
    for (const candidate of matches.values()) {
      if (candidate.id === anchor.id) continue;
      if (!candidate.data().contactId || (await canonical(candidate.data().contactId)).id !== person.id || !linked.includes(candidate.id)) {
        throw new Error("Identidade conflitante no intake; identificadores apontam para clientes diferentes.");
      }
    }
  } else if (matches.size > 1) {
    throw new Error("Identidade conflitante no intake; revisar vinculos do cliente antes de continuar.");
  }
  return { snapshot: anchor, requiresOpportunityContext };
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
    fbc: clean(touch.fbc, 300),
    fbp: clean(touch.fbp, 300),
    ctwaClid: clean(touch.ctwaClid || touch.ctwa_clid, 300),
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
      || touch.fbc
      || touch.fbp
      || touch.ctwaClid
  );
}

function hasCommercialAttributionSignal(touch: LeadTouchSnapshot) {
  return Boolean(
    touch.source || touch.medium || touch.campaign || touch.term || touch.content || touch.campaignId || touch.adsetId || touch.adId || touch.formId || touch.gclid || touch.fbclid || touch.fbc || touch.fbp || touch.ctwaClid || touch.landingPage || touch.referrer
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
  const fbc = clean(submission.fbc || attribution.fbc, 300);
  const fbp = clean(submission.fbp || attribution.fbp, 300);
  const ctwaClid = clean(attribution.ctwaClid, 300);

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
    fbc,
    fbp,
    ctwaClid,
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
  const preserveExistingAttribution = input.preserveExistingAttribution === true && hasTouchSignal(existingFirstTouch) && !hasCommercialAttributionSignal(currentTouch);

  const firstTouch = hasTouchSignal(existingFirstTouch)
    ? existingFirstTouch
    : buildTouchWriteSnapshot(currentTouch);
  const lastTouch = preserveExistingAttribution
    ? existingLastTouch
    : hasTouchSignal(currentTouch)
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
  const fbc = currentTouch.fbc || clean(existingData.fbc, 300) || firstTouch.fbc;
  const fbp = currentTouch.fbp || clean(existingData.fbp, 300) || firstTouch.fbp;
  const ctwaClid = currentTouch.ctwaClid || clean(existingData.ctwaClid, 300) || firstTouch.ctwaClid;
  const originLabel = preserveExistingAttribution
    ? clean(existingData.origem, 140) || existingLastTouch.sourceLabel || existingFirstTouch.sourceLabel || clean(input.sourceLabel, 140)
    : currentTouch.sourceLabel || currentTouch.source || clean(existingData.origem, 140) || clean(input.sourceLabel, 140);
  const sourceLabel = preserveExistingAttribution
    ? existingLastTouch.sourceLabel || existingFirstTouch.sourceLabel || clean(input.sourceLabel, 140)
    : currentTouch.sourceLabel || firstTouch.sourceLabel || clean(input.sourceLabel, 140);
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
      fbc,
      fbp,
      ctwaClid,
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
        fbc,
        fbp,
        ctwaClid,
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

/** Applies a newly observed campaign touch to an existing lead without replacing its first touch. */
export async function applyInboundCampaignAttribution(input: {
  tenantId: string;
  leadId: string;
  channel: string;
  sourceType: string;
  sourceLabel: string;
  campaign: {
    id?: string | null;
    name?: string | null;
    source?: string | null;
    medium?: string | null;
    adId?: string | null;
    clickId?: string | null;
  } | null;
  occurredAtMs?: number;
}) {
  if (!input.campaign || !input.leadId || !input.tenantId) return { applied: false };
  const campaign = { ...input.campaign };
  // A referral supplies an ad ID, not necessarily a campaign ID or campaign name.
  // Only enrich from a tenant-owned snapshot; an ad headline is not a campaign name.
  if (campaign.adId && (!campaign.id || !campaign.name)) {
    const snapshots = await adminDb.collection("ad_creative_snapshots")
      .where("tenantId", "==", input.tenantId).where("adId", "==", campaign.adId).get();
    const latest = snapshots.docs.sort((a, b) => String(b.data().dateRef || "").localeCompare(String(a.data().dateRef || "")))[0]?.data();
    if (latest) {
      campaign.id ||= clean(latest.campaignId, 180);
      campaign.name ||= clean(latest.campaignName, 180);
    }
  }
  const leadRef = adminDb.collection("leads").doc(input.leadId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(leadRef);
    if (!snap.exists) return { applied: false };
    const existingData = snap.data() as Record<string, unknown>;
    if (clean(existingData.tenantId, 140) !== clean(input.tenantId, 140)) {
      throw new Error("Lead fora do tenant na atribuicao inbound.");
    }
    const occurredAtMs = Number.isFinite(input.occurredAtMs) ? Number(input.occurredAtMs) : Date.now();
    if (Number(existingData.attributionLastInboundAtMs || 0) > occurredAtMs) {
      return { applied: false, reason: "older_campaign_touch" };
    }

    const state = buildLeadAttributionPatch({
      existingData,
      sourceLabel: input.sourceLabel,
      channel: input.channel,
      sourceType: input.sourceType,
      attribution: {
        source: clean(campaign.source, 120) || "meta",
        medium: clean(campaign.medium, 120) || `${input.channel}_referral`,
        campaign: clean(campaign.name, 180),
        campaignId: clean(campaign.id, 180),
        adId: clean(campaign.adId, 180),
        ctwaClid: clean(campaign.clickId, 300),
        sourceLabel: input.sourceLabel,
        channel: input.channel,
        sourceType: input.sourceType,
      },
    });

    tx.set(
      leadRef,
      {
        ...state.patch,
        attributionLastInboundAtMs: occurredAtMs,
        attributionUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { applied: true, firstTouch: state.firstTouch, lastTouch: state.lastTouch };
  });
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

  const identity: IntakeIdentity = {
    tenantId,
    email,
    telefone,
    externalProfileId,
    sourceId,
    sourceType,
    channel: clean(input.channel, 60).toLowerCase(),
  };
  const existingLead = await findExistingLead(identity);
  const proposedLeadRef = adminDb.collection("leads").doc();
  const eventId = proposedLeadRef.collection("events").doc().id;
  // Reuse the identity collection with a separate, validated protocol. Only
  // accepted CRM identifiers are bound; an observed alternative is not an alias.
  const bindings = ([{ field: "email", value: email }, { field: "telefone", value: telefone }] as const)
    .filter(binding => binding.value).map(binding => ({ ...binding,
      ref: adminDb.collection("lead_identities").doc(`intake_identity_${createHash("sha256")
        .update(JSON.stringify([tenantId, binding.field, binding.value])).digest("hex")}`),
    }));
  const submissionRef = input.submission ? adminDb.collection("capture_submissions").doc() : null;
  const { existingData, leadRef, created, requiresOpportunityContext } = await adminDb.runTransaction(async tx => {
  const bindingSnapshots = bindings.length ? await tx.getAll(...bindings.map(binding => binding.ref)) : [];
  const mappedIds = new Set<string>();
  for (let index = 0; index < bindingSnapshots.length; index++) {
    const snapshot = bindingSnapshots[index];
    if (!snapshot.exists) continue;
    const data = snapshot.data()!;
    if (data.tenantId !== tenantId || data.kind !== "intake_identity" || data.protocolVersion !== 1
      || data.field !== bindings[index].field || typeof data.leadId !== "string" || !/^[^/]{1,220}$/.test(data.leadId)) {
      throw new Error("Vinculo de identidade invalido; revisar intake.");
    }
    mappedIds.add(data.leadId);
  }
  if (mappedIds.size > 1) throw new Error("Identidade conflitante entre vinculos persistidos; revisar intake.");
  const selected = existingLead ? await tx.get(existingLead.snapshot.ref) : null;
  if (selected && (!selected.exists || selected.data()?.tenantId !== tenantId)) throw new Error("Lead selecionado foi excluido ou mudou de empresa; revisar intake.");
  const currentMatch = await findExistingLead(identity, tx);
  if (existingLead && currentMatch?.snapshot.id !== existingLead.snapshot.id) {
    throw new Error("Identidade mudou durante o intake; revisar entrada antes de continuar.");
  }
  const mappedId = mappedIds.values().next().value;
  if (mappedId && currentMatch?.snapshot.id !== mappedId) throw new Error("Identidade vinculada mudou ou esta ausente/excluida; revisar intake.");
  const leadRef = currentMatch?.snapshot.ref || proposedLeadRef;
  const requiresOpportunityContext = currentMatch?.requiresOpportunityContext === true;
  const latest = selected?.id === leadRef.id ? selected : await tx.get(leadRef);
  if (latest.exists && latest.data()?.tenantId !== tenantId) throw new Error("Identidade de outra empresa; revisar intake.");
  if (!currentMatch && latest.exists) throw new Error("Identidade mudou durante criacao; revisar intake.");
  const created = !latest.exists;
  const existingData = latest.exists ? latest.data() as Record<string, unknown> : {};
  const acceptedBindings = bindings.filter((binding, index) => {
    const accepted = binding.field === "email"
      ? clean(existingData.email, 180).toLowerCase() || email
      : normalizePhoneBR(clean(existingData.telefone, 40)) || telefone;
    if (bindingSnapshots[index].exists && accepted !== binding.value) throw new Error("Identidade vinculada mudou; revisar intake.");
    return accepted === binding.value;
  });
  let initialStage = clean(existingData.pipelineStage || existingData.stage, 180);
  if (!latest.exists || !initialStage) {
    const pipeline = await loadTenantPipelineInTransaction(tx, tenantId);
    const requested = normalizePipelineStageId(input.defaultPipelineStage, "");
    initialStage = pipeline.stages.find(stage => stage.id === requested)?.id || pipeline.stages[0]?.id || "";
    if (!initialStage) throw new Error("Funil sem etapa valida para entrada do cliente.");
  }

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
    preserveExistingAttribution: input.preserveExistingAttribution,
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

  tx.set(leadRef,
    {
      tenantId,
      ...(created ? { intakeCreationEventId: eventId } : {}),
      ...(!clean(existingData.nome, 180) ? { nome: nome || "Lead sem nome" } : {}),
      ...(!clean(existingData.email, 180) ? { email } : {}),
      ...(!clean(existingData.telefone, 40) ? { telefone } : {}),
      ...(!clean(existingData.empresa, 180) ? { empresa } : {}),
      channel: clean(input.channel, 60) || clean(existingData.channel, 60),
      sourceType,
      sourceId: sourceId || clean(existingData.sourceId, 180),
      sourceLabel: attributionState.sourceLabel || sourceLabel || clean(existingData.sourceLabel, 140),
      ...(!clean(existingData.externalProfileId, 180) ? { externalProfileId } : {}),
      ...(!clean(existingData.ownerId || existingData.assignedTo || existingData.ownerUserId, 180) ? {
        ownerId: clean(input.defaultOwnerId, 140) || null, owner: clean(input.defaultOwnerName, 140) || null,
      } : {}),
      ...(!latest.exists || !clean(existingData.pipelineStage || existingData.stage, 180) ? { pipelineStage: initialStage, stage: initialStage } : {}),
      ...(!isCrmFieldManuallyOwned(existingData, "tags") ? { tags: normalizedTags } : {}),
      ...(!requiresOpportunityContext ? { customFields: {
        ...((existingData.customFields && typeof existingData.customFields === "object")
          ? (existingData.customFields as Record<string, unknown>)
          : {}),
        ...customFields,
      } } : {}),
      ...(!clean(existingData.notes, 4000) ? { notes: notesParts.join(" | ") } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: !created
        ? existingData.createdAt || FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
      ...attributionState.patch,
    },
    { merge: true }
  );

  for (const binding of acceptedBindings) {
    if (!bindingSnapshots[bindings.indexOf(binding)].exists) tx.create(binding.ref, {
      tenantId, kind: "intake_identity", protocolVersion: 1, field: binding.field,
      leadId: leadRef.id, createdAt: FieldValue.serverTimestamp(),
    });
  }
  tx.create(leadRef.collection("events").doc(eventId), {
      tenantId,
      intakeCreated: created,
      intakeWorkflows: created ? input.skipLeadCreatedWorkflows ? "disabled" : "enabled" : "not_created",
      creationJobId: created && !input.skipLeadCreatedWorkflows ? intakeCreationJobId(eventId) : null,
      type: sourceType,
      title: created ? "Lead capturado" : "Nova entrada inbound",
      detail: `${sourceLabel} recebido pela plataforma.`,
      sourceType,
      sourceId,
      observed: { name: nome, email, phone: telefone, company: empresa, message: mensagem, notes: (input.notes || []).map(item => clean(item, 300)).filter(Boolean), customFields },
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
    });
    if (input.submission && submissionRef) tx.create(submissionRef, {
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
        });
    if (created && !input.skipLeadCreatedWorkflows) tx.create(adminDb.collection("jobs").doc(intakeCreationJobId(eventId)), {
      tenantId, type: INTAKE_CREATED_JOB_TYPE, protocolVersion: 1, leadId: leadRef.id, sourceEventId: eventId,
      sourceType, sourceId, channel: clean(input.channel, 60), workflowDecision: "enabled", initialStage,
      actorId: clean(input.automationActorId, 140) || "altum_inbound", actorName: clean(input.automationActorName, 140) || "ALTUM Inbound",
      status: "ready", attempts: 0, completionMeaning: "lead_creation_committed_automation_pending",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { existingData, leadRef, created, requiresOpportunityContext };
  });
  await upsertContactProfile({
      tenantId,
      phone: clean(existingData.telefone, 40) || telefone,
      email: clean(existingData.email, 180) || email,
      externalProfileId: clean(existingData.externalProfileId, 180) || externalProfileId,
      leadId: leadRef.id,
      channel: clean(input.channel, 60),
      name: clean(existingData.nome, 180) || nome,
      company: clean(existingData.empresa, 180) || empresa,
    });

  if (created && !input.skipLeadCreatedWorkflows) {
    await processIntakeCreation(intakeCreationJobId(eventId), tenantId);

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

  if (!requiresOpportunityContext) await syncLeadCommercialState({
    tenantId,
    leadId: leadRef.id,
    actorId: clean(input.automationActorId, 140) || "altum_inbound",
    actorName: clean(input.automationActorName, 140) || "ALTUM Inbound",
    allowStageAdvance: true,
  });

  return {
    leadId: leadRef.id,
    created,
    requiresOpportunityContext,
  };
}
