import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const portalUser = await requirePortalRequestUser(req);
    const clientId = portalUser.clientId;

    const [clientSnap, adAccountsSnap, snapshotsSnap, projectsSnap, budgetsSnap, financeSnap, contractSnap] =
      await Promise.all([
        adminDb.collection("clientes").doc(clientId).get(),
        adminDb.collection("ad_accounts").where("clientId", "==", clientId).limit(50).get(),
        adminDb.collection("campaign_snapshots").where("clientId", "==", clientId).limit(1200).get(),
        adminDb.collection("projetos").where("clientId", "==", clientId).limit(120).get(),
        adminDb.collection("orcamentos").where("clientId", "==", clientId).limit(120).get(),
        adminDb.collection("financeiro").where("clientId", "==", clientId).limit(200).get(),
        adminDb.collection("client_contracts").doc(clientId).get(),
      ]);

    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    const snapshots = snapshotsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    const totals = snapshots.reduce(
      (acc, item) => {
        acc.impressions += toNumber(item.impressions);
        acc.clicks += toNumber(item.clicks);
        acc.spend += toNumber(item.spend);
        acc.leads += toNumber(item.leads);
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0, leads: 0 }
    );

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;

    const financeItems = financeSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const paid = financeItems
      .filter((item) => String(item.status || "").toLowerCase() === "pago")
      .reduce((sum, item) => sum + toNumber(item.valor), 0);
    const pending = financeItems
      .filter((item) => {
        const status = String(item.status || "").toLowerCase();
        return status === "pendente" || status === "atrasado";
      })
      .reduce((sum, item) => sum + toNumber(item.valor), 0);

    const projects = projectsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const budgets = budgetsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    const recentSnapshots = [...snapshots]
      .sort((a, b) => {
        const aTime = toDate(a.dateRef)?.getTime() ?? 0;
        const bTime = toDate(b.dateRef)?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      portalUser: {
        uid: portalUser.uid,
        name: portalUser.name,
        email: portalUser.email,
        clientId: portalUser.clientId,
        clientName: portalUser.clientName,
      },
      client: {
        id: clientSnap.id,
        ...(clientSnap.data() as Record<string, unknown>),
      },
      contract: contractSnap.exists
        ? { id: contractSnap.id, ...(contractSnap.data() as Record<string, unknown>) }
        : null,
      kpis: {
        adAccounts: adAccountsSnap.size,
        impressions: totals.impressions,
        clicks: totals.clicks,
        spend: Number(totals.spend.toFixed(2)),
        leads: totals.leads,
        ctr: Number(ctr.toFixed(4)),
        cpc: Number(cpc.toFixed(4)),
        cpl: Number(cpl.toFixed(4)),
        paid: Number(paid.toFixed(2)),
        pending: Number(pending.toFixed(2)),
        projects: projects.length,
        budgets: budgets.length,
      },
      adAccounts: adAccountsSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })),
      snapshots: recentSnapshots,
      projects: projects.slice(0, 20),
      budgets: budgets.slice(0, 20),
      finance: financeItems
        .sort((a, b) => {
          const aTime = toDate(a.createdAt)?.getTime() ?? 0;
          const bTime = toDate(b.createdAt)?.getTime() ?? 0;
          return bTime - aTime;
        })
        .slice(0, 20),
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao carregar dashboard do cliente:", error);
    return NextResponse.json(
      { error: "Falha ao carregar dashboard do cliente." },
      { status: 500 }
    );
  }
}
