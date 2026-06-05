import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { AGENCY_TENANT_ID } from "@/app/lib/server/whatsapp-channel";

type Body = {
  name?: unknown;
  tenantId?: unknown;
  leadIds?: unknown;
  source?: unknown;
  filters?: unknown;
  campaignName?: unknown;
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanLeadIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => clean(item, 180))
        .filter(Boolean)
    )
  ).slice(0, 500);
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  return null;
}

function readFilters(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [clean(key, 80), typeof val === "string" ? clean(val, 180) : val])
      .filter(([key]) => Boolean(key))
  );
}

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const url = new URL(req.url);
    const tenantId = clean(url.searchParams.get("tenantId"), 140) || AGENCY_TENANT_ID;
    const limit = Math.max(1, Math.min(80, Number(url.searchParams.get("limit") || 30)));

    let query = adminDb
      .collection("agency_audiences")
      .where("tenantId", "==", tenantId)
      .limit(limit);

    if (!isAdmin(user)) {
      query = adminDb
        .collection("agency_audiences")
        .where("tenantId", "==", tenantId)
        .where("createdBy", "==", user.uid)
        .limit(limit);
    }

    const snap = await query.get();
    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const summary = data.summary && typeof data.summary === "object" ? (data.summary as Record<string, unknown>) : {};
        return {
          id: doc.id,
          tenantId: clean(data.tenantId, 140),
          name: clean(data.name, 180) || "Audiencia",
          source: clean(data.source, 80),
          campaignName: clean(data.campaignName, 180),
          leadCount: Number(data.leadCount || 0),
          summary: {
            hot: Number(summary.hot || 0),
            withOffer: Number(summary.withOffer || 0),
            withIaReady: Number(summary.withIaReady || 0),
            missingPhone: Number(summary.missingPhone || 0),
          },
          createdAt: toIso(data.createdAt),
          createdByName: clean(data.createdByName, 180),
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao listar audiencias:", error);
    return NextResponse.json({ error: "Falha ao listar audiencias." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;
    const tenantId = clean(body.tenantId, 140) || AGENCY_TENANT_ID;
    const leadIds = cleanLeadIds(body.leadIds);
    const name = clean(body.name, 180) || "Audiencia de prospeccao";

    if (!leadIds.length) {
      throw new RouteAuthError(400, "invalid_payload", "Selecione pelo menos um lead.");
    }

    const leadRefs = leadIds.map((leadId) => adminDb.collection("leads").doc(leadId));
    const leadSnaps = await adminDb.getAll(...leadRefs);
    const validLeadIds: string[] = [];
    let hot = 0;
    let withOffer = 0;
    let withIaReady = 0;
    let missingPhone = 0;

    for (const snap of leadSnaps) {
      if (!snap.exists) continue;
      const data = snap.data() as Record<string, unknown>;
      const ownerId = clean(data.ownerId, 180);
      if (!isAdmin(user) && ownerId && ownerId !== user.uid) continue;
      validLeadIds.push(snap.id);
      if (clean(data.telefone, 80).replace(/\D/g, "").length < 10) missingPhone += 1;
      if (clean(data.heat, 40).toLowerCase() === "quente") hot += 1;
      if (data.offer && typeof data.offer === "object") withOffer += 1;
      const intelligence = data.intelligence && typeof data.intelligence === "object" ? (data.intelligence as Record<string, unknown>) : {};
      if (clean(intelligence.status, 40).toLowerCase() === "ready") withIaReady += 1;
    }

    if (!validLeadIds.length) {
      throw new RouteAuthError(400, "empty_audience", "Nenhum lead valido para salvar nesta audiencia.");
    }

    const ref = adminDb.collection("agency_audiences").doc();
    await ref.set({
      tenantId,
      name,
      source: clean(body.source, 80) || "admin_prospecting",
      campaignName: clean(body.campaignName, 180),
      leadIds: validLeadIds,
      leadCount: validLeadIds.length,
      filters: readFilters(body.filters),
      summary: {
        hot,
        withOffer,
        withIaReady,
        missingPhone,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.name,
    });

    return NextResponse.json({
      ok: true,
      audienceId: ref.id,
      tenantId,
      leadCount: validLeadIds.length,
      summary: { hot, withOffer, withIaReady, missingPhone },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao salvar audiencia:", error);
    return NextResponse.json({ error: "Falha ao salvar audiencia." }, { status: 500 });
  }
}
