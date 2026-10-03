import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialOfferReadiness,
  commercialOfferSellability,
  normalizeCommercialOfferRelationIds,
  normalizeCommercialOffer,
  resolveCommercialCheckoutAction,
} from "../lib/commercial-offer.ts";
import {
  hasSpecificCommercialOfferReference,
  hasVerifiedCommercialFactSource,
  selectMediaDocForLead,
  recommendCommercialOffers,
  type KbDoc,
} from "../lib/server/ai/agent.ts";

test("normaliza preco, moeda, estoque e midia em um contrato unico", () => {
  const offer = normalizeCommercialOffer({
    tags: ["tipo:produto"],
    productName: "Kit Premium",
    priceFrom: "R$ 899,90",
    priceTo: 799,
    currency: "brl",
    inventoryQuantity: 4.9,
    checkoutUrl: "https://loja.exemplo.com/kit",
    mediaItems: [
      { mediaUrl: "https://cdn.exemplo.com/kit.jpg", mediaType: "image", usage: "auto" },
      { mediaUrl: "https://cdn.exemplo.com/kit.jpg", mediaType: "image", usage: "auto" },
    ],
  });
  assert.equal(offer.kind, "produto");
  assert.equal(offer.priceFrom, 799);
  assert.equal(offer.priceTo, 899.9);
  assert.equal(offer.currency, "BRL");
  assert.equal(offer.inventoryQuantity, 4);
  assert.equal(offer.mediaItems.length, 1);
});

test("produto sem estoque nunca pode ser recomendado como vendavel", () => {
  const offer = normalizeCommercialOffer({ kind: "produto", availability: "active", inventoryQuantity: 0 });
  assert.deepEqual(commercialOfferSellability(offer), { sellable: false, reason: "out_of_stock" });
});

test("disponibilidade ausente nao vira fato comercial por padrao", () => {
  const withoutAvailability = normalizeCommercialOffer({ kind: "produto", inventoryQuantity: 3 });
  const configuredAvailability = normalizeCommercialOffer({ kind: "produto", inventoryQuantity: 3, availability: "active" });
  assert.equal(withoutAvailability.availabilityConfigured, false);
  assert.equal(configuredAvailability.availabilityConfigured, true);
});

test("servico nao depende de estoque fisico", () => {
  const offer = normalizeCommercialOffer({ kind: "servico", availability: "active" });
  assert.deepEqual(commercialOfferSellability(offer), { sellable: true, reason: "available" });
});

test("prontidao da IA exige fatos comerciais e midia utilizavel", () => {
  const incomplete = commercialOfferReadiness({
    kind: "produto",
    productName: "Produto",
    content: "Descricao",
    priceFrom: 100,
    availability: "active",
  });
  assert.equal(incomplete.readyForAi, false);
  assert.deepEqual(incomplete.issues.sort(), ["missing_target_profile", "missing_usable_media", "stock_unconfirmed"].sort());

  const ready = commercialOfferReadiness({
    kind: "produto",
    productName: "Produto",
    content: "Descricao",
    targetProfile: "Lojas",
    priceFrom: 100,
    inventoryQuantity: 3,
    availability: "active",
    mediaItems: [{ mediaUrl: "https://cdn.exemplo.com/p.jpg", mediaType: "image", usage: "auto" }],
  });
  assert.equal(ready.readyForAi, true);
});

test("links executaveis ou com credenciais sao descartados", () => {
  assert.equal(normalizeCommercialOffer({ checkoutUrl: "javascript:alert(1)" }).checkoutUrl, null);
  assert.equal(normalizeCommercialOffer({ checkoutUrl: "https://user:pass@exemplo.com" }).checkoutUrl, null);
});

test("relacoes comerciais aceitam somente ofertas reais e nunca a propria oferta", () => {
  assert.deepEqual(
    normalizeCommercialOfferRelationIds({
      value: ["premium", "invalida", "base", "premium"],
      validOfferIds: ["base", "premium", "complemento"],
      currentOfferId: "base",
    }),
    ["premium"]
  );
});

