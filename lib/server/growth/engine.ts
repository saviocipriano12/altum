import { extractLeadAttributionSummary, isMeetingStatusCountable, isQualifiedLeadStage, isWonLeadStage, resolveLeadPotentialValue } from "@/lib/server/attribution";
import type { GrowthBriefing, GrowthBriefingInput, GrowthCampaignGroup, GrowthRow } from "./contracts";

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value && "_seconds" in value && typeof (value as { _seconds?: number })._seconds === "number") {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function dateRefToTime(value: unknown) {
  const raw = clean(value, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function inRange(value: unknown, from: number, to: number) {
  const date = toDate(value);
  if (!date) return false;
  const time = date.getTime();
  return time >= from && time < to;
}

function sourceLabelFrom(value: Record<string, unknown>) {
  const joined = [value.sourceLabel, value.source, value.channel, value.platform, value.origem]
    .map((item) => clean(item, 80).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (joined.includes("google")) return "Google Ads";
  if (joined.includes("meta") || joined.includes("facebook") || joined.includes("instagram")) return "Meta Ads";
  if (joined.includes("whatsapp")) return "WhatsApp";
  if (joined.includes("site_chat") || joined.includes("chat")) return "Site Chat";
  if (joined.includes("form")) return "Formulario";
  return clean(value.sourceLabel || value.source || value.channel || value.platform || value.origem, 80) || "Nao informado";
}

type MutableGroup = GrowthCampaignGroup & { totalScore: number; scoredLeads: number };

function createGroup(label: string, source = "Nao informado"): MutableGroup {
  const resolved = label || "Sem campanha";
  return {
    key: `${source}::${resolved}`.toLowerCase(),
    label: resolved,
    source,
    platform: "",
    campaignId: "",
    adAccountId: "",
    spend: 0,
    impressions: 0,
    clicks: 0,
    paidLeads: 0,
    lastTouchLeads: 0,
    qualifiedLeads: 0,
    wonLeads: 0,
    meetings: 0,
    waitingConversations: 0,
    potentialValue: 0,
    avgScore: 0,
    qualityRate: 0,
    winRate: 0,
    cpl: 0,
    costPerQualifiedLead: 0,
    costPerMeeting: 0,
    costPerSale: 0,
    evidence: [],
    totalScore: 0,
    scoredLeads: 0,
  };
}

function finalize(group: MutableGroup): GrowthCampaignGroup {
  const result: GrowthCampaignGroup = {
    ...group,
    spend: round(group.spend),
    potentialValue: round(group.potentialValue),
    avgScore: group.scoredLeads ? round(group.totalScore / group.scoredLeads, 1) : 0,
    qualityRate: group.lastTouchLeads ? round((group.qualifiedLeads / group.lastTouchLeads) * 100, 1) : 0,
    winRate: group.lastTouchLeads ? round((group.wonLeads / group.lastTouchLeads) * 100, 1) : 0,
    cpl: group.lastTouchLeads ? round(group.spend / group.lastTouchLeads) : 0,
    costPerQualifiedLead: group.qualifiedLeads ? round(group.spend / group.qualifiedLeads) : 0,
    costPerMeeting: group.meetings ? round(group.spend / group.meetings) : 0,
    costPerSale: group.wonLeads ? round(group.spend / group.wonLeads) : 0,
    evidence: group.evidence.slice(0, 5),
  };
  delete (result as Partial<MutableGroup>).totalScore;
  delete (result as Partial<MutableGroup>).scoredLeads;
  return result;
}

function campaignFromLead(lead: GrowthRow) {
  const attribution = extractLeadAttributionSummary(lead);
  const label = attribution.campaign || clean(lead.campaignName || lead.utmCampaign, 180) || "Sem campanha";
  const source = sourceLabelFrom({
    sourceLabel: attribution.sourceLabel || lead.sourceLabel,
    source: attribution.source || lead.utmSource,
    channel: attribution.channel || lead.channel,
    origem: lead.origem,
  });
  return { label, source };
}

function isWaiting(chat: GrowthRow) {
  const incoming = toDate(chat.lastClientMessageAt)?.getTime() || 0;
  const outgoing = toDate(chat.lastAgentMessageAt)?.getTime() || 0;
  const status = clean(chat.status, 40).toLowerCase();
  return incoming > 0 && incoming > outgoing && !["resolved", "archived", "closed"].includes(status);
}

export function buildGrowthDailyBriefing(input: GrowthBriefingInput): GrowthBriefing {
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new Error("INVALID_GROWTH_RANGE");
  }

  const groups = new Map<string, MutableGroup>();
  const getGroup = (label: string, source = "Nao informado", identifiers?: { platform?: string; campaignId?: string; adAccountId?: string }) => {
    const key = `${source}::${label || "Sem campanha"}`.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      if (existing.source === "Nao informado" && source !== "Nao informado") existing.source = source;
      if (!existing.platform && identifiers?.platform) existing.platform = identifiers.platform;
      if (!existing.campaignId && identifiers?.campaignId) existing.campaignId = identifiers.campaignId;
      if (!existing.adAccountId && identifiers?.adAccountId) existing.adAccountId = identifiers.adAccountId;
      return existing;
    }
    const created = createGroup(label, source);
    created.platform = identifiers?.platform || "";
    created.campaignId = identifiers?.campaignId || "";
    created.adAccountId = identifiers?.adAccountId || "";
    groups.set(key, created);
    return created;
  };

  const leadsById = new Map<string, GrowthRow>();
  for (const lead of input.leads) {
    leadsById.set(lead.id, lead);
    const createdAt = toDate(lead.createdAt)?.getTime();
    if (!createdAt || createdAt < from || createdAt >= to) continue;
    const campaign = campaignFromLead(lead);
    const group = getGroup(campaign.label, campaign.source);
    group.lastTouchLeads += 1;
    group.potentialValue += resolveLeadPotentialValue(lead);
    const score = typeof lead.score === "number" && Number.isFinite(lead.score) ? lead.score : null;
    if (score != null) {
      group.totalScore += score;
      group.scoredLeads += 1;
    }
    if (isQualifiedLeadStage(lead.pipelineStage || lead.stage)) group.qualifiedLeads += 1;
    if (isWonLeadStage(lead.pipelineStage || lead.stage)) group.wonLeads += 1;
    group.evidence.push(`Lead ${lead.id} atribuido a ${campaign.label}.`);
  }

  for (const snapshot of input.snapshots) {
    const time = dateRefToTime(snapshot.dateRef);
    if (time == null || time < from || time >= to) continue;
    const label = clean(snapshot.campaignName || snapshot.campaignId, 180) || "Sem campanha";
    const source = sourceLabelFrom(snapshot);
    const group = getGroup(label, source, {
      platform: clean(snapshot.platform, 40),
      campaignId: clean(snapshot.campaignId, 180),
      adAccountId: clean(snapshot.adAccountId, 180),
    });
    group.spend += toNumber(snapshot.spend);
    group.impressions += Math.round(toNumber(snapshot.impressions));
    group.clicks += Math.round(toNumber(snapshot.clicks));
    group.paidLeads += Math.round(toNumber(snapshot.leads));
    group.evidence.push(`Snapshot ${snapshot.id}: gasto ${round(toNumber(snapshot.spend))}, cliques ${Math.round(toNumber(snapshot.clicks))}.`);
  }

  for (const appointment of input.appointments) {
    if (!isMeetingStatusCountable(appointment.status)) continue;
    if (!inRange(appointment.startAt || appointment.scheduledAt || appointment.createdAt, from, to)) continue;
    const lead = leadsById.get(clean(appointment.leadId, 180));
    if (!lead) continue;
    const campaign = campaignFromLead(lead);
    getGroup(campaign.label, campaign.source).meetings += 1;
  }

  for (const chat of input.chats) {
    if (!isWaiting(chat)) continue;
    const lead = leadsById.get(clean(chat.leadId, 180));
    if (!lead) continue;
    const campaign = campaignFromLead(lead);
    getGroup(campaign.label, campaign.source).waitingConversations += 1;
  }

  const campaigns = Array.from(groups.values())
    .map(finalize)
    .sort((a, b) => b.wonLeads - a.wonLeads || b.qualifiedLeads - a.qualifiedLeads || b.spend - a.spend || b.lastTouchLeads - a.lastTouchLeads)
    .slice(0, 20);

  const winners = campaigns
    .filter((item) => item.wonLeads > 0 || item.qualityRate >= 40 || item.meetings > 0)
    .sort((a, b) => b.wonLeads - a.wonLeads || b.qualityRate - a.qualityRate || a.costPerSale - b.costPerSale)
    .slice(0, 5);

  const attention = campaigns
    .filter((item) => item.spend > 0 && item.wonLeads === 0 && (item.qualifiedLeads === 0 || item.qualityRate < 25))
    .sort((a, b) => b.spend - a.spend || b.lastTouchLeads - a.lastTouchLeads)
    .slice(0, 5);

  const totals = campaigns.reduce(
    (acc, item) => {
      acc.spend += item.spend;
      acc.impressions += item.impressions;
      acc.clicks += item.clicks;
      acc.paidLeads += item.paidLeads;
      acc.attributedLeads += item.lastTouchLeads;
      acc.qualifiedLeads += item.qualifiedLeads;
      acc.wonLeads += item.wonLeads;
      acc.meetings += item.meetings;
      acc.waitingConversations += item.waitingConversations;
      acc.potentialValue += item.potentialValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, paidLeads: 0, attributedLeads: 0, qualifiedLeads: 0, wonLeads: 0, meetings: 0, waitingConversations: 0, potentialValue: 0 }
  );

  const recommendations: GrowthBriefing["recommendations"] = [];
  if (attention[0]) {
    const target = attention[0];
    recommendations.push({
      type: "review_spend",
      title: `Revisar investimento em ${target.label}`,
      reason: `Houve gasto registrado, mas a campanha nao gerou venda e tem baixa qualificacao na janela analisada.`,
      evidence: target.evidence,
      nextAction: target.platform && target.campaignId ? {
        tool: "draft_campaign_pause",
        arguments: { platform: target.platform, campaignId: target.campaignId, ...(target.adAccountId ? { adAccountId: target.adAccountId } : {}) },
      } : undefined,
    });
  }
  if (winners[0]) {
    const target = winners[0];
    recommendations.push({
      type: "scale_winner",
      title: `Analisar aumento controlado em ${target.label}`,
      reason: `A campanha aparece entre as melhores por venda, qualificacao ou reuniao. Criar rascunho antes de alterar verba.`,
      evidence: target.evidence,
      nextAction: target.platform && target.campaignId ? {
        tool: "draft_campaign_budget_change",
        arguments: { platform: target.platform, campaignId: target.campaignId, ...(target.adAccountId ? { adAccountId: target.adAccountId } : {}) },
        requiredInputs: ["currentDailyBudget", "proposedDailyBudget", "currency", "reason", "evidence"],
      } : undefined,
    });
  }
  const waiting = campaigns.filter((item) => item.waitingConversations > 0).sort((a, b) => b.waitingConversations - a.waitingConversations)[0];
  if (waiting) {
    recommendations.push({
      type: "follow_up",
      title: `Responder leads pagos de ${waiting.label}`,
      reason: `${waiting.waitingConversations} conversa(s) atribuida(s) a essa campanha aguardam retorno.`,
      evidence: waiting.evidence,
    });
  }

  return {
    from: input.from,
    to: input.to,
    totals: { ...totals, spend: round(totals.spend), potentialValue: round(totals.potentialValue) },
    campaigns,
    winners,
    attention,
    recommendations,
    coverage: "Briefing baseado em leads, chats, appointments e campaign_snapshots acessiveis. Nao executa mudancas em campanhas e nao presume receita sem registro comercial.",
  };
}
