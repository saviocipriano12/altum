import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

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

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function isWonStage(value: unknown) {
  const stage = String(value || "").trim().toLowerCase();
  return stage === "ganho" || stage === "fechado";
}

function queryByTenantOrClient(collectionName: string, tenantId: string, clientId: string, limit: number) {
  return adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(limit).get().then((snap) => {
    if (!snap.empty || !clientId || clientId === tenantId) return snap;
    return adminDb.collection(collectionName).where("clientId", "==", clientId).limit(limit).get();
  });
}

function computeAverageFirstResponseMinutes(messages: GenericRow[]) {
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

    const firstClient = ordered.find((item) => String(item.sender || "") === "client");
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

function computeGrowth(leads: GenericRow[]) {
  const now = Date.now();
  const currentWindowStart = now - 30 * 24 * 60 * 60 * 1000;
  const previousWindowStart = now - 60 * 24 * 60 * 60 * 1000;

  let current = 0;
  let previous = 0;

  for (const lead of leads) {
    const createdAt = toDate(lead.createdAt)?.getTime() || 0;
    if (createdAt >= currentWindowStart) {
      current += 1;
      continue;
    }
    if (createdAt >= previousWindowStart) {
      previous += 1;
    }
  }

  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
    const clientId = String(tenantData.clientId || tenantData.legacyClientId || tenantId).trim();

    const [leadsSnap, snapshotsSnap, financeSnap, chatsSnap, messagesSnap, chatStateSnap] = await Promise.all([
      queryByTenantOrClient("leads", tenantId, clientId, 500),
      queryByTenantOrClient("campaign_snapshots", tenantId, clientId, 1500),
      queryByTenantOrClient("financeiro", tenantId, clientId, 300),
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(300).get(),
      adminDb.collection("messages").where("tenantId", "==", tenantId).limit(1500).get(),
      adminDb.collection("chat_state").where("tenantId", "==", tenantId).limit(300).get(),
    ]);

    const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    const snapshots = snapshotsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    const finance = financeSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    const messages = messagesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

    const traffic = snapshots.reduce(
      (acc, item) => {
        acc.impressions += toNumber(item.impressions);
        acc.clicks += toNumber(item.clicks);
        acc.spend += toNumber(item.spend);
        acc.leads += toNumber(item.leads);
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0, leads: 0 }
    );

    const ctr = traffic.impressions > 0 ? (traffic.clicks / traffic.impressions) * 100 : 0;
    const cpc = traffic.clicks > 0 ? traffic.spend / traffic.clicks : 0;
    const cpl = traffic.leads > 0 ? traffic.spend / traffic.leads : 0;

    const paid = finance
      .filter((item) => String(item.status || "").toLowerCase() === "pago")
      .reduce((sum, item) => sum + toNumber(item.valor), 0);

    const wonLeads = leads.filter((item) => isWonStage(item.pipelineStage || item.stage)).length;
    const conversionRate = leads.length ? (wonLeads / leads.length) * 100 : 0;
    const avgFirstResponseMinutes = computeAverageFirstResponseMinutes(messages);
    const roi = traffic.spend > 0 ? paid / traffic.spend : 0;
    const growth = computeGrowth(leads);

    const handoffChats = chatStateSnap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const pausedUntil = toDate(data.pausedUntil);
      return data.aiEnabled === false || Boolean(data.humanOwnerUserId) || Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
    }).length;

    return NextResponse.json({
      ok: true,
      tenantId,
      metrics: {
        conversionRate: Number(conversionRate.toFixed(2)),
        avgFirstResponseMinutes: Number(avgFirstResponseMinutes.toFixed(2)),
        roi: Number(roi.toFixed(2)),
        growth: Number(growth.toFixed(2)),
        conversations: chatsSnap.size,
        handoffChats,
        wonLeads,
        totalLeads: leads.length,
      },
      traffic: {
        impressions: traffic.impressions,
        clicks: traffic.clicks,
        spend: Number(traffic.spend.toFixed(2)),
        leads: traffic.leads,
        ctr: Number(ctr.toFixed(2)),
        cpc: Number(cpc.toFixed(2)),
        cpl: Number(cpl.toFixed(2)),
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
