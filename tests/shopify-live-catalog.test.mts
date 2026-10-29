import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShopifyCatalogSearch, normalizeShopifyLiveCatalog, queryShopifyLiveCatalog, selectLiveCatalogVariant } from "../lib/shopify-live-catalog.ts";

function variant(value: Record<string, unknown> = {}) {
  return { id: "gid://shopify/ProductVariant/10", title: "G / Preto", price: "149.90", sku: "FLA-G-PRETO",
    selectedOptions: [{ name: "Tamanho", value: "G" }, { name: "Cor", value: "Preto" }],
    availableForSale: true, inventoryQuantity: 5, sellableOnlineQuantity: 3, inventoryPolicy: "DENY", ...value };
}

function catalog(variants = [variant()], hasNextPage = false, status = "ACTIVE") {
  return normalizeShopifyLiveCatalog({ shop: { currencyCode: "BRL" }, products: {
    pageInfo: { hasNextPage: false }, nodes: [{ id: "gid://shopify/Product/1", title: "Camisa Flamengo", status,
      onlineStoreUrl: "https://example.com/products/flamengo", variants: { nodes: variants, pageInfo: { hasNextPage } } }],
  } }, "connection-1", "2026-10-13T16:00:00.000Z");
}

test("live source keeps each option, price and quantity instead of first-variant stock", () => {
  const result = catalog([variant(), variant({ id: "gid://shopify/ProductVariant/11", selectedOptions: [{ name: "Tamanho", value: "M" }], sellableOnlineQuantity: 0 })]);
  assert.equal(result.source, "shopify_live");
  assert.equal(result.currency, "BRL");
  assert.equal(result.products[0].variants[0].availability, "in_stock");
  assert.equal(result.products[0].variants[1].availability, "out_of_stock");
  assert.equal(result.products[0].variants[1].sellableOnlineQuantity, 0);
  assert.equal(result.products[0].variants[0].price, "149.90");
});

test("website URL comes from authenticated shop metadata, not product descriptions", () => {
  const result = normalizeShopifyLiveCatalog({ shop: { currencyCode: "BRL", primaryDomain: { url: "https://loja.example" } }, products: { nodes: [], pageInfo: { hasNextPage: false } } }, "conn", new Date().toISOString());
  assert.equal(result.storeUrl, "https://loja.example/");
  const unsafe = normalizeShopifyLiveCatalog({ shop: { primaryDomain: { url: "javascript:alert(1)" } } }, "conn", new Date().toISOString());
  assert.equal(unsafe.storeUrl, null);
});

test("positive aggregate inventory cannot promise online stock", () => {
  assert.equal(catalog([variant({ inventoryQuantity: 50, sellableOnlineQuantity: 0 })]).products[0].variants[0].availability, "out_of_stock");
});

test("CONTINUE can allow backorders but never becomes ready stock", () => {
  assert.equal(catalog([variant({ inventoryPolicy: "CONTINUE", sellableOnlineQuantity: 0 })]).products[0].variants[0].availability, "backorder_possible");
});

test("missing/null quantities remain unknown, not zero or available", () => {
  const value = catalog([variant({ inventoryQuantity: null, sellableOnlineQuantity: undefined })]).products[0].variants[0];
  assert.equal(value.inventoryQuantity, null);
  assert.equal(value.sellableOnlineQuantity, null);
  assert.equal(value.availability, "unknown");
});

test("inactive product and unavailable variant cannot be sold as available", () => {
  assert.equal(catalog([variant()], false, "DRAFT").products[0].variants[0].availability, "out_of_stock");
  assert.equal(catalog([variant({ availableForSale: false })]).products[0].variants[0].availability, "out_of_stock");
});

test("size selection is exact, requires disambiguation and respects incomplete pages", () => {
  const product = catalog([variant(), variant({ id: "gid://shopify/ProductVariant/11", selectedOptions: [{ name: "Tamanho", value: "GG" }, { name: "Cor", value: "Preto" }] })]).products[0];
  assert.equal(selectLiveCatalogVariant(product, { tamanho: "g", cor: "preto" }).variant?.id, "gid://shopify/ProductVariant/10");
  assert.equal(selectLiveCatalogVariant(product, {}).status, "selection_required");
  assert.equal(selectLiveCatalogVariant(product, { Cor: "Preto" }).status, "ambiguous");
  assert.equal(selectLiveCatalogVariant(product, { Tamanho: "P" }).status, "not_found");
  assert.equal(selectLiveCatalogVariant({ ...product, variantsComplete: false }, { Tamanho: "G" }).status, "incomplete");
});

test("search text cannot add GraphQL or Shopify filter operators", () => {
  const search = buildShopifyCatalogSearch('Flamengo" OR status:archived');
  assert.equal(search, 'status:active AND (title:Flamengo* AND title:OR* AND title:status* AND title:archived*)');
  assert.throws(() => buildShopifyCatalogSearch("  !!! "), /query_required/);
});

test("accent alternatives are bounded spelling variants, not unrelated products", () => {
  for (const text of ["camisa Atlético Mineiro", "camisa Atletico Mineiro"]) {
    const query = buildShopifyCatalogSearch(text);
    assert.match(query, /title:atletico\* OR title:Atlético\*/);
    assert.match(query, /title:Mineiro\*/);
    assert.doesNotMatch(query, /Vasco|Madrid/);
  }
  assert.match(buildShopifyCatalogSearch("Flamengo feminino"), /title:feminin\*/);
  assert.match(buildShopifyCatalogSearch("Flamengo masculina"), /title:masculin\*/);
});

test("queries are read-only, bounded and use variables; upstream failures propagate", async () => {
  await queryShopifyLiveCatalog({ connectionId: "a", query: "Flamengo" }, async (query, variables) => {
    assert.match(query, /products\(first: 6, query: \$query\)/);
    assert.match(query, /variants\(first: 50\)/);
    assert.match(query, /selectedOptions/);
    assert.doesNotMatch(query, /mutation|Flamengo/);
    assert.equal(variables.query, 'status:active AND (title:Flamengo*)');
    return { shop: { currencyCode: "BRL" }, products: { nodes: [], pageInfo: { hasNextPage: true } } };
  }).then((result) => assert.equal(result.productsComplete, false));
  await assert.rejects(() => queryShopifyLiveCatalog({ connectionId: "a", productId: "attacker" }, async () => ({})), /product_id_invalid/);
  await assert.rejects(() => queryShopifyLiveCatalog({ connectionId: "a", query: "Flamengo" }, async () => { throw new Error("timeout"); }), /timeout/);
});

test("exact product lookup returns no fabricated product when deleted", async () => {
  const result = await queryShopifyLiveCatalog({ connectionId: "a", productId: "gid://shopify/Product/1" }, async (query, variables) => {
    assert.match(query, /product\(id: \$id\)/);
    assert.equal(variables.id, "gid://shopify/Product/1");
    return { product: null, shop: { currencyCode: "BRL" } };
  });
  assert.deepEqual(result.products, []);
  assert.equal(result.productsComplete, true);
});

test("diagnostic uses existing tenant connection/provider and never writes catalog/CRM", () => {
  const route = readFileSync(new URL("../app/api/tenant/[tenantId]/ecommerce/connections/[connectionId]/catalog/route.ts", import.meta.url), "utf8");
  for (const marker of ["requireRequestUser", "assertTenantAccess", "assertTenantModule", "manage_channels", "data.tenantId !== tenantId", 'data.status !== "active"', "provider.lookupCatalog", '"private, no-store"']) assert.ok(route.includes(marker), marker);
  assert.doesNotMatch(route, /\.set\(|\.add\(|\.update\(/);
});
