export type CommercialOfferKind = "produto" | "servico" | "plano" | "pacote";
export type CommercialOfferAvailability = "active" | "seasonal" | "paused";
export type CommercialOfferMediaType = "image" | "video" | "document";
export type CommercialOfferMediaUsage = "auto" | "suggest" | "blocked";

export type CommercialOfferMedia = {
  mediaUrl: string;
  mediaType: CommercialOfferMediaType;
  mediaTitle: string | null;
  mediaStoragePath: string | null;
  mediaMimeType: string | null;
  mediaSize: number | null;
  usage: CommercialOfferMediaUsage;
};

export type CommercialOffer = {
  kind: CommercialOfferKind;
  serviceKey: string | null;
  productName: string | null;
  productCategory: string | null;
  targetProfile: string | null;
  sku: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  currency: string;
  inventoryQuantity: number | null;
  availability: CommercialOfferAvailability;
  /** Whether availability was explicitly provided, rather than assumed for compatibility. */
  availabilityConfigured: boolean;
  checkoutUrl: string | null;
  mediaItems: CommercialOfferMedia[];
  source: string;
  sourceKey: string | null;
};

/**
 * Normalizes relationships entered by the client or an integration. The caller
 * supplies the catalog ids that actually exist for the tenant: relationships
 * must never become loose labels that can point the agent at an arbitrary item.
 */
export function normalizeCommercialOfferRelationIds(input: {
  value: unknown;
  validOfferIds: Iterable<string>;
  currentOfferId?: string | null;
  max?: number;
}) {
  const valid = new Set(Array.from(input.validOfferIds).map((id) => String(id).trim()).filter(Boolean));
  const currentOfferId = String(input.currentOfferId || "").trim();
  const source = Array.isArray(input.value)
    ? input.value
    : typeof input.value === "string"
      ? input.value.split(/,|\n|;|\|/)
      : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const candidate of source) {
    const id = typeof candidate === "string" ? candidate.trim() : "";
    if (!id || id === currentOfferId || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= (input.max || 12)) break;
  }
  return output;
}

function clean(value: unknown, max = 800) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/[^\d,.-]/g, "");
  if (!raw || !/\d/.test(raw)) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function normalizeCommercialOfferKind(value: unknown): CommercialOfferKind {
  const normalized = clean(value, 30).toLowerCase();
  if (normalized === "servico" || normalized === "serviço") return "servico";
  if (normalized === "plano") return "plano";
  if (["pacote", "kit", "combo"].includes(normalized)) return "pacote";
  return "produto";
}

export function normalizeCommercialOfferAvailability(value: unknown): CommercialOfferAvailability {
  const normalized = clean(value, 30).toLowerCase();
  if (normalized === "seasonal" || normalized === "paused") return normalized;
  return "active";
}

export function normalizeCommercialOfferCurrency(value: unknown) {
  const normalized = clean(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "BRL";
}

export function normalizeCommercialOfferUrl(value: unknown) {
  const raw = clean(value, 1200);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeCommercialOfferMedia(value: unknown): CommercialOfferMedia[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const mediaUrl = normalizeCommercialOfferUrl(row.mediaUrl);
      const mediaType = clean(row.mediaType, 30).toLowerCase();
      if (!mediaUrl || !["image", "video", "document"].includes(mediaType) || seen.has(mediaUrl)) return null;
      seen.add(mediaUrl);
      const usage = clean(row.usage, 30).toLowerCase();
      return {
        mediaUrl,
        mediaType: mediaType as CommercialOfferMediaType,
        mediaTitle: clean(row.mediaTitle, 160) || null,
        mediaStoragePath: clean(row.mediaStoragePath, 600) || null,
        mediaMimeType: clean(row.mediaMimeType, 140) || null,
        mediaSize: finiteNumber(row.mediaSize),
        usage: (["auto", "suggest", "blocked"].includes(usage) ? usage : "suggest") as CommercialOfferMediaUsage,
      };
    })
    .filter((item): item is CommercialOfferMedia => Boolean(item))
    .slice(0, 12);
}

function kindFromTags(value: unknown) {
  if (!Array.isArray(value)) return null;
  const tag = value.map((item) => clean(item, 80)).find((item) => item.toLowerCase().startsWith("tipo:"));
  return tag ? tag.slice(5).trim() : null;
}

