/**
 * Event-name matching is adapted from Dittofeed's MIT-licensed
 * packages/isomorphic-lib/src/events.ts at commit
 * 52b2bee909744d07dd5d409fd3974d4b95c66766.
 */
import { extractLeadAttributionSummary, isMeetingStatusCountable, isQualifiedLeadStage, isWonLeadStage } from "@/lib/server/attribution";
import type { GrowthRow } from "./contracts";

export function doesGrowthEventNameMatch(pattern: string, event: string): boolean {
  if (pattern.endsWith("*")) return event.startsWith(pattern.slice(0, -1));
  return pattern === event;
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function inRange(value: unknown, from: number, to: number) {
  const parsed = date(value)?.getTime();
  return parsed != null && parsed >= from && parsed < to;
}

function sourceOf(lead: GrowthRow) {
  const attribution = extractLeadAttributionSummary(lead);
  return {
    source: clean(attribution.sourceLabel || attribution.source || lead.sourceLabel || lead.utmSource || lead.origem, 100) || "Nao informado",
    campaign: clean(attribution.campaign || lead.campaignName || lead.utmCampaign) || "Sem campanha",
  };
}

export function buildLeadJourneys(input: {
  leads: GrowthRow[];
  chats: GrowthRow[];
  appointments: GrowthRow[];
  from: string;
  to: string;
  source?: string;
  eventPattern?: string;
  limit?: number;
}) {
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("INVALID_GROWTH_RANGE");
  const requestedSource = clean(input.source, 100).toLocaleLowerCase("pt-BR");
  const pattern = clean(input.eventPattern, 100) || "*";
  const chatsByLead = new Map<string, GrowthRow[]>();
  const appointmentsByLead = new Map<string, GrowthRow[]>();
  for (const chat of input.chats) {
    const leadId = clean(chat.leadId);
    if (leadId) chatsByLead.set(leadId, [...(chatsByLead.get(leadId) || []), chat]);
  }
  for (const appointment of input.appointments) {
    const leadId = clean(appointment.leadId);
    if (leadId) appointmentsByLead.set(leadId, [...(appointmentsByLead.get(leadId) || []), appointment]);
  }

  const journeys = input.leads.flatMap((lead) => {
    const attribution = sourceOf(lead);
    if (requestedSource && !`${attribution.source} ${attribution.campaign}`.toLocaleLowerCase("pt-BR").includes(requestedSource)) return [];
    const events: Array<{ type: string; occurredAt: string | null; evidence: string }> = [];
    const push = (type: string, value: unknown, evidence: string) => {
      if (!doesGrowthEventNameMatch(pattern, type) || !inRange(value, from, to)) return;
      events.push({ type, occurredAt: date(value)?.toISOString() || null, evidence });
    };
    push("lead_created", lead.createdAt, `Lead atribuido a ${attribution.source} / ${attribution.campaign}.`);
    const conversations = chatsByLead.get(lead.id) || [];
    for (const chat of conversations) push("conversation_started", chat.createdAt || chat.lastMessageTime, `Conversa ${chat.id} registrada.`);
    if (isQualifiedLeadStage(lead.pipelineStage || lead.stage)) push("lead_qualified", lead.stageUpdatedAt || lead.updatedAt, "Etapa comercial atual e qualificada.");
    for (const appointment of appointmentsByLead.get(lead.id) || []) {
      if (isMeetingStatusCountable(appointment.status)) push("meeting_scheduled", appointment.startAt || appointment.scheduledAt || appointment.createdAt, `Agenda ${appointment.id} registrada.`);
    }
    if (isWonLeadStage(lead.pipelineStage || lead.stage)) push("sale_won", lead.stageUpdatedAt || lead.updatedAt, "Etapa comercial atual indica venda ganha.");
    events.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
    return events.length ? [{
      leadId: lead.id,
      leadName: clean(lead.nome || lead.name) || "Lead",
      source: attribution.source,
      campaign: attribution.campaign,
      currentStage: clean(lead.pipelineStage || lead.stage, 60),
      events,
    }] : [];
  }).slice(0, Math.min(100, Math.max(1, input.limit || 50)));

  const eventCounts: Record<string, number> = {};
  for (const journey of journeys) for (const event of journey.events) eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  return {
    journeys,
    eventCounts,
    matchedLeads: journeys.length,
    sourceFilter: input.source || null,
    eventPattern: pattern,
    source: {
      project: "dittofeed/dittofeed",
      license: "MIT",
      upstreamCommit: "52b2bee909744d07dd5d409fd3974d4b95c66766",
      adaptation: "Wildcard de eventos e modelo de jornada adaptados ao grafo comercial da Altum.",
    },
  };
}
