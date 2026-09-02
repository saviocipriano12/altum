import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePipelineStageId } from "@/lib/pipeline";
import {
  extractLeadAttributionSummary,
  isMeetingStatusCountable,
  isQualifiedLeadStage,
  isWonLeadStage,
} from "@/lib/server/attribution";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";

type GenericRow = { id: string } & Record<string, unknown>;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function parseDateRef(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(`${value.trim().slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatPtDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function safePct(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function queryByTenantOrClient(collectionName: string, tenantId: string, clientId: string, limit: number) {
  return adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(limit).get().then((snap) => {
    if (!snap.empty || !clientId || clientId === tenantId) return snap;
    return adminDb.collection(collectionName).where("clientId", "==", clientId).limit(limit).get();
  });
}

function filterByWindow(items: GenericRow[], getDate: (item: GenericRow) => Date | null, start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return items.filter((item) => {
    const date = getDate(item);
    if (!date) return false;
    const time = date.getTime();
    return time >= startMs && time <= endMs;
  });
}

function collectFirstResponseSamples(messages: GenericRow[], start: Date, end: Date, humanOnly = false) {
  const grouped = new Map<string, GenericRow[]>();

  for (const message of messages) {
    const chatId = String(message.chatId || "").trim();
    if (!chatId) continue;
    const list = grouped.get(chatId) || [];
    list.push(message);
    grouped.set(chatId, list);
  }

  const samples: Array<{ chatId: string; minutes: number; responderId: string }> = [];

  for (const [chatId, chatMessages] of grouped.entries()) {
    const ordered = [...chatMessages].sort(
      (a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0)
    );

    const firstClient = ordered.find((item) => {
      if (String(item.sender || "") !== "client") return false;
      const createdAt = toDate(item.createdAt);
      return Boolean(createdAt && createdAt >= start && createdAt <= end);
    });

    if (!firstClient) continue;

    const firstClientAt = toDate(firstClient.createdAt);
    if (!firstClientAt) continue;

    const firstAgentReply = ordered.find((item) => {
      if (String(item.sender || "") !== "agent") return false;
      if (humanOnly && !String(item.senderId || "").trim()) return false;
      const createdAt = toDate(item.createdAt);
      return Boolean(createdAt && createdAt.getTime() >= firstClientAt.getTime());
    });

    if (!firstAgentReply) continue;

    const firstAgentAt = toDate(firstAgentReply.createdAt);
    if (!firstAgentAt) continue;

    samples.push({
      chatId,
      minutes: minutesBetween(firstClientAt, firstAgentAt),
      responderId: String(firstAgentReply.senderId || "").trim(),
    });
  }

  return samples;
}

function stageLabel(stageId: string) {
  const stage = normalizePipelineStageId(stageId);
  if (stage === "captado") return "Captado";
  if (stage === "contato") return "Contato";
  if (stage === "qualificacao") return "Qualificacao";
  if (stage === "proposta") return "Proposta";
  if (stage === "fechamento") return "Fechamento";
  if (stage === "ganho") return "Ganho";
  if (stage === "perdido") return "Perdido";
  return stage;
}

function buildDailySeries(rangeDays: number, snapshots: GenericRow[], leads: GenericRow[]) {
  const days = Array.from({ length: rangeDays }, (_, index) => {
    const date = startOfDay(new Date(Date.now() - (rangeDays - index - 1) * 86400000));
    return {
      key: dateKey(date),
      label: formatPtDate(date),
      spend: 0,
      leads: 0,
      clicks: 0,
      impressions: 0,
    };
  });

  const byKey = new Map(days.map((item) => [item.key, item]));

  for (const snapshot of snapshots) {
    const key = dateKey(parseDateRef(snapshot.dateRef) || new Date(0));
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.spend += toNumber(snapshot.spend);
    bucket.leads += toNumber(snapshot.leads);
    bucket.clicks += toNumber(snapshot.clicks);
    bucket.impressions += toNumber(snapshot.impressions);
  }

  for (const lead of leads) {
    const createdAt = toDate(lead.createdAt);
    if (!createdAt) continue;
    const bucket = byKey.get(dateKey(startOfDay(createdAt)));
    if (!bucket) continue;
    bucket.leads += 1;
  }

  return days;
}

function isClosedChatStatus(value: unknown) {
  const status = String(value || "open").trim().toLowerCase();
  return status === "resolved" || status === "archived";
}

function normalizeQueueStatus(value: unknown) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "assigned_waiting") return "assigned_waiting";
  if (status === "assigned") return "assigned";
  if (status === "unassigned") return "unassigned";
  if (status === "triage") return "triage";
  if (status === "resolved") return "resolved";
  if (status === "archived") return "archived";
  return "open";
}

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isHotLead(lead: GenericRow) {
  const heat = cleanText(lead.heat, 40).toLowerCase();
  return heat === "hot" || heat.includes("quente");
}

function resolveCommercialChannelLabel(input: { source: string; sourceLabel: string; channel: string }) {
  const candidates = [input.sourceLabel, input.source, input.channel].filter(Boolean).join(" ").toLowerCase();
  if (candidates.includes("google")) return "Google Ads";
  if (candidates.includes("meta") || candidates.includes("facebook") || candidates.includes("instagram")) return "Meta Ads";
  if (candidates.includes("whatsapp")) return "WhatsApp";
  if (candidates.includes("site_chat") || candidates.includes("site chat") || candidates === "chat") return "Site Chat";
  if (candidates.includes("form")) return "Formulario";
  if (input.sourceLabel) return input.sourceLabel;
  if (input.source) return input.source;
  if (input.channel) return input.channel;
  return "Nao informado";
}

function resolveSnapshotChannelLabel(snapshot: GenericRow) {
  return resolveCommercialChannelLabel({
    source: cleanText(snapshot.platform, 80),
    sourceLabel: cleanText(snapshot.accountLabel, 140),
    channel: cleanText(snapshot.channelId || snapshot.adAccountId, 140),
  });
}

function buildCommercialAttribution(leads: GenericRow[], snapshots: GenericRow[], appointments: GenericRow[]) {
  type Group = {
    key: string;
    label: string;
    source?: string;
    lastTouchLeads: number;
    firstTouchLeads: number;
    assistedLeads: number;
    qualifiedLeads: number;
    wonLeads: number;
    meetings: number;
    hotLeads: number;
    totalScore: number;
    scoredLeads: number;
    spend: number;
    clicks: number;
    impressions: number;
    paidLeads: number;
    campaignCount?: number;
  };

  const channelMap = new Map<string, Group>();
  const campaignMap = new Map<string, Group>();

  const getChannelGroup = (label: string) => {
    const key = label.toLowerCase();
    const current = channelMap.get(key) || {
      key,
      label,
      lastTouchLeads: 0,
      firstTouchLeads: 0,
      assistedLeads: 0,
      qualifiedLeads: 0,
      wonLeads: 0,
      meetings: 0,
      hotLeads: 0,
      totalScore: 0,
      scoredLeads: 0,
      spend: 0,
      clicks: 0,
      impressions: 0,
      paidLeads: 0,
      campaignCount: 0,
    };
    channelMap.set(key, current);
    return current;
  };

  const getCampaignGroup = (label: string, source: string) => {
    const key = `${source.toLowerCase()}::${label.toLowerCase()}`;
    const current = campaignMap.get(key) || {
      key,
      label,
      source,
      lastTouchLeads: 0,
      firstTouchLeads: 0,
      assistedLeads: 0,
      qualifiedLeads: 0,
      wonLeads: 0,
      meetings: 0,
      hotLeads: 0,
      totalScore: 0,
      scoredLeads: 0,
      spend: 0,
      clicks: 0,
      impressions: 0,
      paidLeads: 0,
    };
    campaignMap.set(key, current);
    return current;
  };

  for (const lead of leads) {
    const attribution = extractLeadAttributionSummary(lead);
    const lastTouch = attribution.lastTouch;
    const firstTouch = attribution.firstTouch;
    const lastChannelLabel = resolveCommercialChannelLabel(lastTouch);
    const firstChannelLabel = resolveCommercialChannelLabel(firstTouch);
    const lastCampaignLabel =
      lastTouch.campaign || cleanText(lead.campaignName || lead.utmCampaign, 180) || "Sem campanha";
    const firstCampaignLabel = firstTouch.campaign || "Sem campanha";
    const qualified = isQualifiedLeadStage(lead.pipelineStage || lead.stage);
    const won = isWonLeadStage(lead.pipelineStage || lead.stage);
    const hot = isHotLead(lead);
    const score = typeof lead.score === "number" ? lead.score : null;

    const lastChannel = getChannelGroup(lastChannelLabel);
    lastChannel.lastTouchLeads += 1;
    if (qualified) lastChannel.qualifiedLeads += 1;
    if (won) lastChannel.wonLeads += 1;
    if (hot) lastChannel.hotLeads += 1;
    if (typeof score === "number") {
      lastChannel.totalScore += score;
      lastChannel.scoredLeads += 1;
    }

    const firstChannel = getChannelGroup(firstChannelLabel);
    firstChannel.firstTouchLeads += 1;

    const lastCampaign = getCampaignGroup(lastCampaignLabel, lastChannelLabel);
    lastCampaign.lastTouchLeads += 1;
    if (qualified) lastCampaign.qualifiedLeads += 1;
    if (won) lastCampaign.wonLeads += 1;
    if (hot) lastCampaign.hotLeads += 1;
    if (typeof score === "number") {
      lastCampaign.totalScore += score;
      lastCampaign.scoredLeads += 1;
    }

    const firstCampaign = getCampaignGroup(firstCampaignLabel, firstChannelLabel);
    firstCampaign.firstTouchLeads += 1;

    const seenAssistChannels = new Set<string>();
    const seenAssistCampaigns = new Set<string>();
    for (const touch of attribution.assistedTouches) {
      const assistChannelLabel = resolveCommercialChannelLabel(touch);
      const assistCampaignLabel = touch.campaign || "Sem campanha";
      const assistChannelKey = assistChannelLabel.toLowerCase();
      const assistCampaignKey = `${assistChannelKey}::${assistCampaignLabel.toLowerCase()}`;

      if (!seenAssistChannels.has(assistChannelKey)) {
        getChannelGroup(assistChannelLabel).assistedLeads += 1;
        seenAssistChannels.add(assistChannelKey);
      }

      if (!seenAssistCampaigns.has(assistCampaignKey)) {
        getCampaignGroup(assistCampaignLabel, assistChannelLabel).assistedLeads += 1;
        seenAssistCampaigns.add(assistCampaignKey);
      }
    }
  }

  for (const snapshot of snapshots) {
    const channelLabel = resolveSnapshotChannelLabel(snapshot);
    const channel = getChannelGroup(channelLabel);
    channel.spend += toNumber(snapshot.spend);
    channel.clicks += toNumber(snapshot.clicks);
    channel.impressions += toNumber(snapshot.impressions);
    channel.paidLeads += toNumber(snapshot.leads);
    channel.campaignCount = (channel.campaignCount || 0) + (snapshot.campaignName || snapshot.campaignId ? 1 : 0);

    const campaignLabel = cleanText(snapshot.campaignName || snapshot.campaignId, 180);
    if (campaignLabel) {
      const campaign = getCampaignGroup(campaignLabel, channelLabel);
      campaign.spend += toNumber(snapshot.spend);
      campaign.clicks += toNumber(snapshot.clicks);
      campaign.impressions += toNumber(snapshot.impressions);
      campaign.paidLeads += toNumber(snapshot.leads);
    }
  }

  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  for (const appointment of appointments) {
    if (!isMeetingStatusCountable(appointment.status)) continue;

    const leadId = cleanText(appointment.leadId, 180);
    if (!leadId) continue;

    const lead = leadsById.get(leadId);
    if (!lead) continue;

    const attribution = extractLeadAttributionSummary(lead);
    const channelLabel = resolveCommercialChannelLabel(attribution.lastTouch);
    const campaignLabel =
      attribution.lastTouch.campaign ||
      attribution.campaign ||
      cleanText(lead.campaignName || lead.utmCampaign, 180) ||
      "Sem campanha";

    getChannelGroup(channelLabel).meetings += 1;
    getCampaignGroup(campaignLabel, channelLabel).meetings += 1;
  }

  const formatGroup = (group: Group) => ({
    key: group.key,
    label: group.label,
    source: group.source || null,
    lastTouchLeads: group.lastTouchLeads,
    firstTouchLeads: group.firstTouchLeads,
    assistedLeads: group.assistedLeads,
    qualifiedLeads: group.qualifiedLeads,
    wonLeads: group.wonLeads,
    meetings: group.meetings,
    hotLeads: group.hotLeads,
    avgScore: group.scoredLeads ? Number((group.totalScore / group.scoredLeads).toFixed(1)) : 0,
    qualityRate: group.lastTouchLeads
      ? Number(((group.qualifiedLeads / group.lastTouchLeads) * 100).toFixed(1))
      : 0,
    winRate: group.lastTouchLeads ? Number(((group.wonLeads / group.lastTouchLeads) * 100).toFixed(1)) : 0,
    spend: Number(group.spend.toFixed(2)),
    clicks: group.clicks,
    impressions: group.impressions,
    paidLeads: group.paidLeads,
    cpl: group.lastTouchLeads > 0 ? Number((group.spend / group.lastTouchLeads).toFixed(2)) : 0,
    qualifiedCpl: group.qualifiedLeads > 0 ? Number((group.spend / group.qualifiedLeads).toFixed(2)) : 0,
    costPerMeeting: group.meetings > 0 ? Number((group.spend / group.meetings).toFixed(2)) : 0,
    costPerSale: group.wonLeads > 0 ? Number((group.spend / group.wonLeads).toFixed(2)) : 0,
    campaignCount: group.campaignCount ?? null,
  });

  return {
    byChannel: Array.from(channelMap.values())
      .map(formatGroup)
      .sort((a, b) => b.lastTouchLeads - a.lastTouchLeads || b.spend - a.spend)
      .slice(0, 12),
    byCampaign: Array.from(campaignMap.values())
      .map(formatGroup)
      .sort((a, b) => b.lastTouchLeads - a.lastTouchLeads || b.spend - a.spend)
      .slice(0, 20),
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantRole(membership, "client_viewer");

    const { searchParams } = new URL(req.url);
    const rangeDaysRaw = Number(searchParams.get("rangeDays") || 30);
    const rangeDays = [7, 30, 90].includes(rangeDaysRaw) ? rangeDaysRaw : 30;

    const periodEnd = new Date();
    const currentStart = startOfDay(new Date(Date.now() - (rangeDays - 1) * 86400000));
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = startOfDay(new Date(currentStart.getTime() - rangeDays * 86400000));

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
    const clientId = String(tenantData.clientId || tenantData.legacyClientId || tenantId).trim();

    const [leadsSnap, snapshotsSnap, financeSnap, appointmentsSnap, chatsSnap, messagesSnap, chatStateSnap, aiLogsSnap] =
      await Promise.all([
        queryByTenantOrClient("leads", tenantId, clientId, 700),
        queryByTenantOrClient("campaign_snapshots", tenantId, clientId, 1800),
        queryByTenantOrClient("financeiro", tenantId, clientId, 400),
        queryByTenantOrClient("appointments", tenantId, clientId, 500),
        adminDb.collection("chats").where("tenantId", "==", tenantId).limit(350).get(),
        adminDb.collection("messages").where("tenantId", "==", tenantId).limit(1800).get(),
        adminDb.collection("chat_state").where("tenantId", "==", tenantId).limit(350).get(),
        adminDb.collection("ai_logs").where("tenantId", "==", tenantId).limit(400).get(),
      ]);

    const allLeads: GenericRow[] = leadsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const allSnapshots: GenericRow[] = snapshotsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const allFinance: GenericRow[] = financeSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const allAppointments: GenericRow[] = appointmentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const allChats: GenericRow[] = chatsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const allMessages: GenericRow[] = messagesSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const allAiLogs: GenericRow[] = aiLogsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const teamWideScope = hasTeamWideCommercialAccess(membership);
    const visible = (record: GenericRow) => canAccessAssignedCommercialRecord(membership, user.uid, record);
    const leads = teamWideScope ? allLeads : allLeads.filter(visible);
    const chats = (teamWideScope ? allChats : allChats.filter(visible)).filter((chat) => !String(chat.mergedIntoChatId || "").trim());
    const visibleChatIds = new Set(chats.map((chat) => chat.id));
    const messages = allMessages.filter((message) => visibleChatIds.has(String(message.chatId || "")));
    const appointments = teamWideScope ? allAppointments : allAppointments.filter(visible);
    const visibleLeadIds = new Set(leads.map((lead) => lead.id));
    const finance = teamWideScope
      ? allFinance
      : allFinance.filter((item) => visibleLeadIds.has(String(item.leadId || "")));
    const snapshots = teamWideScope ? allSnapshots : [];
    const aiLogs = allAiLogs.filter((item) => {
      const chatId = String(item.chatId || "").trim();
      return !chatId || visibleChatIds.has(chatId);
    });
    const chatStates = new Map(
      chatStateSnap.docs
        .map((doc) => [doc.id, doc.data() as Record<string, unknown>] as const)
        .filter(([, data]) => visibleChatIds.has(String(data.chatId || "")))
    );

    const currentLeads = filterByWindow(leads, (item) => toDate(item.createdAt), currentStart, periodEnd);
    const previousLeads = filterByWindow(leads, (item) => toDate(item.createdAt), previousStart, previousEnd);
    const currentSnapshots = filterByWindow(snapshots, (item) => parseDateRef(item.dateRef), currentStart, periodEnd);
    const previousSnapshots = filterByWindow(snapshots, (item) => parseDateRef(item.dateRef), previousStart, previousEnd);
    const currentFinance = filterByWindow(finance, (item) => toDate(item.createdAt), currentStart, periodEnd);
    const previousFinance = filterByWindow(finance, (item) => toDate(item.createdAt), previousStart, previousEnd);
    const currentAppointments = filterByWindow(
      appointments,
      (item) => toDate(item.startAt || item.createdAt || item.updatedAt),
      currentStart,
      periodEnd
    );
    const previousAppointments = filterByWindow(
      appointments,
      (item) => toDate(item.startAt || item.createdAt || item.updatedAt),
      previousStart,
      previousEnd
    );
    const currentAiLogs = filterByWindow(aiLogs, (item) => toDate(item.createdAt), currentStart, periodEnd);

    const aggregateTraffic = (items: GenericRow[]) =>
      items.reduce(
        (acc, item) => {
          acc.impressions += toNumber(item.impressions);
          acc.clicks += toNumber(item.clicks);
          acc.spend += toNumber(item.spend);
          acc.leads += toNumber(item.leads);
          return acc;
        },
        { impressions: 0, clicks: 0, spend: 0, leads: 0 }
      );

    const currentTraffic = aggregateTraffic(currentSnapshots);
    const previousTraffic = aggregateTraffic(previousSnapshots);

    const currentPaid = currentFinance
      .filter((item) => String(item.status || "").toLowerCase() === "pago")
      .reduce((sum, item) => sum + toNumber(item.valor), 0);
    const previousPaid = previousFinance
      .filter((item) => String(item.status || "").toLowerCase() === "pago")
      .reduce((sum, item) => sum + toNumber(item.valor), 0);

    const wonLeads = currentLeads.filter((item) => normalizePipelineStageId(item.pipelineStage || item.stage) === "ganho").length;
    const previousWonLeads = previousLeads.filter((item) => normalizePipelineStageId(item.pipelineStage || item.stage) === "ganho").length;
    const qualifiedLeads = currentLeads.filter((item) => isQualifiedLeadStage(item.pipelineStage || item.stage)).length;
    const previousQualifiedLeads = previousLeads.filter((item) => isQualifiedLeadStage(item.pipelineStage || item.stage)).length;
    const meetings = currentAppointments.filter((item) => isMeetingStatusCountable(item.status)).length;
    const previousMeetings = previousAppointments.filter((item) => isMeetingStatusCountable(item.status)).length;
    const conversionRate = currentLeads.length ? (wonLeads / currentLeads.length) * 100 : 0;
    const previousConversionRate = previousLeads.length ? (previousWonLeads / previousLeads.length) * 100 : 0;
    const firstResponseSamples = collectFirstResponseSamples(messages, currentStart, periodEnd);
    const humanFirstResponseSamples = collectFirstResponseSamples(messages, currentStart, periodEnd, true);
    const avgFirstResponseMinutes = firstResponseSamples.length
      ? firstResponseSamples.reduce((sum, item) => sum + item.minutes, 0) / firstResponseSamples.length
      : 0;
    const roi = currentTraffic.spend > 0 ? currentPaid / currentTraffic.spend : 0;
    const previousRoi = previousTraffic.spend > 0 ? previousPaid / previousTraffic.spend : 0;
    const cpl = currentLeads.length > 0 ? currentTraffic.spend / currentLeads.length : 0;
    const previousCpl = previousLeads.length > 0 ? previousTraffic.spend / previousLeads.length : 0;
    const qualifiedCpl = qualifiedLeads > 0 ? currentTraffic.spend / qualifiedLeads : 0;
    const previousQualifiedCpl = previousQualifiedLeads > 0 ? previousTraffic.spend / previousQualifiedLeads : 0;
    const costPerMeeting = meetings > 0 ? currentTraffic.spend / meetings : 0;
    const previousCostPerMeeting = previousMeetings > 0 ? previousTraffic.spend / previousMeetings : 0;
    const costPerSale = wonLeads > 0 ? currentTraffic.spend / wonLeads : 0;
    const previousCostPerSale = previousWonLeads > 0 ? previousTraffic.spend / previousWonLeads : 0;

    const handoffChats = chatStateSnap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const pausedUntil = toDate(data.pausedUntil);
      return data.aiEnabled === false || Boolean(data.humanOwnerUserId) || Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
    }).length;

    const funnelBase = ["captado", "contato", "qualificacao", "proposta", "fechamento", "ganho", "perdido"].map((stage) => ({
      stage,
      label: stageLabel(stage),
      total: 0,
      value: 0,
    }));
    const funnelMap = new Map(funnelBase.map((item) => [item.stage, item]));

    for (const lead of leads) {
      const stage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
      const bucket = funnelMap.get(stage) || funnelMap.get("captado");
      if (!bucket) continue;
      bucket.total += 1;
      bucket.value += toNumber(lead.potentialValue || lead.valorPotencial);
    }

    const channelTotals = new Map<string, { channel: string; total: number; won: number }>();
    for (const lead of currentLeads) {
      const channel = String(lead.channel || lead.origem || "nao_informado").trim().toLowerCase() || "nao_informado";
      const current = channelTotals.get(channel) || { channel, total: 0, won: 0 };
      current.total += 1;
      if (normalizePipelineStageId(lead.pipelineStage || lead.stage) === "ganho") current.won += 1;
      channelTotals.set(channel, current);
    }

    const channels = Array.from(channelTotals.values())
      .map((item) => ({
        ...item,
        conversionRate: item.total ? Number(((item.won / item.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const conversationChannels = Array.from(
      chats.reduce((acc, chat) => {
        const channel = String(chat.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
        acc.set(channel, (acc.get(channel) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .map(([channel, total]) => ({ channel, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const trafficSeries = buildDailySeries(rangeDays, currentSnapshots, currentLeads).map((item) => ({
      ...item,
      spend: Number(item.spend.toFixed(2)),
    }));
    const commercialAttribution = buildCommercialAttribution(currentLeads, currentSnapshots, currentAppointments);

    const aiSummary = {
      responded: currentAiLogs.filter((item) => item.decision === "respond").length,
      askMore: currentAiLogs.filter((item) => item.decision === "ask_more").length,
      handoff: currentAiLogs.filter((item) => item.decision === "handoff").length,
      skipped: currentAiLogs.filter((item) => item.decision === "skip").length,
      avgConfidence: currentAiLogs.length
        ? Number(
            (
              currentAiLogs.reduce((sum, item) => sum + (typeof item.confidence === "number" ? item.confidence : 0), 0) /
              Math.max(1, currentAiLogs.filter((item) => typeof item.confidence === "number").length)
            ).toFixed(2)
          )
        : 0,
      avgLatencyMs: currentAiLogs.length
        ? Math.round(
            currentAiLogs.reduce((sum, item) => sum + toNumber(item.latencyMs), 0) / Math.max(1, currentAiLogs.length)
          )
        : 0,
    };
    const now = Date.now();
    const activeChats = chats.filter((item) => !isClosedChatStatus(item.status));
    const overdueChats = activeChats.filter((item) => {
      const dueAt = toDate(item.slaDueAt);
      return Boolean(dueAt && dueAt.getTime() < now);
    });
    const unassignedChats = activeChats.filter(
      (item) => !String(item.assignedTo || item.ownerId || "").trim()
    );
    const pendingChats = activeChats.filter((item) => String(item.status || "").toLowerCase() === "pending");
    const queueBreakdown = {
      triage: activeChats.filter((item) => normalizeQueueStatus(item.queueStatus) === "triage").length,
      unassigned: activeChats.filter((item) => normalizeQueueStatus(item.queueStatus) === "unassigned").length,
      assigned: activeChats.filter((item) => normalizeQueueStatus(item.queueStatus) === "assigned").length,
      assignedWaiting: activeChats.filter((item) => normalizeQueueStatus(item.queueStatus) === "assigned_waiting").length,
      slaBreached: overdueChats.length,
    };

    const aiBreakdown = activeChats.reduce(
      (acc, item) => {
        const state = chatStates.get(String(item.id || ""));
        const aiEnabled = state?.aiEnabled !== false;
        const pausedUntil = toDate(state?.pausedUntil);
        const humanOwnerUserId = String(state?.humanOwnerUserId || "").trim();
        const paused = !aiEnabled || Boolean(pausedUntil && pausedUntil.getTime() > now);
        if (humanOwnerUserId) acc.humanOwned += 1;
        if (paused) acc.paused += 1;
        else acc.active += 1;
        return acc;
      },
      { active: 0, paused: 0, humanOwned: 0 }
    );

    const ownerIds = Array.from(
      new Set(
        [...leads, ...chats, ...messages]
          .map((item) => String(item.ownerId || item.assignedTo || item.senderId || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 40);
    const ownerMap = new Map<string, string>();

    if (ownerIds.length) {
      const ownerSnaps = await Promise.all(ownerIds.map((ownerId) => adminDb.collection("users").doc(ownerId).get()));
      ownerSnaps.forEach((snap, index) => {
        ownerMap.set(
          ownerIds[index],
          String((snap.data() as Record<string, unknown> | undefined)?.name || "Usuario")
        );
      });
    }

    const chatsById = new Map(chats.map((chat) => [String(chat.id || ""), chat]));
    const responseSamplesByOwner = new Map<string, number[]>();
    for (const sample of humanFirstResponseSamples) {
      const chat = chatsById.get(sample.chatId);
      const ownerId = sample.responderId || String(chat?.assignedTo || chat?.ownerId || "").trim();
      if (!ownerId) continue;
      const values = responseSamplesByOwner.get(ownerId) || [];
      values.push(sample.minutes);
      responseSamplesByOwner.set(ownerId, values);
    }

    const humanMessagesByOwner = new Map<string, GenericRow[]>();
    for (const message of messages) {
      if (String(message.sender || "") !== "agent") continue;
      const senderId = String(message.senderId || "").trim();
      const createdAt = toDate(message.createdAt);
      if (!senderId || !createdAt || createdAt < currentStart || createdAt > periodEnd) continue;
      const current = humanMessagesByOwner.get(senderId) || [];
      current.push(message);
      humanMessagesByOwner.set(senderId, current);
    }

    const teamPerformance = ownerIds
      .map((ownerId) => {
        const ownedLeads = currentLeads.filter((item) => String(item.ownerId || "").trim() === ownerId);
        const ownedChats = activeChats.filter((item) => String(item.ownerId || item.assignedTo || "").trim() === ownerId);
        const ownedOverdue = overdueChats.filter((item) => String(item.ownerId || item.assignedTo || "").trim() === ownerId);
        const ownedPending = pendingChats.filter((item) => String(item.ownerId || item.assignedTo || "").trim() === ownerId);
        const ownedHandoffs = ownedChats.filter((item) => {
          const state = chatStates.get(String(item.id || ""));
          return Boolean(String(state?.humanOwnerUserId || "").trim());
        });
        const wonOwnedLeads = ownedLeads.filter(
          (item) => normalizePipelineStageId(item.pipelineStage || item.stage) === "ganho"
        ).length;
        const responseSamples = responseSamplesByOwner.get(ownerId) || [];
        const humanMessages = humanMessagesByOwner.get(ownerId) || [];
        const handledChatIds = new Set(humanMessages.map((message) => String(message.chatId || "")).filter(Boolean));
        const responseCoverageBase = Math.max(ownedChats.length, handledChatIds.size);
        const avgOwnerResponseMinutes = responseSamples.length
          ? responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length
          : 0;

        return {
          ownerId,
          ownerName: ownerMap.get(ownerId) || "Usuario",
          activeChats: ownedChats.length,
          overdueChats: ownedOverdue.length,
          pendingChats: ownedPending.length,
          handoffChats: ownedHandoffs.length,
          totalLeads: ownedLeads.length,
          wonLeads: wonOwnedLeads,
          winRate: ownedLeads.length ? Number(((wonOwnedLeads / ownedLeads.length) * 100).toFixed(1)) : 0,
          avgFirstResponseMinutes: Number(avgOwnerResponseMinutes.toFixed(2)),
          responseSamples: responseSamples.length,
          humanReplies: humanMessages.length,
          handledChats: handledChatIds.size,
          awaitingReplyChats: ownedChats.filter((item) => ["assigned_waiting", "sla_breached"].includes(normalizeQueueStatus(item.queueStatus))).length,
          responseCoveragePct: responseCoverageBase ? Number(((handledChatIds.size / responseCoverageBase) * 100).toFixed(1)) : 0,
          lastHumanReplyAt: humanMessages
            .map((message) => toDate(message.createdAt))
            .filter((date): date is Date => Boolean(date))
            .sort((left, right) => right.getTime() - left.getTime())[0] || null,
        };
      })
      .sort((a, b) => {
        if (b.activeChats !== a.activeChats) return b.activeChats - a.activeChats;
        if (b.totalLeads !== a.totalLeads) return b.totalLeads - a.totalLeads;
        return a.ownerName.localeCompare(b.ownerName, "pt-BR");
      })
      .slice(0, 8);

    const channelOperations = Array.from(
      activeChats.reduce((acc, chat) => {
        const channel = String(chat.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
        const current =
          acc.get(channel) ||
          {
            channel,
            activeChats: 0,
            overdueChats: 0,
            unassignedChats: 0,
            handoffChats: 0,
          };
        current.activeChats += 1;
        if (!String(chat.assignedTo || chat.ownerId || "").trim()) current.unassignedChats += 1;
        const dueAt = toDate(chat.slaDueAt);
        if (dueAt && dueAt.getTime() < now) current.overdueChats += 1;
        const state = chatStates.get(String(chat.id || ""));
        if (String(state?.humanOwnerUserId || "").trim()) current.handoffChats += 1;
        acc.set(channel, current);
        return acc;
      }, new Map<string, { channel: string; activeChats: number; overdueChats: number; unassignedChats: number; handoffChats: number }>())
    )
      .map(([, item]) => item)
      .sort((a, b) => b.activeChats - a.activeChats)
      .slice(0, 8);

    return NextResponse.json({
      ok: true,
      tenantId,
      rangeDays,
      scope: teamWideScope ? "team" : "own",
      metrics: {
        conversionRate: Number(conversionRate.toFixed(2)),
        avgFirstResponseMinutes: Number(avgFirstResponseMinutes.toFixed(2)),
        roi: Number(roi.toFixed(2)),
        cpl: Number(cpl.toFixed(2)),
        qualifiedCpl: Number(qualifiedCpl.toFixed(2)),
        costPerMeeting: Number(costPerMeeting.toFixed(2)),
        costPerSale: Number(costPerSale.toFixed(2)),
        growth: Number(safePct(currentLeads.length, previousLeads.length).toFixed(2)),
        conversations: chats.length,
        handoffChats,
        siteChatConversations: conversationChannels.find((item) => item.channel === "site_chat")?.total || 0,
        wonLeads,
        qualifiedLeads,
        meetings,
        totalLeads: currentLeads.length,
        paidRevenue: Number(currentPaid.toFixed(2)),
      },
      comparisons: {
        leadsDeltaPct: Number(safePct(currentLeads.length, previousLeads.length).toFixed(2)),
        conversionDeltaPct: Number(safePct(conversionRate, previousConversionRate).toFixed(2)),
        roiDeltaPct: Number(safePct(roi, previousRoi).toFixed(2)),
        cplDeltaPct: Number(safePct(cpl, previousCpl).toFixed(2)),
        qualifiedCplDeltaPct: Number(safePct(qualifiedCpl, previousQualifiedCpl).toFixed(2)),
        meetingCostDeltaPct: Number(safePct(costPerMeeting, previousCostPerMeeting).toFixed(2)),
        saleCostDeltaPct: Number(safePct(costPerSale, previousCostPerSale).toFixed(2)),
        qualifiedLeadsDeltaPct: Number(safePct(qualifiedLeads, previousQualifiedLeads).toFixed(2)),
        meetingsDeltaPct: Number(safePct(meetings, previousMeetings).toFixed(2)),
        spendDeltaPct: Number(safePct(currentTraffic.spend, previousTraffic.spend).toFixed(2)),
      },
      traffic: {
        impressions: currentTraffic.impressions,
        clicks: currentTraffic.clicks,
        spend: Number(currentTraffic.spend.toFixed(2)),
        leads: currentTraffic.leads,
        ctr: Number((currentTraffic.impressions > 0 ? (currentTraffic.clicks / currentTraffic.impressions) * 100 : 0).toFixed(2)),
        cpc: Number((currentTraffic.clicks > 0 ? currentTraffic.spend / currentTraffic.clicks : 0).toFixed(2)),
        cpl: Number((currentTraffic.leads > 0 ? currentTraffic.spend / currentTraffic.leads : 0).toFixed(2)),
      },
      funnel: funnelBase,
      channels,
      commercialAttribution,
      conversationChannels,
      trafficSeries,
      ai: aiSummary,
      operations: {
        activeChats: activeChats.length,
        overdueChats: overdueChats.length,
        unassignedChats: unassignedChats.length,
        pendingChats: pendingChats.length,
        queueBreakdown,
        aiBreakdown,
        channelOperations,
        teamPerformance,
      },
      windows: {
        current: { start: dateKey(currentStart), end: dateKey(periodEnd) },
        previous: { start: dateKey(previousStart), end: dateKey(previousEnd) },
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar metricas do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar metricas." }, { status: 500 });
  }
}
