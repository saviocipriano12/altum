import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type SyncLogItem = {
  id: string;
  adAccountId?: string;
  clientId?: string;
  platform?: string;
  dateRef?: string;
  ok?: boolean;
  error?: string;
  metrics?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    roas?: number;
  };
  createdAt?: unknown;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function getMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();

  const maybeTimestamp = value as
    | { toDate?: () => Date }
    | { _seconds?: number; _nanoseconds?: number };
  if (typeof maybeTimestamp?.toDate === "function") {
    const date = maybeTimestamp.toDate();
    return date instanceof Date ? date.getTime() : 0;
  }

  if (typeof maybeTimestamp?._seconds === "number") {
    return maybeTimestamp._seconds * 1000;
  }

  return 0;
}

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const { searchParams } = new URL(req.url);
    const adAccountId = clean(searchParams.get("adAccountId"), 120);
    const clientId = clean(searchParams.get("clientId"), 120);
    const limit = Math.min(200, Math.max(10, Number(searchParams.get("limit") || 60)));

    if (adAccountId) {
      const accountSnap = await adminDb.collection("ad_accounts").doc(adAccountId).get();
      if (!accountSnap.exists) {
        return NextResponse.json({ error: "Conta de anuncio nao encontrada." }, { status: 404 });
      }
      const accountData = accountSnap.data() as { ownerId?: string };
      if (!isAdmin(user) && accountData.ownerId !== user.uid) {
        return NextResponse.json({ error: "Sem permissao nesta conta." }, { status: 403 });
      }
    } else if (clientId) {
      const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
      if (!clientSnap.exists) {
        return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
      }
      const clientData = clientSnap.data() as { ownerId?: string };
      if (!isAdmin(user) && clientData.ownerId !== user.uid) {
        return NextResponse.json({ error: "Sem permissao neste cliente." }, { status: 403 });
      }
    }

    const logsSnap = await adminDb
      .collection("campaign_sync_logs")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    let logs = logsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SyncLogItem, "id">),
    }));

    if (!isAdmin(user) && !adAccountId && !clientId) {
      const accountsSnap = await adminDb
        .collection("ad_accounts")
        .where("ownerId", "==", user.uid)
        .limit(400)
        .get();
      const allowedAccountIds = new Set(accountsSnap.docs.map((doc) => doc.id));
      logs = logs.filter((item) => allowedAccountIds.has(String(item.adAccountId || "")));
    }

    if (adAccountId) {
      logs = logs.filter((item) => item.adAccountId === adAccountId);
    }
    if (clientId) {
      logs = logs.filter((item) => item.clientId === clientId);
    }

    logs.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

    return NextResponse.json({ ok: true, items: logs.slice(0, limit) });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao listar logs de sync de campanhas:", error);
    return NextResponse.json(
      { error: "Falha ao listar logs de sync de campanhas." },
      { status: 500 }
    );
  }
}

