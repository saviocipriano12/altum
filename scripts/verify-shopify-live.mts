// Read-only, explicit LF pilot probe. Never print credentials or customer records.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { connectionConfigFromDoc, readCommerceCredentials } = await import("../lib/server/commerce/registry.ts");
const { shopifyProvider } = await import("../lib/server/commerce/providers/shopify.ts");
const domain = "lf-multimarcas-vitoria-nm0fp51f.myshopify.com";
const snap = await adminDb.collection("ecommerce_connections").where("storeId", "==", domain).get();
const active = snap.docs.filter((doc) => doc.data().provider === "shopify" && doc.data().status === "active");
if (active.length !== 1) throw new Error("Exactly one active LF Shopify connection required");
const doc = active[0];
const data = doc.data();
if (process.argv.includes("--conversation")) {
  process.env.SHOPIFY_LIVE_CATALOG_STORES = domain;
  const { lookupConversationCatalog } = await import("../lib/server/commerce/conversation-catalog.ts");
  let context: unknown = null;
  for (const inboundText of ["Vocês têm a camisa Real Madrid Titular 24/25?", "L", "M"]) {
    const result = await lookupConversationCatalog({ tenantId: data.tenantId, inboundText, context, allowedTools: ["knowledge_read"], preview: true });
    console.log(JSON.stringify({ inboundText, status: result?.status, response: result?.responseText, variantId: result?.variantId }));
    if (!result) throw new Error("Live conversation lookup not activated");
    context = result.context;
  }
  process.exit(0);
}
if (process.argv.includes("--search-debug")) {
  for (const search of ["status:active", "title:Real*", "Real Madrid", 'status:active AND title:"Real"']) {
    const res = await fetch(`https://${domain}/admin/api/2026-07/graphql.json`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": readCommerceCredentials(data.apiCredentials).accessToken || "" },
      body: JSON.stringify({ query: "query($query:String!){products(first:6,query:$query){nodes{id title status}}}", variables: { query: search } }) });
    const body = await res.json();
    console.log(JSON.stringify({ search, status: res.status, products: body.data?.products?.nodes, errors: body.errors?.map((error: {message:string}) => error.message) }));
  }
  process.exit(0);
}
const catalog = await shopifyProvider.lookupCatalog!({ connection: connectionConfigFromDoc(doc.id, data),
  credentials: readCommerceCredentials(data.apiCredentials), query: process.argv[2] || "Real Madrid" });
console.log(JSON.stringify({ tenantId: data.tenantId, connectionId: doc.id, source: catalog.source, checkedAt: catalog.checkedAt,
  complete: catalog.productsComplete, products: catalog.products.map((product) => ({ id: product.id, name: product.name,
    published: Boolean(product.onlineStoreUrl), variantsComplete: product.variantsComplete,
    variants: product.variants.map((variant) => ({ id: variant.id, options: variant.options, availability: variant.availability,
      quantity: variant.sellableOnlineQuantity, price: variant.price })) })) }, null, 2));
