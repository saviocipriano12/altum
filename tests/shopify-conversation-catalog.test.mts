import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeShopifyLiveCatalog } from "../lib/shopify-live-catalog.ts";
import { catalogSearchPhrase, isCatalogTurn, resolveCatalogConversation, usableCommerceContext, isLiveCatalogPilotAllowed, catalogFollowup,
  catalogSocialReply, welcomeCatalogTurn, resolveStoreWebsite, productDisplayName } from "../lib/shopify-conversation-catalog.ts";
import { acceptedCatalogInterpretation, catalogAlternativePhrase, catalogRecoveryTurn, handoffAcknowledgement, catalogSearchProposal } from "../lib/shopify-conversation-catalog.ts";
import { composeAiResponse } from "../lib/server/ai/response-composer.ts";
const now = Date.parse("2026-10-13T18:00:00Z");
test("live pilot is limited to exact tenant/chat and a temporary window", () => {
  const pilot = { enabled: true, tenantId: "tenant-1", chatIds: ["chat-7782"], expiresAt: new Date(now + 3_600_000).toISOString() };
  assert.equal(isLiveCatalogPilotAllowed({ tenantId: "tenant-1", chatId: "chat-7782", pilot, now }), true);
  for (const value of [
    { tenantId: "tenant-2", chatId: "chat-7782", pilot, now },
    { tenantId: "tenant-1", chatId: "7782", pilot, now },
    { tenantId: "tenant-1", chatId: "chat-customer", pilot, now },
    { tenantId: "tenant-1", chatId: "chat-7782", pilot: { ...pilot, enabled: false }, now },
    { tenantId: "tenant-1", chatId: "chat-7782", pilot, now: now + 3_600_000 },
    { tenantId: "tenant-1", chatId: "chat-7782", pilot: { ...pilot, expiresAt: new Date(now + 86_400_001).toISOString() }, now },
  ]) assert.equal(isLiveCatalogPilotAllowed(value), false);
});
function catalog(stock = 3, policy = "DENY") {
  return normalizeShopifyLiveCatalog({ shop: { currencyCode: "BRL" }, products: { pageInfo: { hasNextPage: false }, nodes: [{
    id: "gid://shopify/Product/1", title: "Camisa Real Madrid 24/25", status: "ACTIVE", onlineStoreUrl: "https://example.com/products/real",
    variants: { pageInfo: { hasNextPage: false }, nodes: ["M", "G", "GG"].map((size) => ({
      id: `gid://shopify/ProductVariant/${size === "M" ? 10 : size === "G" ? 11 : 12}`, title: size, price: "149.90",
      selectedOptions: [{ name: "Tamanho", value: size }], availableForSale: true,
      inventoryQuantity: size === "G" ? stock : 2, sellableOnlineQuantity: size === "G" ? stock : 2, inventoryPolicy: policy,
    })) },
  }] } }, "conn1", new Date(now).toISOString());
}
test("natural inquiry is reduced to a bounded product phrase", () => {
  assert.equal(catalogSearchPhrase("Olá, vocês tem a camisa do Real Madrid 24/25 no tamanho G?"), "camisa real madrid 24/25");
});

test("real Atletico phrase keeps accents and removes conversational fillers", () => {
  assert.equal(catalogSearchPhrase("Estou buscando uma camisa do Atlético Mineiro, você tem ?"), "camisa atlético mineiro");
  assert.equal(catalogSearchPhrase("Pode ser L"), "");
  const input = "Tudo certo, estou querendo uma casa muda do Flamengo vocês tem ?";
  const intent = { kind: "product_search", query: "camisa Flamengo", evidence: "casa muda do Flamengo", confidence: 0.96 };
  assert.equal(acceptedCatalogInterpretation(intent, input), "camisa flamengo");
  for (const change of [{ confidence: 0.6 }, { query: "camisa Vasco" }, { evidence: "trecho inventado" }, { query: "camisa Flamengo feminina" }, { query: "camisa Flamengo 26/27" }, { query: "camisa Flamengo OR status:archived" }]) {
    assert.equal(acceptedCatalogInterpretation({ ...intent, ...change }, input), null);
  }
  assert.equal(acceptedCatalogInterpretation({ ...intent, evidence: "Flamengo" }, "quero reembolso do Flamengo"), null);
  assert.ok(catalogSearchProposal({ confidence: 0.95, extractedFields: { serviceInterest: "camisa Flamengo" } }, input));
  assert.equal(catalogSearchProposal({ confidence: 0.95, extractedFields: { serviceInterest: "camisa Flamengo manga longa 26/27" } }, input), null);
});

