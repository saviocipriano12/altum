import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { commercialOfferReadiness, normalizeCommercialOffer, normalizeCommercialOfferRelationIds } from "@/lib/commercial-offer";
import { normalizeCommercialKnowledgeFields } from "@/lib/commercial-knowledge-fields";

type Body = {
  type?: "faq" | "catalog" | "policy";
  content?: string;
  tags?: string[] | string;
  mediaItems?: MediaItemBody[];
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  serviceKey?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  currency?: string | null;
  sku?: string | null;
  inventoryQuantity?: number | null;
  checkoutUrl?: string | null;
  kind?: "produto" | "servico" | "plano" | "pacote" | string | null;
  upsellKeys?: string[] | string;
  crossSellKeys?: string[] | string;
  upsellOfferIds?: string[] | string;
  crossSellOfferIds?: string[] | string;
  downsellOfferIds?: string[] | string;
  incompatibleOfferIds?: string[] | string;
  nextOfferId?: string | null;
  priority?: number | null;
  availability?: "active" | "seasonal" | "paused" | string | null;
  useInAi?: boolean;
  description?: string | null;
  benefits?: string | null;
  commonQuestions?: string | null;
  objections?: string | null;
  whenRecommend?: string | null;
  whenNotRecommend?: string | null;
  whenHuman?: string | null;
  productSpecs?: string | null;
  stockDelivery?: string | null;
  warranty?: string | null;
  serviceScope?: string | null;
  duration?: string | null;
  schedulingRules?: string | null;
  deliverables?: string | null;
  proofAndCases?: string | null;
  demonstration?: string | null;
  paymentConditions?: string | null;
  supportAndSla?: string | null;
};

type MediaItemBody = {
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  usage?: "auto" | "suggest" | "blocked" | string | null;
};

function clean(value: unknown, max = 800) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 60))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => clean(item, 60))
      .filter(Boolean)
      .slice(0, 20);
  }

  return [] as string[];
}

function parseList(value: unknown, max = 20) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 80))
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof value === "string") {
    return value
      .split(/,|\n|;|\|/)
      .map((item) => clean(item, 80))
      .filter(Boolean)
      .slice(0, max);
  }
  return [] as string[];
}

function normalizeType(value: unknown): "faq" | "catalog" | "policy" {
  const type = String(value || "faq").toLowerCase();
  if (type === "catalog") return "catalog";
  if (type === "policy") return "policy";
  return "faq";
}

function normalizeMediaType(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "image" || normalized === "video" || normalized === "document") return normalized;
  return "";
}

function normalizeMediaUsage(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "auto" || normalized === "suggest" || normalized === "blocked") return normalized;
  return "suggest";
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function priceValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Number(value)) : null;
}

function normalizeAvailability(value: unknown) {
  const normalized = clean(value, 30).toLowerCase();
  if (normalized === "active" || normalized === "seasonal" || normalized === "paused") return normalized;
  return "active";
}

function normalizeMediaItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const mediaUrl = clean(data.mediaUrl, 1200);
      const mediaType = normalizeMediaType(data.mediaType);
      if (!mediaUrl || !mediaType) return null;

      return {
        mediaUrl,
        mediaType,
        mediaTitle: clean(data.mediaTitle, 160) || null,
        mediaStoragePath: clean(data.mediaStoragePath, 600) || null,
        mediaMimeType: clean(data.mediaMimeType, 140) || null,
        mediaSize: numericValue(data.mediaSize),
        usage: normalizeMediaUsage(data.usage),
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

async function normalizeOfferRelations(tenantId: string, body: Body, currentOfferId?: string | null) {
  const requested = [body.upsellOfferIds, body.crossSellOfferIds, body.downsellOfferIds, body.incompatibleOfferIds, body.nextOfferId]
    .some((value) => value !== undefined);
  if (!requested) return null;

  const offers = await adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(200).get();
  const validOfferIds = offers.docs
    .filter((doc) => String(doc.data().type || "").toLowerCase() === "catalog")
    .map((doc) => doc.id);
  const normalize = (value: unknown) => normalizeCommercialOfferRelationIds({ value, validOfferIds, currentOfferId, max: 12 });
  const nextOfferId = normalize(body.nextOfferId)[0] || null;
  return {
    upsellOfferIds: normalize(body.upsellOfferIds),
    crossSellOfferIds: normalize(body.crossSellOfferIds),
    downsellOfferIds: normalize(body.downsellOfferIds),
    incompatibleOfferIds: normalize(body.incompatibleOfferIds),
    nextOfferId,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb
      .collection("kb_docs")
      .where("tenantId", "==", tenantId)
      .limit(200)
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const normalizedMediaItems = normalizeMediaItems(data.mediaItems);
      const commercial = normalizeCommercialOffer({ ...data, mediaItems: normalizedMediaItems });
      const readiness = commercialOfferReadiness({ ...data, mediaItems: normalizedMediaItems });
      return {
        id: doc.id,
        tenantId,
        type: normalizeType(data.type),
        content: clean(data.content, 1200),
        tags: parseTags(data.tags),
        mediaUrl: clean(data.mediaUrl, 1200) || null,
        mediaType: normalizeMediaType(data.mediaType) || null,
        mediaTitle: clean(data.mediaTitle, 160) || null,
        mediaStoragePath: clean(data.mediaStoragePath, 600) || null,
        mediaMimeType: clean(data.mediaMimeType, 140) || null,
        mediaSize: numericValue(data.mediaSize),
        mediaItems: normalizedMediaItems,
        serviceKey: clean(data.serviceKey, 120) || null,
        productName: clean(data.productName, 160) || null,
        productCategory: clean(data.productCategory, 120) || null,
        targetProfile: clean(data.targetProfile, 180) || null,
        priceFrom: priceValue(data.priceFrom),
        priceTo: priceValue(data.priceTo),
        currency: commercial.currency,
        sku: commercial.sku,
        inventoryQuantity: commercial.inventoryQuantity,
        checkoutUrl: commercial.checkoutUrl,
        kind: commercial.kind,
        upsellKeys: parseList(data.upsellKeys, 12),
        crossSellKeys: parseList(data.crossSellKeys, 12),
        upsellOfferIds: parseList(data.upsellOfferIds, 12),
        crossSellOfferIds: parseList(data.crossSellOfferIds, 12),
        downsellOfferIds: parseList(data.downsellOfferIds, 12),
        incompatibleOfferIds: parseList(data.incompatibleOfferIds, 12),
        nextOfferId: clean(data.nextOfferId, 180) || null,
        priority: numericValue(data.priority),
        availability: normalizeAvailability(data.availability),
        ...normalizeCommercialKnowledgeFields(data),
        commercialReadiness: {
          readyForAi: readiness.readyForAi,
          issues: readiness.issues,
          sellable: readiness.sellability.sellable,
          sellabilityReason: readiness.sellability.reason,
        },
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      };
    });

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao listar base de conhecimento:", error);
    return NextResponse.json({ error: "Falha ao listar documentos." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const content = clean(body.content, 1600);
    if (!content) {
      return NextResponse.json({ error: "Campo obrigatorio: content." }, { status: 400 });
    }
    const mediaItems = normalizeMediaItems(body.mediaItems);
    const commercial = normalizeCommercialOffer({ ...body, mediaItems });
    const relations = await normalizeOfferRelations(tenantId, body);

    const docRef = await adminDb.collection("kb_docs").add({
      tenantId,
      type: normalizeType(body.type),
      content,
      tags: parseTags(body.tags),
      mediaUrl: clean(body.mediaUrl, 1200) || null,
      mediaType: normalizeMediaType(body.mediaType) || null,
      mediaTitle: clean(body.mediaTitle, 160) || null,
      mediaStoragePath: clean(body.mediaStoragePath, 600) || null,
      mediaMimeType: clean(body.mediaMimeType, 140) || null,
      mediaSize: numericValue(body.mediaSize),
      mediaItems,
      serviceKey: clean(body.serviceKey, 120) || null,
      productName: clean(body.productName, 160) || null,
      productCategory: clean(body.productCategory, 120) || null,
      targetProfile: clean(body.targetProfile, 180) || null,
      priceFrom: priceValue(body.priceFrom),
      priceTo: priceValue(body.priceTo),
      currency: commercial.currency,
      sku: commercial.sku,
      inventoryQuantity: commercial.inventoryQuantity,
      checkoutUrl: commercial.checkoutUrl,
      kind: commercial.kind,
      upsellKeys: parseList(body.upsellKeys, 12),
      crossSellKeys: parseList(body.crossSellKeys, 12),
      ...(relations || {}),
      priority: numericValue(body.priority),
      availability: normalizeAvailability(body.availability),
      ...normalizeCommercialKnowledgeFields(body),
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, tenantId, kbDocId: docRef.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao salvar base de conhecimento:", error);
    return NextResponse.json({ error: "Falha ao salvar documento." }, { status: 500 });
  }
}
