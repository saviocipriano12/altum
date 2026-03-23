import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { runSyncForAdAccount } from "@/app/lib/server/campaign-sync";

type Body = {
  adAccountId?: string;
  clientId?: string;
  dateRef?: string; // YYYY-MM-DD
  limit?: number;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeDateRef(value: unknown) {
  const input = clean(value, 20);
  if (input) return input;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;

    const dateRef = normalizeDateRef(body.dateRef);
    const adAccountId = clean(body.adAccountId, 120);
    const clientId = clean(body.clientId, 120);
    const maxItems = Math.min(30, Math.max(1, Number(body.limit || 12)));

    let accounts: Array<{
      id: string;
      clientId: string;
      platform: "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";
      externalAccountId?: string;
      ownerId?: string;
    }> = [];

    if (adAccountId) {
      const snap = await adminDb.collection("ad_accounts").doc(adAccountId).get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Conta de anuncio nao encontrada." }, { status: 404 });
      }
      const data = snap.data() as {
        clientId?: string;
        platform?: "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";
        externalAccountId?: string;
        ownerId?: string;
      };
      accounts = [
        {
          id: snap.id,
          clientId: clean(data.clientId, 120),
          platform: (data.platform || "meta_ads") as "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads",
          externalAccountId: clean(data.externalAccountId, 200),
          ownerId: clean(data.ownerId, 120),
        },
      ];
    } else {
      let query = adminDb.collection("ad_accounts").limit(maxItems);
      if (clientId) {
        query = query.where("clientId", "==", clientId);
      }
      if (!isAdmin(user)) {
        query = query.where("ownerId", "==", user.uid);
      }
      const snap = await query.get();
      accounts = snap.docs.map((doc) => {
        const data = doc.data() as {
          clientId?: string;
          platform?: "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";
          externalAccountId?: string;
          ownerId?: string;
        };
        return {
          id: doc.id,
          clientId: clean(data.clientId, 120),
          platform: (data.platform || "meta_ads") as
            | "meta_ads"
            | "google_ads"
            | "tiktok_ads"
            | "linkedin_ads",
          externalAccountId: clean(data.externalAccountId, 200),
          ownerId: clean(data.ownerId, 120),
        };
      });
    }

    if (!accounts.length) {
      return NextResponse.json({ ok: true, synced: 0, failed: 0, results: [] });
    }

    if (!isAdmin(user)) {
      accounts = accounts.filter((item) => item.ownerId === user.uid);
      if (!accounts.length && adAccountId) {
        return NextResponse.json({ error: "Sem permissao nesta conta." }, { status: 403 });
      }
    }

    const results = [];
    for (const account of accounts) {
      if (!account.clientId) {
        results.push({
          adAccountId: account.id,
          clientId: "",
          platform: account.platform,
          dateRef,
          ok: false,
          error: "Conta sem clientId vinculado.",
        });
        continue;
      }
      const result = await runSyncForAdAccount({
        adAccountId: account.id,
        clientId: account.clientId,
        platform: account.platform,
        externalAccountId: account.externalAccountId,
        dateRef,
      });
      results.push(result);
    }

    return NextResponse.json({
      ok: true,
      dateRef,
      synced: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao sincronizar campanhas:", error);
    return NextResponse.json({ error: "Falha ao sincronizar campanhas." }, { status: 500 });
  }
}
