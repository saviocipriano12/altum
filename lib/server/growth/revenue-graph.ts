import { extractLeadAttributionSummary, isMeetingStatusCountable, isQualifiedLeadStage, isWonLeadStage, resolveLeadPotentialValue } from "@/lib/server/attribution";

export type RevenueGraphRow = { id: string } & Record<string, unknown>;
export type RevenueGraphInput = {
  events: RevenueGraphRow[];
  leads: RevenueGraphRow[];
  chats: RevenueGraphRow[];
  appointments: RevenueGraphRow[];
  proposals: RevenueGraphRow[];
  finance: RevenueGraphRow[];
  snapshots: RevenueGraphRow[];
  from: string;
  to: string;
};

function clean(value: unknown, max = 240) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function time(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().getTime();
  if (typeof value === "object" && value && "_seconds" in value) return number((value as { _seconds?: unknown })._seconds) * 1000;
  return null;
}
function inRange(value: unknown, from: number, to: number) { const parsed = time(value); return parsed != null && parsed >= from && parsed < to; }
function paid(row: RevenueGraphRow) { return ["pago", "paid", "recebido", "completed"].includes(clean(row.status, 40).toLowerCase()) && clean(row.tipo, 40).toLowerCase() !== "despesa"; }
function sourceName(source: string) {
  const normalized = source.toLowerCase();
  if (normalized.includes("google")) return "Google Ads";
  if (["meta", "facebook", "instagram"].some((item) => normalized.includes(item))) return "Meta Ads";
  if (normalized.includes("whatsapp")) return "WhatsApp";
  return source || "Direto";
}

type MutableCampaign = {
  key: string; source: string; campaign: string; visitors: Set<string>; sessions: Set<string>;
  pageViews: number; leads: Set<string>; conversations: Set<string>; qualified: Set<string>;
  meetings: Set<string>; proposals: Set<string>; won: Set<string>; customers: Set<string>;
  revenue: number; potentialValue: number; spend: number; clicks: number; impressions: number;
};

