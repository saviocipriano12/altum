import { createHash, randomBytes } from "node:crypto";

export const GROWTH_EVENT_NAMES = [
  "page_view",
  "cta_clicked",
  "whatsapp_clicked",
  "form_started",
  "form_submitted",
  "product_viewed",
  "checkout_started",
  "purchase_completed",
] as const;

export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[number];

export type GrowthTrackingConfig = {
  enabled: boolean;
  publicWriteKey: string;
  allowedDomains: string[];
  consentMode: "required" | "implicit";
};

export type NormalizedGrowthEvent = {
  eventId: string;
  name: GrowthEventName;
  occurredAt: string;
  anonymousId: string;
  sessionId: string;
  externalId: string;
  url: string;
  path: string;
  title: string;
  referrer: string;
  value: number;
  currency: string;
  properties: Record<string, string | number | boolean | null>;
  attribution: {
    source: string;
    medium: string;
    campaign: string;
    content: string;
    term: string;
    gclid: string;
    fbclid: string;
  };
};

export type GrowthTrackingRow = { id?: string } & Record<string, unknown>;

export function buildTrackingOverview(rows: GrowthTrackingRow[]) {
  const totals = { events: 0, visitors: 0, sessions: 0, pageViews: 0, conversions: 0, sales: 0, revenue: 0 };
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const funnel: Record<string, number> = Object.fromEntries(GROWTH_EVENT_NAMES.map((name) => [name, 0]));
  const campaigns = new Map<string, { campaign: string; source: string; events: number; conversions: number; sales: number; revenue: number }>();
  for (const row of rows) {
    const name = cleanText(row.name, 60);
    if (!EVENT_SET.has(name)) continue;
    totals.events += 1;
    funnel[name] += 1;
    const visitor = cleanText(row.anonymousId, 120);
    const session = cleanText(row.sessionId, 120);
    if (visitor) visitors.add(visitor);
    if (session) sessions.add(session);
    if (["form_submitted", "whatsapp_clicked"].includes(name)) totals.conversions += 1;
    const value = finiteNumber(row.value, 0, 100_000_000);
    if (name === "page_view") totals.pageViews += 1;
    if (name === "purchase_completed") { totals.sales += 1; totals.revenue += value; }
    const attribution = row.attribution && typeof row.attribution === "object" ? row.attribution as Record<string, unknown> : {};
    const campaign = cleanText(attribution.campaign, 240) || "Sem campanha";
    const source = cleanText(attribution.source, 180) || "Direto";
    const key = `${source}::${campaign}`.toLowerCase();
    const group = campaigns.get(key) || { campaign, source, events: 0, conversions: 0, sales: 0, revenue: 0 };
    group.events += 1;
    if (["form_submitted", "whatsapp_clicked"].includes(name)) group.conversions += 1;
    if (name === "purchase_completed") { group.sales += 1; group.revenue += value; }
    campaigns.set(key, group);
  }
  totals.visitors = visitors.size;
  totals.sessions = sessions.size;
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  return {
    totals,
    funnel,
    byCampaign: Array.from(campaigns.values()).map((item) => ({ ...item, revenue: Math.round(item.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue || b.sales - a.sales || b.conversions - a.conversions || b.events - a.events)
      .slice(0, 20),
  };
}

const EVENT_SET = new Set<string>(GROWTH_EVENT_NAMES);

export function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeDomain(value: unknown) {
  const raw = cleanText(value, 240).toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

export function normalizeDomains(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeDomain).filter(Boolean))).slice(0, 20);
}

export function originIsAllowed(origin: string | null, allowedDomains: string[]) {
  if (!origin) return true;
  let hostname = "";
  try {
    hostname = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function createPublicWriteKey() {
  return `alt_pk_${randomBytes(18).toString("base64url")}`;
}

export function eventDocumentId(tenantId: string, eventId: string) {
  return createHash("sha256").update(`${tenantId}:${eventId}`).digest("hex");
}

function finiteNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function safeUrl(value: unknown, max = 1200) {
  const raw = cleanText(value, max);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (!key.toLowerCase().startsWith("utm_") && !["gclid", "fbclid"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().slice(0, max);
  } catch {
    return "";
  }
}

function safeProperties(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    const key = cleanText(rawKey, 60).replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!key) continue;
    if (typeof rawValue === "string") result[key] = cleanText(rawValue, 500);
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) result[key] = rawValue;
    else if (typeof rawValue === "boolean" || rawValue === null) result[key] = rawValue;
  }
  return result;
}

export function normalizeGrowthEvent(value: unknown, now = new Date()): NormalizedGrowthEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = cleanText(row.name, 60);
  if (!EVENT_SET.has(name)) return null;
  const eventId = cleanText(row.eventId, 120);
  const anonymousId = cleanText(row.anonymousId, 120);
  const sessionId = cleanText(row.sessionId, 120);
  if (!eventId || !anonymousId || !sessionId) return null;

  const candidateDate = new Date(cleanText(row.occurredAt, 50));
  const maxFuture = now.getTime() + 5 * 60_000;
  const minPast = now.getTime() - 90 * 24 * 60 * 60_000;
  const occurredAt = !Number.isNaN(candidateDate.getTime()) && candidateDate.getTime() >= minPast && candidateDate.getTime() <= maxFuture
    ? candidateDate
    : now;
  const attributionInput = row.attribution && typeof row.attribution === "object"
    ? row.attribution as Record<string, unknown>
    : {};
  const currency = cleanText(row.currency, 3).toUpperCase();

  return {
    eventId,
    name: name as GrowthEventName,
    occurredAt: occurredAt.toISOString(),
    anonymousId,
    sessionId,
    externalId: cleanText(row.externalId, 180),
    url: safeUrl(row.url),
    path: cleanText(row.path, 500),
    title: cleanText(row.title, 240),
    referrer: safeUrl(row.referrer),
    value: finiteNumber(row.value, 0, 100_000_000),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BRL",
    properties: safeProperties(row.properties),
    attribution: {
      source: cleanText(attributionInput.source, 180),
      medium: cleanText(attributionInput.medium, 180),
      campaign: cleanText(attributionInput.campaign, 240),
      content: cleanText(attributionInput.content, 240),
      term: cleanText(attributionInput.term, 240),
      gclid: cleanText(attributionInput.gclid, 300),
      fbclid: cleanText(attributionInput.fbclid, 300),
    },
  };
}

export function parseTrackingConfig(value: Record<string, unknown> | undefined): GrowthTrackingConfig {
  return {
    enabled: value?.enabled === true,
    publicWriteKey: cleanText(value?.publicWriteKey, 100),
    allowedDomains: normalizeDomains(value?.allowedDomains),
    consentMode: value?.consentMode === "implicit" ? "implicit" : "required",
  };
}
