// Pure, read-only contract shared by provider, diagnostics and future AI tools.
export type LiveCatalogVariant = {
  id: string;
  title: string;
  sku: string;
  price: string | null;
  options: Array<{ name: string; value: string }>;
  availableForSale: boolean | null;
  inventoryQuantity: number | null;
  sellableOnlineQuantity: number | null;
  inventoryPolicy: "DENY" | "CONTINUE" | null;
  availability: "in_stock" | "out_of_stock" | "backorder_possible" | "unknown";
};

export type LiveCatalogProduct = {
  id: string;
  name: string;
  status: string;
  description: string;
  imageUrl: string | null;
  onlineStoreUrl: string | null;
  variants: LiveCatalogVariant[];
  variantsComplete: boolean;
};

export type LiveCatalogResult = {
  source: "shopify_live";
  connectionId: string;
  checkedAt: string;
  currency: string;
  storeUrl?: string | null;
  products: LiveCatalogProduct[];
  productsComplete: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function quantity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) ? value : null;
}

function https(value: unknown) {
  try {
    const url = new URL(text(value, 1800));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function nodes(value: unknown) {
  const data = record(value);
  return Array.isArray(data.nodes) ? data.nodes.map(record) : [];
}

export function buildShopifyCatalogSearch(value: string) {
  const terms = value.normalize("NFKC").match(/[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*/gu)?.slice(0, 8) || [];
  if (!terms.length) throw new Error("commerce_catalog_query_required");
  // Do not allow user text to inject Shopify search operators or broaden scope.
  // Shopify title equality matches the entire value; prefix search matches title
  // words. Terms contain letters/numbers/-/ only, never search operators.
  const spellings: Record<string, string> = { atletico: "Atlético", gremio: "Grêmio", sao: "São", america: "América", olimpico: "Olímpico" };
  return `status:active AND (${terms.map((term) => {
    const plain = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/^(masculin[oa]|feminin[oa])$/.test(plain)) return `title:${plain.slice(0, -1)}*`;
    const accented = spellings[plain];
    return accented
      ? `(title:${plain}* OR title:${accented}*)` : `title:${term.slice(0, 60)}*`;
  }).join(" AND ")})`;
}

export function normalizeShopifyLiveCatalog(data: unknown, connectionId: string, checkedAt: string): LiveCatalogResult {
  const root = record(data);
  const normalizeProduct = (product: Record<string, unknown>): LiveCatalogProduct => {
    const status = text(product.status, 20);
    return {
      id: text(product.id), name: text(product.title, 300), status,
      description: text(product.description, 1200),
      imageUrl: https(record(product.featuredImage).url),
      onlineStoreUrl: https(product.onlineStoreUrl),
      variantsComplete: record(record(product.variants).pageInfo).hasNextPage === false,
      variants: nodes(product.variants).map((variant): LiveCatalogVariant => {
        const availableForSale = typeof variant.availableForSale === "boolean" ? variant.availableForSale : null;
        const inventoryQuantity = quantity(variant.inventoryQuantity);
        const sellableOnlineQuantity = quantity(variant.sellableOnlineQuantity);
        const inventoryPolicy = variant.inventoryPolicy === "DENY" || variant.inventoryPolicy === "CONTINUE" ? variant.inventoryPolicy : null;
        // "Can buy" is not proof of ready-to-ship stock (CONTINUE, untracked stock,
        // or stock at a location unavailable online). Never sum unrelated variants.
        const availability = status !== "ACTIVE" || availableForSale === false ? "out_of_stock"
          : availableForSale === true && sellableOnlineQuantity !== null && sellableOnlineQuantity > 0 ? "in_stock"
          : availableForSale === true && sellableOnlineQuantity !== null && sellableOnlineQuantity <= 0 && inventoryPolicy === "CONTINUE" ? "backorder_possible"
          : sellableOnlineQuantity !== null && sellableOnlineQuantity <= 0 && inventoryPolicy === "DENY" ? "out_of_stock"
          : "unknown";
        const rawPrice = text(variant.price, 60);
        return {
          id: text(variant.id), title: text(variant.title), sku: text(variant.sku),
          price: /^\d+(?:\.\d+)?$/.test(rawPrice) ? rawPrice : null,
          options: Array.isArray(variant.selectedOptions) ? variant.selectedOptions.map(record).map((option) => ({ name: text(option.name, 80), value: text(option.value, 100) })) : [],
          availableForSale, inventoryQuantity, sellableOnlineQuantity, inventoryPolicy, availability,
        };
      }),
    };
  };
  const products = root.product ? [record(root.product)] : nodes(root.products);
  return {
    source: "shopify_live", connectionId, checkedAt,
    currency: text(record(root.shop).currencyCode, 10),
    storeUrl: https(record(record(root.shop).primaryDomain).url),
    products: products.map(normalizeProduct),
    productsComplete: root.product !== undefined || record(record(root.products).pageInfo).hasNextPage === false,
  };
}

// Match exact option values, not substrings (G must not match GG).
export function selectLiveCatalogVariant(product: LiveCatalogProduct, selection: Record<string, string>) {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
  const choices = Object.entries(selection);
  if (!choices.length) return { status: "selection_required" as const, variant: null };
  const matches = product.variants.filter((variant) => choices.every(([name, value]) =>
    variant.options.some((option) => normalize(option.name) === normalize(name) && normalize(option.value) === normalize(value))));
  if (!product.variantsComplete) return { status: "incomplete" as const, variant: null };
  if (matches.length === 1) return { status: "matched" as const, variant: matches[0] };
  if (matches.length > 1) return { status: "ambiguous" as const, variant: null };
  return { status: "not_found" as const, variant: null };
}

export const SHOPIFY_LIVE_PRODUCT_FIELDS = `
  id title status description onlineStoreUrl featuredImage { url }
  variants(first: 50) {
    pageInfo { hasNextPage }
    nodes { id title sku price selectedOptions { name value }
      availableForSale inventoryQuantity sellableOnlineQuantity inventoryPolicy }
  }`;

export async function queryShopifyLiveCatalog(
  input: { connectionId: string; query?: string; productId?: string },
  request: (query: string, variables: Record<string, unknown>) => Promise<unknown>,
): Promise<LiveCatalogResult> {
  const productId = input.productId?.trim();
  if (productId && !/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) throw new Error("commerce_catalog_product_id_invalid");
  const variables = productId ? { id: productId } : { query: buildShopifyCatalogSearch((input.query || "").slice(0, 300)) };
  const query = productId
    ? `query AltumLiveProduct($id: ID!) { shop { currencyCode primaryDomain { url } } product(id: $id) { ${SHOPIFY_LIVE_PRODUCT_FIELDS} } }`
    : `query AltumLiveCatalog($query: String!) { shop { currencyCode primaryDomain { url } } products(first: 6, query: $query) { pageInfo { hasNextPage } nodes { ${SHOPIFY_LIVE_PRODUCT_FIELDS} } } }`;
  const data = await request(query, variables);
  return normalizeShopifyLiveCatalog(data, input.connectionId, new Date().toISOString());
}
