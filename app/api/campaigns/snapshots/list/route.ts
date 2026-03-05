import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseDateRef(value: unknown) {
  const raw = clean(value, 20);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const { searchParams } = new URL(req.url);
    const adAccountId = clean(searchParams.get("adAccountId"), 120);
    const clientId = clean(searchParams.get("clientId"), 120);
    const rangeDays = Math.min(90, Math.max(7, Number(searchParams.get("rangeDays") || 30)));
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - rangeDays);

    let docs: Array<Record<string, unknown>> = [];

    if (adAccountId) {
      const accountSnap = await adminDb.collection("ad_accounts").doc(adAccountId).get();
      if (!accountSnap.exists) {
        return NextResponse.json({ error: "Conta de anuncio nao encontrada." }, { status: 404 });
      }
      const accountData = accountSnap.data() as { ownerId?: string; clientId?: string };
      if (!isAdmin(user) && accountData.ownerId !== user.uid) {
        return NextResponse.json({ error: "Sem permissao nesta conta." }, { status: 403 });
      }

      const snap = await adminDb
        .collection("campaign_snapshots")
        .where("adAccountId", "==", adAccountId)
        .limit(400)
        .get();
      docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    } else if (clientId) {
      const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
      if (!clientSnap.exists) {
        return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
      }
      const clientData = clientSnap.data() as { ownerId?: string };
      if (!isAdmin(user) && clientData.ownerId !== user.uid) {
        return NextResponse.json({ error: "Sem permissao neste cliente." }, { status: 403 });
      }
      const snap = await adminDb
        .collection("campaign_snapshots")
        .where("clientId", "==", clientId)
        .limit(1000)
        .get();
      docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    } else {
      let accountsQuery = adminDb.collection("ad_accounts").limit(100);
      if (!isAdmin(user)) accountsQuery = accountsQuery.where("ownerId", "==", user.uid);
      const accountsSnap = await accountsQuery.get();
      const accountIds = accountsSnap.docs.map((doc) => doc.id);
      if (!accountIds.length) return NextResponse.json({ ok: true, items: [] });

      const chunks: string[][] = [];
      for (let i = 0; i < accountIds.length; i += 10) {
        chunks.push(accountIds.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const snap = await adminDb
          .collection("campaign_snapshots")
          .where("adAccountId", "in", chunk)
          .limit(800)
          .get();
        docs.push(...snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })));
      }
    }

    const filtered = docs
      .filter((item) => {
        const date = parseDateRef(item.dateRef);
        return date ? date >= minDate : false;
      })
      .sort((a, b) => {
        const aTime = parseDateRef(a.dateRef)?.getTime() ?? 0;
        const bTime = parseDateRef(b.dateRef)?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 500);

    return NextResponse.json({ ok: true, items: filtered });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao listar snapshots de campanhas:", error);
    return NextResponse.json(
      { error: "Falha ao listar snapshots de campanhas." },
      { status: 500 }
    );
  }
}