export function buildRevenueGraph(input: RevenueGraphInput) {
  const from = Date.parse(input.from), to = Date.parse(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("INVALID_REVENUE_GRAPH_RANGE");
  const groups = new Map<string, MutableCampaign>();
  const allVisitors = new Set<string>();
  const allSessions = new Set<string>();
  const groupFor = (sourceRaw: string, campaignRaw: string) => {
    const source = sourceName(sourceRaw);
    const campaign = campaignRaw || "Sem campanha";
    const key = `${source}::${campaign}`.toLowerCase();
    const found = groups.get(key);
    if (found) return found;
    const created: MutableCampaign = { key, source, campaign, visitors: new Set(), sessions: new Set(), pageViews: 0, leads: new Set(), conversations: new Set(), qualified: new Set(), meetings: new Set(), proposals: new Set(), won: new Set(), customers: new Set(), revenue: 0, potentialValue: 0, spend: 0, clicks: 0, impressions: 0 };
    groups.set(key, created);
    return created;
  };

  for (const event of input.events) {
    if (!inRange(event.occurredAt, from, to)) continue;
    const attribution = event.attribution && typeof event.attribution === "object" ? event.attribution as Record<string, unknown> : {};
    const group = groupFor(clean(attribution.source, 180), clean(attribution.campaign, 240));
    const visitor = clean(event.anonymousId, 120), session = clean(event.sessionId, 120);
    if (visitor) { group.visitors.add(visitor); allVisitors.add(visitor); }
    if (session) { group.sessions.add(session); allSessions.add(session); }
    if (event.name === "page_view") group.pageViews += 1;
  }

  for (const snapshot of input.snapshots) {
    const dateRef = clean(snapshot.dateRef, 20);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRef) || !inRange(`${dateRef}T00:00:00.000Z`, from, to)) continue;
    const group = groupFor(clean(snapshot.platform || snapshot.source, 100), clean(snapshot.campaignName || snapshot.campaignId, 240));
    group.spend += number(snapshot.spend); group.clicks += number(snapshot.clicks); group.impressions += number(snapshot.impressions);
  }

  const cohort = input.leads.filter((lead) => inRange(lead.createdAt, from, to));
  const cohortIds = new Set(cohort.map((lead) => lead.id));
  const leadGroup = new Map<string, MutableCampaign>();
  for (const lead of cohort) {
    const attribution = extractLeadAttributionSummary(lead);
    const group = groupFor(attribution.sourceLabel || attribution.source || clean(lead.origem, 140), attribution.campaign || "Sem campanha");
    leadGroup.set(lead.id, group); group.leads.add(lead.id); group.potentialValue += resolveLeadPotentialValue(lead);
    if (isQualifiedLeadStage(lead.pipelineStage || lead.stage)) group.qualified.add(lead.id);
    if (isWonLeadStage(lead.pipelineStage || lead.stage)) group.won.add(lead.id);
  }
  for (const chat of input.chats) {
    const leadId = clean(chat.leadId, 180); const group = leadGroup.get(leadId);
    if (group && cohortIds.has(leadId)) group.conversations.add(leadId);
  }
  for (const appointment of input.appointments) {
    const leadId = clean(appointment.leadId, 180); const group = leadGroup.get(leadId);
    if (group && isMeetingStatusCountable(appointment.status)) group.meetings.add(leadId);
  }
  for (const proposal of input.proposals) {
    const leadId = clean(proposal.leadId, 180); const group = leadGroup.get(leadId);
    if (group && !["perdido", "cancelado"].includes(clean(proposal.status, 40).toLowerCase())) group.proposals.add(leadId);
  }
  for (const entry of input.finance) {
    const leadId = clean(entry.leadId, 180); const group = leadGroup.get(leadId);
    if (!group || !paid(entry)) continue;
    group.customers.add(leadId); group.revenue += number(entry.valor);
  }

  const serialize = (group: MutableCampaign) => ({
    key: group.key, source: group.source, campaign: group.campaign,
    visitors: group.visitors.size, sessions: group.sessions.size, pageViews: group.pageViews,
    leads: group.leads.size, conversations: group.conversations.size, qualified: group.qualified.size,
    meetings: group.meetings.size, proposals: group.proposals.size, won: group.won.size, customers: group.customers.size,
    revenue: round(group.revenue), potentialValue: round(group.potentialValue), spend: round(group.spend),
    clicks: Math.round(group.clicks), impressions: Math.round(group.impressions),
    leadToSaleRate: group.leads.size ? round((group.won.size / group.leads.size) * 100) : 0,
    roas: group.spend ? round(group.revenue / group.spend) : 0,
  });
  const campaigns = Array.from(groups.values()).map(serialize).sort((a, b) => b.revenue - a.revenue || b.won - a.won || b.leads - a.leads || b.spend - a.spend).slice(0, 30);
  const totals = campaigns.reduce((acc, item) => {
    acc.visitors += item.visitors; acc.sessions += item.sessions; acc.pageViews += item.pageViews; acc.leads += item.leads;
    acc.conversations += item.conversations; acc.qualified += item.qualified; acc.meetings += item.meetings; acc.proposals += item.proposals;
    acc.won += item.won; acc.customers += item.customers; acc.revenue += item.revenue; acc.potentialValue += item.potentialValue; acc.spend += item.spend;
    return acc;
  }, { visitors: 0, sessions: 0, pageViews: 0, leads: 0, conversations: 0, qualified: 0, meetings: 0, proposals: 0, won: 0, customers: 0, revenue: 0, potentialValue: 0, spend: 0 });
  totals.revenue = round(totals.revenue); totals.potentialValue = round(totals.potentialValue); totals.spend = round(totals.spend);
  totals.visitors = allVisitors.size; totals.sessions = allSessions.size;
  const stages = [
    ["visitors", "Visitantes", totals.visitors], ["leads", "Leads", totals.leads], ["conversations", "Conversas", totals.conversations],
    ["qualified", "Qualificados", totals.qualified], ["meetings", "Reunioes", totals.meetings], ["proposals", "Propostas", totals.proposals],
    ["won", "Vendas ganhas", totals.won], ["customers", "Pagamentos", totals.customers],
  ].map(([id, label, value], index, array) => ({ id, label, value, conversionFromPrevious: index === 0 || !Number(array[index - 1][2]) ? null : round((Number(value) / Number(array[index - 1][2])) * 100) }));
  return {
    cohort: { mode: "leads_acquired_in_window", from: input.from, to: input.to }, totals: { ...totals, roas: totals.spend ? round(totals.revenue / totals.spend) : 0 }, stages, campaigns,
    coverage: { leadsInCohort: cohort.length, trackedEvents: input.events.filter((event) => inRange(event.occurredAt, from, to)).length, linkedTrackedEvents: input.events.filter((event) => inRange(event.occurredAt, from, to) && cohortIds.has(clean(event.externalId, 180))).length },
  };
}