export function normalizeCommercialOffer(value: unknown): CommercialOffer {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const rawFrom = finiteNumber(row.priceFrom);
  const rawTo = finiteNumber(row.priceTo);
  const priceFrom = rawFrom !== null && rawTo !== null ? Math.min(rawFrom, rawTo) : rawFrom;
  const priceTo = rawFrom !== null && rawTo !== null ? Math.max(rawFrom, rawTo) : rawTo;
  const inventory = finiteNumber(row.inventoryQuantity);
  const source = clean(row.source, 60) || "manual";
  const rawAvailability = clean(row.availability, 30).toLowerCase();

  return {
    kind: normalizeCommercialOfferKind(row.kind || kindFromTags(row.tags)),
    serviceKey: clean(row.serviceKey, 120) || null,
    productName: clean(row.productName, 160) || null,
    productCategory: clean(row.productCategory, 120) || null,
    targetProfile: clean(row.targetProfile, 180) || null,
    sku: clean(row.sku, 120) || null,
    priceFrom,
    priceTo,
    currency: normalizeCommercialOfferCurrency(row.currency),
    inventoryQuantity: inventory === null ? null : Math.floor(inventory),
    availability: normalizeCommercialOfferAvailability(row.availability),
    availabilityConfigured: ["active", "seasonal", "paused"].includes(rawAvailability),
    checkoutUrl: normalizeCommercialOfferUrl(row.checkoutUrl),
    mediaItems: normalizeCommercialOfferMedia(row.mediaItems),
    source,
    sourceKey: clean(row.sourceKey, 240) || null,
  };
}

export function commercialOfferSellability(offer: CommercialOffer) {
  if (offer.availability === "paused") return { sellable: false, reason: "paused" as const };
  if (offer.kind === "produto" && offer.inventoryQuantity === 0) {
    return { sellable: false, reason: "out_of_stock" as const };
  }
  if (offer.availability === "seasonal") return { sellable: true, reason: "seasonal" as const };
  if (offer.kind === "produto" && offer.inventoryQuantity === null) {
    return { sellable: true, reason: "stock_unconfirmed" as const };
  }
  return { sellable: true, reason: "available" as const };
}

export function commercialOfferReadiness(input: unknown) {
  const offer = normalizeCommercialOffer(input);
  const row = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const issues: string[] = [];
  if (!offer.productName) issues.push("missing_name");
  if (!clean(row.content, 1600)) issues.push("missing_description");
  if (offer.priceFrom === null && offer.priceTo === null) issues.push("missing_price");
  if (!offer.targetProfile) issues.push("missing_target_profile");
  if (!offer.mediaItems.some((item) => item.usage !== "blocked")) issues.push("missing_usable_media");
  if (offer.kind === "produto" && offer.inventoryQuantity === null) issues.push("stock_unconfirmed");
  return {
    offer,
    sellability: commercialOfferSellability(offer),
    issues,
    readyForAi: issues.length === 0 && commercialOfferSellability(offer).sellable,
  };
}

export function resolveCommercialCheckoutAction(input: {
  offer: CommercialOffer | null;
  inboundText: string;
}) {
  const normalized = String(input.inboundText || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const requested =
    /\b(quero|vou|como|posso|pode|manda|envia|me passa)\b.{0,36}\b(comprar|pagar|finalizar|fechar|checkout|link|pedido|contratar)\b/.test(normalized) ||
    /\b(link de pagamento|link para comprar|fechar pedido|concluir compra|quero esse|vou levar)\b/.test(normalized);
  if (!requested) return { shouldSend: false, reason: "checkout_not_requested" as const, url: null };
  if (!input.offer) return { shouldSend: false, reason: "offer_not_grounded" as const, url: null };
  const sellability = commercialOfferSellability(input.offer);
  if (!sellability.sellable) return { shouldSend: false, reason: sellability.reason, url: null };
  if (sellability.reason === "stock_unconfirmed") {
    return { shouldSend: false, reason: "stock_unconfirmed" as const, url: null };
  }
  if (!input.offer.checkoutUrl) return { shouldSend: false, reason: "checkout_missing" as const, url: null };
  return { shouldSend: true, reason: "explicit_purchase_intent" as const, url: input.offer.checkoutUrl };
}
