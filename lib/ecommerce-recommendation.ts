import { commercialOfferSellability, normalizeCommercialOffer } from "@/lib/commercial-offer";

type OfferRecord = Record<string, unknown>;

export type EcommerceOfferRecommendation = {
  offerId: string;
  offerName: string;
  checkoutUrl: string | null;
  relation: "cross_sell" | "upsell" | "next_offer";
};

function ids(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

/**
 * Chooses only an explicit catalog relationship. We deliberately do not infer
 * a recommendation from price, category, or product name: a post-purchase
 * offer must remain a merchant decision, not an AI guess.
 */
export function recommendEcommerceRelatedOffer(input: {
  purchasedOfferIds: string[];
  offers: Array<{ id: string; data: OfferRecord }>;
}): EcommerceOfferRecommendation | null {
  const byId = new Map(input.offers.map((offer) => [offer.id, offer.data]));
  const purchased = new Set(input.purchasedOfferIds.filter(Boolean));
  const candidates: Array<{ id: string; relation: EcommerceOfferRecommendation["relation"] }> = [];

  for (const purchasedId of purchased) {
    const source = byId.get(purchasedId);
    if (!source) continue;
    for (const id of ids(source.crossSellOfferIds)) candidates.push({ id, relation: "cross_sell" });
    for (const id of ids(source.upsellOfferIds)) candidates.push({ id, relation: "upsell" });
    const next = typeof source.nextOfferId === "string" ? source.nextOfferId.trim() : "";
    if (next) candidates.push({ id: next, relation: "next_offer" });
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id || purchased.has(candidate.id) || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const target = byId.get(candidate.id);
    if (!target) continue;

    // A source can explicitly mark an item incompatible; that takes priority
    // over a stale cross-sell / upsell relationship.
    const incompatible = Array.from(purchased).some((sourceId) => ids(byId.get(sourceId)?.incompatibleOfferIds).includes(candidate.id));
    if (incompatible) continue;

    const offer = normalizeCommercialOffer(target);
    if (!offer.productName || !commercialOfferSellability(offer).sellable) continue;
    return {
      offerId: candidate.id,
      offerName: offer.productName,
      checkoutUrl: offer.checkoutUrl,
      relation: candidate.relation,
    };
  }
  return null;
}
