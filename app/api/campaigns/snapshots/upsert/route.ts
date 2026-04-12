import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, isAdmin } from "@/app/lib/server/route-auth";
import { upsertCampaignSnapshot } from "@/app/lib/server/campaign-sync";

type Body = {
  adAccountId?: string;
  dateRef?: string; // YYYY-MM-DD
  impressions?: number;
  clicks?: number;
  spend?: number;
  leads?: number;
  roas?: number;
  source?: "api" | "manual" | "import" | "webhook";
  campaignId?: string;
  campaignName?: string;
  channelId?: string;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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

    const adAccount = adAccountSnap.data() as {
      ownerId?: string;
      clientId?: string;
      platform?: string;
      accountLabel?: string;
    };
    if (!isAdmin(user) && adAccount.ownerId && adAccount.ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao nesta conta." }, { status: 403 });
    }

    const snapshot = await upsertCampaignSnapshot({
      clientId: clean(adAccount.clientId, 120),
      adAccountId,
      channelId: clean(body.channelId, 180),
      platform: clean(adAccount.platform, 40) as "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads",
      dateRef,
      impressions: body.impressions,
      clicks: body.clicks,
      spend: body.spend,
      leads: body.leads,
      roas: body.roas,
      source: body.source || "manual",
      campaignId: clean(body.campaignId, 180),
      campaignName: clean(body.campaignName, 180),
      updatedBy: user.uid,
      updatedByName: user.name,
      accountLabel: clean(adAccount.accountLabel, 180),
    });

    await adAccountRef.set(
      {
        lastSyncAt: new Date(),
        updatedAt: new Date(),
        lastConsistency: snapshot.consistency,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: snapshot.snapshotId, consistency: snapshot.consistency });
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