test("motor nao inventa upsell ou cross-sell por preco, categoria ou proximidade", () => {
  const baseDocs: KbDoc[] = [
    { id: "base", type: "catalog", content: "Plano Base para empresas", productName: "Plano Base", priceFrom: 100, availability: "active", score: 2, tags: [] },
    { id: "premium", type: "catalog", content: "Plano Premium para empresas", productName: "Plano Premium", priceFrom: 500, availability: "active", score: 1.8, tags: [] },
  ];
  const withoutLinks = recommendCommercialOffers({ kbDocs: baseDocs, inboundText: "Quero o Plano Base", commercialTemperature: "hot" });
  assert.equal(withoutLinks.primaryOffer, "Plano Base");
  assert.equal(withoutLinks.upsellOffer, null);
  assert.equal(withoutLinks.crossSellOffer, null);

  const withLinks = recommendCommercialOffers({
    kbDocs: [{ ...baseDocs[0], upsellOfferIds: ["premium"] }, baseDocs[1]],
    inboundText: "Quero o Plano Base",
    commercialTemperature: "hot",
  });
  assert.equal(withLinks.upsellOffer, "Plano Premium");
});

test("checkout so e liberado com intencao explicita, oferta e estoque confirmados", () => {
  const offer = normalizeCommercialOffer({
    kind: "produto",
    inventoryQuantity: 2,
    checkoutUrl: "https://loja.exemplo.com/finalizar",
  });
  assert.deepEqual(resolveCommercialCheckoutAction({ offer, inboundText: "Gostei do produto" }), {
    shouldSend: false,
    reason: "checkout_not_requested",
    url: null,
  });
  assert.deepEqual(resolveCommercialCheckoutAction({ offer, inboundText: "Quero comprar, manda o link" }), {
    shouldSend: true,
    reason: "explicit_purchase_intent",
    url: "https://loja.exemplo.com/finalizar",
  });
  assert.equal(
    resolveCommercialCheckoutAction({
      offer: normalizeCommercialOffer({ kind: "produto", checkoutUrl: "https://loja.exemplo.com/finalizar" }),
      inboundText: "Quero comprar",
    }).reason,
    "stock_unconfirmed"
  );
});

test("fato transacional exige evidencia concreta, nao apenas uma palavra em uma FAQ", () => {
  assert.equal(
    hasVerifiedCommercialFactSource("price", [
      { type: "faq", content: "Para saber preco, fale com nossa equipe." },
    ]),
    false
  );
  assert.equal(
    hasVerifiedCommercialFactSource("price", [
      { type: "catalog", content: "Oferta", priceFrom: 1490 },
    ]),
    true
  );
  assert.equal(
    hasVerifiedCommercialFactSource("inventory", [
      { type: "catalog", content: "Produto", kind: "produto", inventoryQuantity: null, availabilityConfigured: true, availability: "active" },
    ]),
    false
  );
  assert.equal(
    hasVerifiedCommercialFactSource("inventory", [
      { type: "catalog", content: "Produto", kind: "produto", inventoryQuantity: 2 },
    ]),
    true
  );
  assert.equal(
    hasVerifiedCommercialFactSource("delivery", [
      { type: "catalog", content: "Produto", stockDelivery: "Envio em ate 3 dias uteis." },
    ]),
    true
  );
});

test("midia comercial nunca e enviada sem uma oferta identificada", () => {
  const catalog: KbDoc[] = [
    {
      id: "kit-solar",
      type: "catalog",
      content: "Kit Solar para residencias.",
      productName: "Kit Solar",
      tags: ["energia solar"],
      score: 1,
      availability: "active",
      inventoryQuantity: 3,
      mediaUrl: "https://cdn.exemplo.com/kit-solar.jpg",
      mediaType: "image",
      mediaTitle: "Foto do Kit Solar",
    },
  ];

  assert.equal(
    selectMediaDocForLead({
      inboundText: "Me manda uma foto?",
      kbDocs: catalog,
      conversation: [],
    }),
    null
  );
  assert.equal(
    selectMediaDocForLead({
      inboundText: "Me manda uma foto do Kit Solar?",
      kbDocs: catalog,
      conversation: [],
    })?.id,
    "kit-solar"
  );
  assert.equal(
    selectMediaDocForLead({
      inboundText: "Perfeito, pode seguir.",
      kbDocs: catalog,
      conversation: [],
      recommendedOffer: "Kit Solar",
      commercialTemperature: "hot",
    })?.id,
    "kit-solar"
  );
});

test("perguntas transacionais genericas pedem a oferta antes de consultar um fato", () => {
  const offers = [{ productName: "Plano Premium", serviceKey: "plano-premium" }];
  assert.equal(
    hasSpecificCommercialOfferReference({ inboundText: "Quanto custa?", kbDocs: offers }),
    false
  );
  assert.equal(
    hasSpecificCommercialOfferReference({ inboundText: "Quanto custa o Premium?", kbDocs: offers }),
    true
  );
  assert.equal(
    hasSpecificCommercialOfferReference({
      inboundText: "E o prazo de entrega?",
      kbDocs: offers,
      contextOffers: ["Kit Solar residencial"],
    }),
    true
  );
});
