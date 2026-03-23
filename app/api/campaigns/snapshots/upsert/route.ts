import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, isAdmin } from "@/app/lib/server/route-auth";

type Body = {
  adAccountId?: string;
  dateRef?: string; // YYYY-MM-DD
  impressions?: number;
  clicks?: number;
  spend?: number;
  leads?: number;
  roas?: number;
  source?: "api" | "manual" | "import";
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function calcMetrics(input: { impressions: number; clicks: number; spend: number; leads: number }) {
  const ctr = input.impressions > 0 ? (input.clicks / input.impressions) * 100 : 0;
  const cpc = input.clicks > 0 ? input.spend / input.clicks : 0;
  const cpl = input.leads > 0 ? input.spend / input.leads : 0;
  return {
    ctr: Number(ctr.toFixed(4)),
    cpc: Number(cpc.toFixed(4)),
    cpl: Number(cpl.toFixed(4)),
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;

    const adAccountId = clean(body.adAccountId, 120);
    const dateRef = clean(body.dateRef, 10);
    if (!adAccountId || !dateRef) {
      return NextResponse.json(
        { error: "Campos obrigatorios: adAccountId e dateRef." },
        { status: 400 }
      );
    }

    const adAccountRef = adminDb.collection("ad_accounts").doc(adAccountId);
    const adAccountSnap = await adAccountRef.get();
    if (!adAccountSnap.exists) {
      return NextResponse.json({ error: "Conta de anuncio nao encontrada." }, { status: 404 });
    }

    const adAccount = adAccountSnap.data() as { ownerId?: string; clientId?: string };
    if (!isAdmin(user) && adAccount.ownerId && adAccount.ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao nesta conta." }, { status: 403 });
    }

    const impressions = Math.max(0, Math.round(toNumber(body.impressions)));
    const clicks = Math.max(0, Math.round(toNumber(body.clicks)));
    const spend = Math.max(0, Number(toNumber(body.spend).toFixed(2)));
    const leads = Math.max(0, Math.round(toNumber(body.leads)));
    const roas = Number(toNumber(body.roas).toFixed(4));
    const metrics = calcMetrics({ impressions, clicks, spend, leads });

    const snapshotId = `${adAccountId}_${dateRef}`;
    const snapRef = adminDb.collection("campaign_snapshots").doc(snapshotId);

    await snapRef.set(
      {
        adAccountId,
        clientId: adAccount.clientId || null,
        dateRef,
        impressions,
        clicks,
        spend,
        leads,
        ctr: metrics.ctr,
        cpc: metrics.cpc,
        cpl: metrics.cpl,
        roas: Number.isFinite(roas) ? roas : 0,
        source: body.source || "manual",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );

    await adAccountRef.set(
      {
        lastSyncAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: snapshotId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao salvar snapshot de campanha:", error);
    return NextResponse.json(
      { error: "Falha ao salvar snapshot de campanha." },
      { status: 500 }
    );
  }
}
