import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

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

function computeAverageFirstResponseMinutes(messages: GenericRow[], start: Date, end: Date) {
  const grouped = new Map<string, GenericRow[]>();

  for (const message of messages) {
    const chatId = String(message.chatId || "").trim();
    if (!chatId) continue;
    const list = grouped.get(chatId) || [];
    list.push(message);
    grouped.set(chatId, list);
  }

  const samples: number[] = [];

  for (const chatMessages of grouped.values()) {
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
      const createdAt = toDate(item.createdAt);
      return Boolean(createdAt && createdAt.getTime() >= firstClientAt.getTime());
    });

    if (!firstAgentReply) continue;

    const firstAgentAt = toDate(firstAgentReply.createdAt);
    if (!firstAgentAt) continue;

    samples.push(minutesBetween(firstClientAt, firstAgentAt));
  }

  if (!samples.length) return 0;
  return samples.reduce((sum, item) => sum + item, 0) / samples.length;
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

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
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

    const [leadsSnap, snapshotsSnap, financeSnap, chatsSnap, messagesSnap, chatStateSnap, aiLogsSnap] =
      await Promise.all([
        queryByTenantOrClient("leads", tenantId, clientId, 700),
        queryByTenantOrClient("campaign_snapshots", tenantId, clientId, 1800),
        queryByTenantOrClient("financeiro", tenantId, clientId, 400),
        adminDb.collection("chats").where("tenantId", "==", tenantId).limit(350).get(),
        adminDb.collection("messages").where("tenantId", "==", tenantId).limit(1800).get(),
        adminDb.collection("chat_state").where("tenantId", "==", tenantId).limit(350).get(),
        adminDb.collection("ai_logs").where("tenantId", "==", tenantId).limit(400).get(),
      ]);

    const leads: GenericRow[] = leadsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const snapshots: GenericRow[] = snapshotsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const finance: GenericRow[] = financeSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const chats: GenericRow[] = chatsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const messages: GenericRow[] = messagesSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const aiLogs: GenericRow[] = aiLogsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const chatStates = new Map(
      chatStateSnap.docs.map((doc) => [doc.id, doc.data() as Record<string, unknown>])
    );

    const currentLeads = filterByWindow(leads, (item) => toDate(item.createdAt), currentStart, periodEnd);
    const previousLeads = filterByWindow(leads, (item) => toDate(item.createdAt), previousStart, previousEnd);
    const currentSnapshots = filterByWindow(snapshots, (item) => parseDateRef(item.dateRef), currentStart, periodEnd);
    const previousSnapshots = filterByWindow(snapshots, (item) => parseDateRef(item.dateRef), previousStart, previousEnd);
    const currentFinance = filterByWindow(finance, (item) => toDate(item.createdAt), currentStart, periodEnd);
    const previousFinance = filterByWindow(finance, (item) => toDate(item.createdAt), previousStart, previousEnd);
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
    const conversionRate = currentLeads.length ? (wonLeads / currentLeads.length) * 100 : 0;
    const previousConversionRate = previousLeads.length ? (previousWonLeads / previousLeads.length) * 100 : 0;
    const avgFirstResponseMinutes = computeAverageFirstResponseMinutes(messages, currentStart, periodEnd);
    const roi = currentTraffic.spend > 0 ? currentPaid / currentTraffic.spend : 0;
    const previousRoi = previousTraffic.spend > 0 ? previousPaid / previousTraffic.spend : 0;

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
        [...leads, ...chats]
          .map((item) => String(item.ownerId || item.assignedTo || "").trim())
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
      metrics: {
        conversionRate: Number(conversionRate.toFixed(2)),
        avgFirstResponseMinutes: Number(avgFirstResponseMinutes.toFixed(2)),
        roi: Number(roi.toFixed(2)),
        growth: Number(safePct(currentLeads.length, previousLeads.length).toFixed(2)),
        conversations: chatsSnap.size,
        handoffChats,
        siteChatConversations: conversationChannels.find((item) => item.channel === "site_chat")?.total || 0,
        wonLeads,
        totalLeads: currentLeads.length,
        paidRevenue: Number(currentPaid.toFixed(2)),
      },
      comparisons: {
        leadsDeltaPct: Number(safePct(currentLeads.length, previousLeads.length).toFixed(2)),
        conversionDeltaPct: Number(safePct(conversionRate, previousConversionRate).toFixed(2)),
        roiDeltaPct: Number(safePct(roi, previousRoi).toFixed(2)),
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
