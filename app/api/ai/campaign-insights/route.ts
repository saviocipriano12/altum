import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, isAdmin } from "@/app/lib/server/route-auth";

type Body = {
  clientId?: string;
  rangeDays?: number;
};

type SnapshotItem = {
  id: string;
  dateRef?: string;
  impressions?: unknown;
  clicks?: unknown;
  spend?: unknown;
  leads?: unknown;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateRef(dateRef: string) {
  const parsed = new Date(`${dateRef}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;

    const rangeDays = Math.min(60, Math.max(7, Math.round(toNumber(body.rangeDays, 14))));
    const clientId = clean(body.clientId, 120);
    const now = new Date();
    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() - rangeDays);

    let adAccountQuery = adminDb.collection("ad_accounts").limit(400);
    if (clientId) adAccountQuery = adAccountQuery.where("clientId", "==", clientId);
    if (!isAdmin(user)) adAccountQuery = adAccountQuery.where("ownerId", "==", user.uid);

    const adAccountsSnap = await adAccountQuery.get();
    const adAccounts = adAccountsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as { clientId?: string; accountLabel?: string; platform?: string }),
    }));

    if (!adAccounts.length) {
      return NextResponse.json({
        ok: true,
        summary: "Nenhuma conta de anuncio encontrada no seu escopo.",
        recommendations: [],
        metrics: null,
      });
    }

    const accountIds = adAccounts.map((item) => item.id);
    const chunkSize = 10;
    const chunks: string[][] = [];
    for (let i = 0; i < accountIds.length; i += chunkSize) {
      chunks.push(accountIds.slice(i, i + chunkSize));
    }

    const snapshots: SnapshotItem[] = [];
    for (const chunk of chunks) {
      const snap = await adminDb
        .collection("campaign_snapshots")
        .where("adAccountId", "in", chunk)
        .limit(1200)
        .get();
      snapshots.push(
        ...snap.docs.map(
          (doc): SnapshotItem => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })
        )
      );
    }

    const scoped = snapshots.filter((item) => {
      const dateRef = clean(item.dateRef, 20);
      const dt = parseDateRef(dateRef);
      return dt ? dt >= minDate : false;
    });

    if (!scoped.length) {
      return NextResponse.json({
        ok: true,
        summary: `Sem snapshots de campanha nos ultimos ${rangeDays} dias.`,
        recommendations: [
          "Conectar as contas via API oficial (Meta/Google) ou importar snapshots diarios.",
          "Padronizar nomenclatura de campanhas por objetivo e funil para analise confiavel.",
        ],
        metrics: null,
      });
    }

    const totals = scoped.reduce(
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

    const recommendations: string[] = [];
    if (ctr < 1.2) {
      recommendations.push(
        "CTR baixo: revisar criativos e headline. Testar ao menos 3 variações por conjunto."
      );
    } else {
      recommendations.push("CTR saudável: manter criativos vencedores e renovar apenas saturação.");
    }

    if (cpl > 120) {
      recommendations.push(
        "CPL alto: separar campanhas de prospecção e remarketing, ajustar segmentação por intenção."
      );
    } else {
      recommendations.push("CPL controlado: escalar orçamento gradualmente nas melhores campanhas.");
    }

    if (totals.leads < 20) {
      recommendations.push(
        "Volume de leads baixo: ampliar cobertura de público e aumentar frequência de otimização."
      );
    }

    recommendations.push(
      "Ação recomendada: cruzar qualidade dos leads no CRM com origem da campanha para otimizar por receita, não só por lead."
    );

    const summary = [
      `Analise de ${scoped.length} snapshots em ${rangeDays} dias.`,
      `Impressões: ${Math.round(totals.impressions).toLocaleString("pt-BR")}.`,
      `Cliques: ${Math.round(totals.clicks).toLocaleString("pt-BR")} | CTR: ${ctr.toFixed(2)}%.`,
      `Investimento: R$ ${totals.spend.toFixed(2)} | Leads: ${Math.round(totals.leads)} | CPL: R$ ${cpl.toFixed(2)}.`,
      `CPC médio: R$ ${cpc.toFixed(2)}.`,
    ].join(" ");

    return NextResponse.json({
      ok: true,
      summary,
      metrics: {
        snapshots: scoped.length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        spend: totals.spend,
        leads: totals.leads,
        ctr: Number(ctr.toFixed(4)),
        cpc: Number(cpc.toFixed(4)),
        cpl: Number(cpl.toFixed(4)),
      },
      recommendations,
      sources: {
        collections: ["ad_accounts", "campaign_snapshots"],
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao gerar insights de campanha:", error);
    return NextResponse.json(
      { error: "Falha ao gerar insights de campanha." },
      { status: 500 }
    );
  }
}
