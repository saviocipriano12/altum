import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, isAdmin } from "@/app/lib/server/route-auth";
import type { AdPlatform } from "@/app/types/domain";

type Body = {
  clientId?: string;
  accountLabel?: string;
  platform?: AdPlatform;
  externalAccountId?: string;
  currency?: string;
  timezone?: string;
  syncMode?: "api" | "manual" | "hybrid";
  credentialsRef?: string;
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizePlatform(value: unknown): AdPlatform {
  if (value === "meta_ads" || value === "google_ads" || value === "tiktok_ads" || value === "linkedin_ads") {
    return value;
  }
  return "meta_ads";
}

function normalizeSyncMode(value: unknown): "api" | "manual" | "hybrid" {
  if (value === "api" || value === "manual" || value === "hybrid") return value;
  return "manual";
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 120);
    const accountLabel = clean(body.accountLabel, 140);
    if (!clientId || !accountLabel) {
      return NextResponse.json(
        { error: "Campos obrigatorios: clientId e accountLabel." },
        { status: 400 }
      );
    }

    const clientRef = adminDb.collection("clientes").doc(clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    const clientData = clientSnap.data() as { ownerId?: string; owner?: string; name?: string };
    const ownerId = clientData.ownerId || user.uid;
    const ownerName = clientData.owner || user.name;
    if (!isAdmin(user) && ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao neste cliente." }, { status: 403 });
    }

    const payload = {
      clientId,
      clientName: clientData.name || "Cliente",
      ownerId,
      ownerName,
      accountLabel,
      platform: normalizePlatform(body.platform),
      externalAccountId: clean(body.externalAccountId, 160),
      currency: clean(body.currency, 8) || "BRL",
      timezone: clean(body.timezone, 80) || "America/Sao_Paulo",
      status: "active",
      syncMode: normalizeSyncMode(body.syncMode),
      credentialsRef: clean(body.credentialsRef, 240) || null,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSyncAt: null,
    };

    const created = await adminDb.collection("ad_accounts").add(payload);

    await adminDb.collection("audit_logs").add({
      type: "ad_account_created",
      actorId: user.uid,
      actorName: user.name,
      adAccountId: created.id,
      clientId,
      platform: payload.platform,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao criar conta de anuncio:", error);
    return NextResponse.json({ error: "Falha ao criar conta de anuncio." }, { status: 500 });
  }
}
