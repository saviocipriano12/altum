import { normalizePipelineStageId } from "@/lib/pipeline";

export type AttributionTouch = {
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

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function emptyAttributionTouch(): AttributionTouch {
  return {
    source: "",
    medium: "",
    campaign: "",
    term: "",
    content: "",
    campaignId: "",
    adsetId: "",
    adId: "",
    formId: "",
    formName: "",
    sourceLabel: "",
    channel: "",
    sourceType: "",
    landingPage: "",
    referrer: "",
    gclid: "",
    fbclid: "",
    clickIds: {
      gclid: "",
      fbclid: "",
    },
  };
}

export function normalizeAttributionTouch(value: unknown): AttributionTouch {
  const touch = readObject(value);
  const clickIds = readObject(touch.clickIds);

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
    gclid: clean(touch.gclid || clickIds.gclid, 240),
    fbclid: clean(touch.fbclid || clickIds.fbclid, 240),
    clickIds: {
      gclid: clean(touch.gclid || clickIds.gclid, 240),
      fbclid: clean(touch.fbclid || clickIds.fbclid, 240),
    },
    occurredAt: touch.occurredAt,
  };
}

export function hasAttributionTouchSignal(touch: AttributionTouch) {
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

export function areTouchesEquivalent(left: AttributionTouch, right: AttributionTouch) {
  return (
    left.source === right.source &&
    left.medium === right.medium &&
    left.campaign === right.campaign &&
    left.term === right.term &&
    left.content === right.content &&
    left.campaignId === right.campaignId &&
    left.adsetId === right.adsetId &&
    left.adId === right.adId &&
    left.formId === right.formId &&
    left.formName === right.formName &&
    left.sourceLabel === right.sourceLabel &&
    left.channel === right.channel &&
    left.sourceType === right.sourceType &&
    left.landingPage === right.landingPage &&
    left.referrer === right.referrer &&
    left.gclid === right.gclid &&
    left.fbclid === right.fbclid
  );
}

export function readLeadTouch(source: Record<string, unknown>, key: "first_touch" | "last_touch"): AttributionTouch {
  const topLevel = normalizeAttributionTouch(source[key]);
  if (hasAttributionTouchSignal(topLevel)) return topLevel;

  const attribution = readObject(source.attribution);
  const nested = normalizeAttributionTouch(key === "first_touch" ? attribution.firstTouch : attribution.lastTouch);
  if (hasAttributionTouchSignal(nested)) return nested;

  return emptyAttributionTouch();
}

export function readLeadAssistedTouches(source: Record<string, unknown>) {
  const topLevel = Array.isArray(source.assisted_touches) ? source.assisted_touches : [];
  if (topLevel.length > 0) {
    return topLevel
      .map((item) => normalizeAttributionTouch(item))
      .filter((item) => hasAttributionTouchSignal(item));
  }

  const attribution = readObject(source.attribution);
  const nested = Array.isArray(attribution.assistedTouches) ? attribution.assistedTouches : [];
  return nested
    .map((item) => normalizeAttributionTouch(item))
    .filter((item) => hasAttributionTouchSignal(item));
}

export function buildBasicAssistedTouches(input: {
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
  existingAssists?: AttributionTouch[];
}) {
  const items = [...(input.existingAssists || [])];

  if (
    hasAttributionTouchSignal(input.firstTouch) &&
    hasAttributionTouchSignal(input.lastTouch) &&
    !areTouchesEquivalent(input.firstTouch, input.lastTouch)
  ) {
    items.unshift(input.firstTouch);
  }

  const unique: AttributionTouch[] = [];
  for (const item of items) {
    if (!hasAttributionTouchSignal(item)) continue;
    if (areTouchesEquivalent(item, input.lastTouch)) continue;
    if (unique.some((entry) => areTouchesEquivalent(entry, item))) continue;
    unique.push(item);
  }

  return unique.slice(0, 3);
}

export function extractLeadAttributionSummary(source: Record<string, unknown>) {
  const firstTouch = readLeadTouch(source, "first_touch");
  const lastTouch = readLeadTouch(source, "last_touch");
  const assists = readLeadAssistedTouches(source);

  return {
    firstTouch,
    lastTouch,
    assistedTouches: assists,
    hasAssist: assists.length > 0,
    source: lastTouch.source || firstTouch.source || clean(source.utmSource, 120),
    medium: lastTouch.medium || firstTouch.medium || clean(source.utmMedium, 120),
    campaign:
      lastTouch.campaign || firstTouch.campaign || clean(source.campaignName || source.utmCampaign, 180),
    channel: lastTouch.channel || firstTouch.channel || clean(source.channel, 80),
    sourceLabel: lastTouch.sourceLabel || firstTouch.sourceLabel || clean(source.origem, 140),
  };
}

export function isQualifiedLeadStage(stageValue: unknown) {
  return ["qualificacao", "proposta", "fechamento", "ganho"].includes(
    normalizePipelineStageId(stageValue || "captado")
  );
}

export function isWonLeadStage(stageValue: unknown) {
  return normalizePipelineStageId(stageValue || "captado") === "ganho";
}

export function resolveLeadPotentialValue(source: Record<string, unknown>) {
  const potentialValue = Number(source.potentialValue ?? source.valorPotencial ?? 0);
  return Number.isFinite(potentialValue) ? potentialValue : 0;
}

export function isMeetingStatusCountable(status: unknown) {
  const normalized = clean(status, 40).toLowerCase();
  return normalized === "scheduled" || normalized === "confirmed" || normalized === "completed";
}