test("alternative search preserves club, sleeve and audience; drops only model/season", () => {
  assert.equal(catalogAlternativePhrase("camisa Atlético Mineiro titular 26/27 feminina manga longa"), "camisa Atlético Mineiro feminina manga longa");
  assert.equal(catalogAlternativePhrase("camisa titular 26/27"), null);
  const context = resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now }).context!;
  const pending = { ...context, alternativesOffered: true, pendingProducts: [{ id: "gid://shopify/Product/1", name: "Camisa Real Madrid" }] };
  assert.equal(catalogFollowup("nenhuma dessas", pending).turn?.decision, "handoff");
  const recovered = catalogRecoveryTurn(resolveCatalogConversation({ catalog: catalog(0), inboundText: "G", now }), "out_of_stock", "Real Madrid");
  assert.equal(recovered.decision, "handoff");
  assert.doesNotMatch(recovered.responseText, /achei outra|encontrei outra|já chamei|em instantes/);
});

test("handoff acknowledgements reflect actual delivery/task receipts, never a promised return", () => {
  const sent = handoffAcknowledgement({ recovery: true, notified: true, taskRecorded: true });
  assert.match(sent, /Já enviei o contexto/);
  const pending = handoffAcknowledgement({ recovery: true, notified: false, taskRecorded: true });
  assert.match(pending, /registrado.*painel/);
  assert.doesNotMatch(pending, /Já enviei|já chamei/);
  const failed = handoffAcknowledgement({ notified: false, taskRecorded: false });
  assert.match(failed, /Não consegui confirmar o encaminhamento/);
});
test("two-turn model then exact G; never first variant or GG", () => {
  const first = resolveCatalogConversation({ catalog: catalog(), inboundText: "Camisa Real Madrid 24/25", now });
  assert.equal(first.status, "selection_required");
  assert.equal(first.verifiedInventory, false);
  const second = resolveCatalogConversation({ catalog: catalog(0), inboundText: "G", previous: first.context, now });
  assert.equal(second.status, "out_of_stock");
  assert.equal(second.variantId, "gid://shopify/ProductVariant/11");
  assert.match(second.responseText, /sem estoque/);
  assert.equal(second.context?.selection.Tamanho, "G");
});
test("one-turn exact variant confirms current price and stock", () => {
  const result = resolveCatalogConversation({ catalog: catalog(), inboundText: "Camisa Real Madrid tamanho G", now });
  assert.equal(result.status, "in_stock"); assert.equal(result.verifiedPrice, true); assert.match(result.responseText, /149,90/);
});
test("search preserves garment, season and audience rather than conflating models", () => {
  assert.equal(catalogSearchPhrase("Tem camisa Flamengo Reserva 26/27 Feminina no M?"), "camisa flamengo reserva 26/27 feminina");
});
test("international size names cannot silently reinterpret G as L", () => {
  const data = catalog();
  data.products[0].variants.forEach((variant) => { if (variant.options[0].value === "G") variant.options[0].value = "L"; });
  const result = resolveCatalogConversation({ catalog: data, inboundText: "G", now });
  assert.equal(result.variantId, null); assert.equal(result.verifiedInventory, false);
});
test("uncertain future timestamps fail closed and negotiation stays outside lookup", () => {
  assert.equal(resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now: now - 1 }).status, "stale");
  assert.equal(isCatalogTurn("quero desconto na camisa", null), false);
});
test("model change cannot inherit another product size", () => {
  const first = resolveCatalogConversation({ catalog: catalog(), inboundText: "Camisa Real Madrid G", now });
  const other = catalog(); other.products[0].id = "gid://shopify/Product/2";
  const result = resolveCatalogConversation({ catalog: other, inboundText: "Camisa Flamengo", previous: first.context, now });
  assert.equal(result.status, "selection_required"); assert.deepEqual(result.context?.selection, {});
});
test("expired, ambiguous and incomplete results cannot authorize promises", () => {
  const stale = resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now: now + 30_001 });
  assert.equal(stale.status, "stale"); assert.equal(stale.verifiedInventory, false);
  const many = catalog(); many.products.push(many.products[0]);
  assert.equal(resolveCatalogConversation({ catalog: many, inboundText: "G", now }).status, "product_selection");
  const incomplete = catalog(); incomplete.products[0].variantsComplete = false;
  assert.equal(resolveCatalogConversation({ catalog: incomplete, inboundText: "G", now }).status, "incomplete");
  const partialPage = catalog(); partialPage.productsComplete = false;
  const partialTurn = resolveCatalogConversation({ catalog: partialPage, inboundText: "Camisa", now });
  assert.equal(partialTurn.context?.pendingProducts?.length, 1);
  assert.equal(partialTurn.verifiedInventory, false);
});
test("backorder and unpublished are not ready stock", () => {
  assert.equal(resolveCatalogConversation({ catalog: catalog(0, "CONTINUE"), inboundText: "G", now }).verifiedInventory, false);
  const unpublished = catalog(); unpublished.products[0].onlineStoreUrl = null;
  assert.equal(resolveCatalogConversation({ catalog: unpublished, inboundText: "G", now }).status, "unpublished");
});

