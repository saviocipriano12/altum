import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantForCurrentUser } from "@/lib/server/tenant";

type UsefulLink = { title?: string; url?: string };
type LeadOffer = {
  id?: string;
  title?: string;
  priceFrom?: number;
  priceTo?: number;
  pitch?: string;
  deliverables?: string[];
};

type Body = {
  leadId?: string;
  patch?: {
    owner?: string;
    ownerId?: string | null;
    notes?: string;
    stage?: string;
    pipelineStage?: string;
    stageTags?: string[];
    offer?: LeadOffer;
    nome?: string;
    endereco?: string;
    telefone?: string;
    website?: string;
    cnpj?: string;
    instagram?: string;
    linkedin?: string;
    origem?: string;
    sourceType?: string;
    sourceId?: string;
    score?: number;
    heat?: string;
    reasons?: string[];
    priority?: "low" | "medium" | "high" | string;
    kanbanIndex?: number;
    lat?: number;
    lng?: number;
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    isOpenNow?: boolean;
    photos?: string[];
    usefulLinks?: UsefulLink[];
    status?: "novo" | "contatado" | "respondido" | "qualificado" | "descartado";
    lastContactAtNow?: boolean;
  };
};

function sanitizeString(value: unknown, max = 500) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  if (!cleaned) return "";
  return cleaned.slice(0, max);
}

function sanitizeLinks(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      const link = item as UsefulLink;
      const title = sanitizeString(link.title, 120) || "";
      const url = sanitizeString(link.url, 500) || "";
      if (!title || !url) return null;
      return { title, url };
    })
    .filter(Boolean) as Array<{ title: string; url: string }>;
}

function sanitizeOffer(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const offer = value as LeadOffer;
  const deliverables = Array.isArray(offer.deliverables)
    ? offer.deliverables
        .map((item) => sanitizeString(item, 120))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    id: sanitizeString(offer.id, 80) || "",
    title: sanitizeString(offer.title, 160) || "",
    priceFrom: Number(offer.priceFrom || 0),
    priceTo: Number(offer.priceTo || 0),
    pitch: sanitizeString(offer.pitch, 1200) || "",
    deliverables,
  };
}

function sanitizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeStringArray(value: unknown, maxItems = 30, maxItemLen = 220) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => sanitizeString(item, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;

    const leadId = (body.leadId || "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "Campo obrigatorio: leadId." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const leadData = leadSnap.data() as { ownerId?: string; tenantId?: string };
    const ownerId = leadData.ownerId || null;
    if (!isAdmin(user) && ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao neste lead." }, { status: 403 });
    }

    const patch = body.patch || {};
    const payload: Record<string, unknown> = {};

    if (typeof patch.owner !== "undefined") payload.owner = sanitizeString(patch.owner, 140) || "";
    if (typeof patch.notes !== "undefined") payload.notes = sanitizeString(patch.notes, 5000) || "";
    if (typeof patch.stage !== "undefined") payload.stage = sanitizeString(patch.stage, 80) || "";
    if (typeof patch.pipelineStage !== "undefined") {
      payload.pipelineStage = sanitizeString(patch.pipelineStage, 80) || "";
    }
    if (typeof patch.nome !== "undefined") payload.nome = sanitizeString(patch.nome, 180) || "";
    if (typeof patch.endereco !== "undefined") payload.endereco = sanitizeString(patch.endereco, 240) || "";
    if (typeof patch.telefone !== "undefined") payload.telefone = sanitizeString(patch.telefone, 40) || "";
    if (typeof patch.website !== "undefined") payload.website = sanitizeString(patch.website, 300) || "";
    if (typeof patch.cnpj !== "undefined") payload.cnpj = sanitizeString(patch.cnpj, 40) || "";
    if (typeof patch.instagram !== "undefined") payload.instagram = sanitizeString(patch.instagram, 120) || "";
    if (typeof patch.linkedin !== "undefined") payload.linkedin = sanitizeString(patch.linkedin, 240) || "";
    if (typeof patch.origem !== "undefined") payload.origem = sanitizeString(patch.origem, 140) || "";
    if (typeof patch.sourceType !== "undefined") payload.sourceType = sanitizeString(patch.sourceType, 80) || "";
    if (typeof patch.sourceId !== "undefined") payload.sourceId = sanitizeString(patch.sourceId, 180) || "";
    if (typeof patch.score !== "undefined") payload.score = sanitizeNumber(patch.score);
    if (typeof patch.heat !== "undefined") payload.heat = sanitizeString(patch.heat, 20) || "";
    if (typeof patch.priority !== "undefined") payload.priority = sanitizeString(patch.priority, 40) || "";
    if (typeof patch.kanbanIndex !== "undefined") payload.kanbanIndex = sanitizeNumber(patch.kanbanIndex) ?? 0;
    if (typeof patch.lat !== "undefined") payload.lat = sanitizeNumber(patch.lat);
    if (typeof patch.lng !== "undefined") payload.lng = sanitizeNumber(patch.lng);
    if (typeof patch.rating !== "undefined") payload.rating = sanitizeNumber(patch.rating);
    if (typeof patch.userRatingsTotal !== "undefined") {
      payload.userRatingsTotal = sanitizeNumber(patch.userRatingsTotal);
    }
    if (typeof patch.priceLevel !== "undefined") payload.priceLevel = sanitizeNumber(patch.priceLevel);
    if (typeof patch.isOpenNow !== "undefined") {
      payload.isOpenNow = typeof patch.isOpenNow === "boolean" ? patch.isOpenNow : null;
    }
    if (typeof patch.reasons !== "undefined") {
      payload.reasons = sanitizeStringArray(patch.reasons, 20, 180) || [];
    }
    if (typeof patch.photos !== "undefined") {
      payload.photos = sanitizeStringArray(patch.photos, 20, 600) || [];
    }
    if (typeof patch.status !== "undefined") payload.status = patch.status;

    if (Array.isArray(patch.stageTags)) {
      payload.stageTags = patch.stageTags
        .map((item) => sanitizeString(item, 80))
        .filter(Boolean)
        .slice(0, 10);
    }

    if (typeof patch.usefulLinks !== "undefined") {
      payload.usefulLinks = sanitizeLinks(patch.usefulLinks) || [];
    }

    if (typeof patch.offer !== "undefined") {
      payload.offer = sanitizeOffer(patch.offer);
    }

    const shouldRefreshIntelligence =
      typeof patch.nome !== "undefined" ||
      typeof patch.endereco !== "undefined" ||
      typeof patch.telefone !== "undefined" ||
      typeof patch.website !== "undefined" ||
      typeof patch.cnpj !== "undefined" ||
      typeof patch.instagram !== "undefined" ||
      typeof patch.linkedin !== "undefined";

    if (shouldRefreshIntelligence) {
      payload.intelligence = {
        status: "pending",
        trigger: "lead_update",
        updatedAt: FieldValue.serverTimestamp(),
      };
    }

    if (patch.lastContactAtNow) {
      payload.lastContactAt = FieldValue.serverTimestamp();
    }

    if (isAdmin(user) && typeof patch.ownerId !== "undefined") {
      payload.ownerId = patch.ownerId || null;
      if (patch.ownerId) {
        payload.tenantId = (await getTenantForCurrentUser(String(patch.ownerId))) || leadData.tenantId || null;
      }
    }

    if (!leadData.tenantId && typeof payload.tenantId === "undefined") {
      payload.tenantId = (await getTenantForCurrentUser(ownerId || user.uid)) || null;
    }

    payload.updatedAt = FieldValue.serverTimestamp();

    await leadRef.set(payload, { merge: true });

    return NextResponse.json({ ok: true, leadId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao atualizar lead:", error);
    return NextResponse.json({ error: "Falha ao atualizar lead." }, { status: 500 });
  }
}
