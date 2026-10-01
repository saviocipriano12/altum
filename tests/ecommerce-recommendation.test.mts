import assert from "node:assert/strict";
import test from "node:test";
import { recommendEcommerceRelatedOffer } from "../lib/ecommerce-recommendation.ts";

const baseOffer = (productName: string, extra: Record<string, unknown> = {}) => ({
  productName,
  availability: "active",
  inventoryQuantity: 5,
  ...extra,
});

test("recompra nao e inferida por categoria ou preco", () => {
  const recommendation = recommendEcommerceRelatedOffer({
    purchasedOfferIds: ["cadeira"],
    offers: [
      { id: "cadeira", data: baseOffer("Cadeira", { productCategory: "Escritorio" }) },
      { id: "mesa", data: baseOffer("Mesa", { productCategory: "Escritorio" }) },
    ],
  });
  assert.equal(recommendation, null);
});

test("recompra usa somente cross-sell configurado e produto vendavel", () => {
  const recommendation = recommendEcommerceRelatedOffer({
    purchasedOfferIds: ["cadeira"],
    offers: [
      { id: "cadeira", data: baseOffer("Cadeira", { crossSellOfferIds: ["mesa"] }) },
      { id: "mesa", data: baseOffer("Mesa", { checkoutUrl: "https://loja.exemplo/mesa" }) },
    ],
  });
  assert.deepEqual(recommendation, {
    offerId: "mesa",
    offerName: "Mesa",
    checkoutUrl: "https://loja.exemplo/mesa",
    relation: "cross_sell",
  });
});

test("relacao incompativel, item ja comprado ou sem estoque nunca vira recomendacao", () => {
  const recommendation = recommendEcommerceRelatedOffer({
    purchasedOfferIds: ["principal", "comprado"],
    offers: [
      {
        id: "principal",
        data: baseOffer("Principal", {
          crossSellOfferIds: ["comprado", "bloqueado", "sem_estoque", "valido"],
          incompatibleOfferIds: ["bloqueado"],
        }),
      },
      { id: "comprado", data: baseOffer("Ja comprado") },
      { id: "bloqueado", data: baseOffer("Bloqueado") },
      { id: "sem_estoque", data: baseOffer("Sem estoque", { inventoryQuantity: 0 }) },
      { id: "valido", data: baseOffer("Valido") },
    ],
  });
  assert.equal(recommendation?.offerId, "valido");
});