test("default variant without size metadata cannot confirm a requested G", () => {
  const data = catalog();
  data.products[0].variants = [{ ...data.products[0].variants[0], title: "Default Title", options: [{ name: "Title", value: "Default Title" }] }];
  const turn = resolveCatalogConversation({ catalog: data, inboundText: "camisa G", now });
  assert.equal(turn.status, "unknown"); assert.equal(turn.verifiedInventory, false);
});
test("human/payment/private order questions stay in existing specialist flow", () => {
  const context = resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now }).context;
  assert.equal(isCatalogTurn("quero um atendente", context), false);
  assert.equal(isCatalogTurn("meu pedido foi pago?", context), false);
  assert.equal(isCatalogTurn("G", context), true);
  assert.equal(usableCommerceContext(context, now + 86_400_001), null);
});
test("shared lookup, tenant isolation, no preview writes and no inquiry sale", () => {
  const service = readFileSync(new URL("../lib/server/commerce/conversation-catalog.ts", import.meta.url), "utf8");
  assert.match(service, /where\("tenantId", "==", input.tenantId\)/);
  assert.match(service, /lead.data\(\)\?\.tenantId !== input.tenantId/);
  assert.doesNotMatch(service, /totalOrders|lifetimeValue|setLeadPipelineStage|recordInboundLead|kb_docs/);
  const preview = readFileSync(new URL("../app/api/tenant/[tenantId]/ai-preview/route.ts", import.meta.url), "utf8");
  const agent = readFileSync(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");
  assert.match(preview, /lookupConversationCatalog/); assert.doesNotMatch(preview, /saveConversationCatalogInterest/);
  assert.match(agent, /rolloutDecision.reason === "shadow_only"/);
  assert.ok(agent.indexOf('rolloutDecision.reason === "shadow_only"') < agent.lastIndexOf("await saveConversationCatalogInterest"));
  const handoffStart = agent.indexOf('if (choice.decision === "handoff" || plannerDecision.decision === "handoff")');
  const acknowledgement = agent.indexOf("const handoffComposition", handoffStart);
  const executed = agent.indexOf("const executedActions = await executeAltumAgentActions", handoffStart);
  const notified = agent.indexOf("handoffNotifySuccessCount = notifyResults", handoffStart);
  assert.ok(executed > handoffStart && executed < acknowledgement);
  assert.ok(notified > handoffStart && notified < acknowledgement);
  assert.match(agent, /verifiedExecution: handoffNotifySuccessCount > 0/);
  assert.match(agent, /authorizePause: handoffNotifySuccessCount > 0 \|\| handoffTaskRecorded/);
  const handoff = readFileSync(new URL("../lib/server/ai/handoff-delivery.ts", import.meta.url), "utf8");
  const outbound = readFileSync(new URL("../lib/server/chat-outbound.ts", import.meta.url), "utf8");
  assert.match(handoff, /if \(input.authorizePause\)/);
  assert.match(handoff, /queueTenantHandoffAcknowledgement/);
  assert.match(outbound, /beforeCommit: input.atomicHandoffPause && handoffAckAuthorization/);
  assert.match(outbound, /lastUpdateTime: state.updateTime/);
  assert.match(agent, /superseded_after_handoff_execution/);
});

test("ambiguous models keep only references and contain photo requests instead of unrelated offers", () => {
  const many = catalog();
  many.products[0].name = "Camisa Flamengo Titular 26/27";
  many.products.push({ ...many.products[0], id: "gid://shopify/Product/2", name: "Camisa Flamengo Reserva 26/27" });
  const first = resolveCatalogConversation({ catalog: many, inboundText: "Camisa Flamengo G", now });
  const context = usableCommerceContext(first.context, now);
  assert.equal(context?.pendingProducts?.length, 2);
  assert.doesNotMatch(JSON.stringify(context), /quantity|inventory|price|149/);
  assert.equal(isCatalogTurn("Não sei, tem foto dos três modelos para eu ver aqui?", context), true);
  const photo = catalogFollowup("Não sei, tem foto dos três modelos para eu ver aqui?", context).turn;
  assert.equal(photo?.status, "unsupported_media");
  assert.match(photo!.responseText, /Ainda não consigo enviar as fotos/);
  assert.match(photo!.responseText, /Flamengo/);
  assert.doesNotMatch(photo!.responseText, /Vasco/);
  assert.equal(photo?.verifiedInventory, false);
  assert.equal(catalogFollowup("a segunda", context).productId, "gid://shopify/Product/2");
  assert.equal(catalogFollowup("Camisa Flamengo Titular 26/27", context).productId, "gid://shopify/Product/1");
  assert.equal(catalogFollowup("não sei", context).turn?.status, "product_selection");
  assert.deepEqual(catalogFollowup("Camisa Real Madrid 24/25", context), {});
  assert.deepEqual(catalogFollowup("Camisa Real Madrid 24/25", { ...context!, searchQuery: "camisa flamengo", candidatesComplete: false }), {});
  assert.equal(catalogFollowup("quero manga longa", { ...context!, searchQuery: "camisa flamengo", candidatesComplete: false }).query, "camisa flamengo manga longa");
  const differentClub = { ...context!, pendingProducts: [{ id: "gid://shopify/Product/9", name: "Camisa Atlético Mineiro" }], searchQuery: "camisa Atlético Mineiro" };
  assert.equal(catalogFollowup("casa muda do Flamengo", differentClub).turn?.needsInterpretation, true);
  assert.equal(catalogFollowup("quero do PSG", differentClub).turn?.needsInterpretation, true);
  assert.equal(acceptedCatalogInterpretation({ kind: "product_search", confidence: 0.95, query: "camisa PSG", evidence: "PSG" }, "quero do PSG"), "camisa psg");
  assert.equal(usableCommerceContext(context, now + 86_400_001), null);
});

test("store welcome is relational, product menu remains readable through the final composer", () => {
  assert.match(catalogSocialReply("Olá!"), /Tudo bem/);
  assert.match(catalogSocialReply("Tudo bem e você?"), /também/);
  assert.equal(catalogSocialReply("Olá, tem camisa Flamengo?"), null);
  const many = catalog();
  many.products.push({ ...many.products[0], id: "gid://shopify/Product/2", name: "Camisa Flamengo Manga Longa Reserva 26/27" });
  const result = resolveCatalogConversation({ catalog: many, inboundText: "Tem camisa G?", now });
  const greeting = welcomeCatalogTurn(result, false);
  assert.match(greeting.responseText, /^Oi!/);
  assert.doesNotMatch(welcomeCatalogTurn(result, true).responseText, /^Oi!/);
  assert.equal(productDisplayName("Camisa Manga Longa Flamengo Titular 26/27"), "Flamengo Titular 26/27 · Manga longa");
  assert.equal(result.context?.pendingProducts?.[1].name, "Camisa Flamengo Manga Longa Reserva 26/27");
  for (const channel of ["whatsapp", "instagram", "facebook", "site"]) {
    const final = composeAiResponse({ inboundText: "Tem camisa G?", draftText: greeting.responseText, channel, preserveLineBreaks: true });
    assert.match(final.text, /\n1\) /);
    assert.match(final.text, /\n2\) /);
    assert.equal((final.text.match(/\?/g) || []).length, 1);
    assert.doesNotMatch(final.text, /Temos em estoque/);
  }
});

test("missing item/stock offers alternatives without inventing a replacement", () => {
  const none = catalog(); none.products = [];
  const turn = resolveCatalogConversation({ catalog: none, inboundText: "Camisa inexistente", now });
  assert.match(turn.responseText, /outro modelo|opções no site/);
  const context = usableCommerceContext(turn.context, now);
  assert.equal(context?.discovery, true);
  assert.equal(context?.awaitingAlternative, true);
  assert.match(catalogFollowup("quero outro", context).turn!.responseText, /Qual outro time/);
  const sold = resolveCatalogConversation({ catalog: catalog(0), inboundText: "G", now });
  assert.match(sold.responseText, /sem estoque/);
  assert.match(sold.responseText, /outro modelo/);
  assert.equal(sold.context?.awaitingAlternative, true);
  const available = resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now });
  assert.equal(usableCommerceContext(available.context, now)?.awaitingWebsite, true);
});

test("only fresh Shopify primary domain becomes a browsing link, never a checkout claim", () => {
  const data = catalog(); data.storeUrl = "https://loja.example/";
  const turn = resolveStoreWebsite(data, null, now);
  assert.deepEqual(turn.verifiedUrls, ["https://loja.example/"]);
  assert.equal(turn.verifiedInventory, false);
  assert.doesNotMatch(turn.responseText, /carrinho pronto|reservei|finalize sua compra/);
  const final = composeAiResponse({ inboundText: "quero o site", draftText: turn.responseText, verifiedUrls: turn.verifiedUrls, preserveLineBreaks: true });
  assert.match(final.text, /https:\/\/loja\.example\//);
  for (const storeUrl of [null, "http://loja.example", "https://user:password@loja.example", "https://127.0.0.1/"]) {
    assert.equal(resolveStoreWebsite({ ...data, storeUrl }, null, now).status, "website_unavailable");
  }
  assert.equal(resolveStoreWebsite(data, null, now + 30_001).status, "website_unavailable");
});

test("single model media/cart requests cannot trigger legacy offers either", () => {
  const context = resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now }).context;
  for (const text of ["manda foto", "me envia o link", "monta um carrinho"]) {
    assert.equal(isCatalogTurn(text, context), true);
    assert.equal(catalogFollowup(text, context).turn?.status, "unsupported_media");
  }
  assert.equal(isCatalogTurn("me manda as fotos dos três modelos por favor", null), true);
  assert.equal(isCatalogTurn("foto do comprovante de pagamento", context), false);
  const available = resolveCatalogConversation({ catalog: catalog(), inboundText: "G", now });
  assert.equal(catalogFollowup("não obrigado", available.context).turn?.context?.awaitingWebsite, false);
  assert.equal(catalogFollowup("quero outro", available.context).turn?.context?.awaitingWebsite, false);
});
