export const COMMERCE_PROVIDER_IDS = ["shopify", "nuvemshop", "woocommerce", "vtex", "tray", "loja_integrada", "checkout_externo"] as const;

export type CommerceProviderId = (typeof COMMERCE_PROVIDER_IDS)[number];
export type CommerceResource = "products" | "orders" | "carts" | "tracking";
export type CommerceCapability =
  | "catalog_products"
  | "product_variants"
  | "inventory_aggregate"
  | "inventory_by_location"
  | "customers"
  | "orders"
  | "payments"
  | "fulfillments"
  | "tracking"
  | "refunds"
  | "returns"
  | "abandoned_checkouts"
  | "webhooks"
  | "api_sync";
export type CommerceCapabilityLevel = "available" | "partial" | "planned" | "unsupported";
export type CommerceCapabilityMatrix = Readonly<Record<CommerceCapability, CommerceCapabilityLevel>>;

export type CommerceConnectionConfig = {
  id: string;
  tenantId: string;
  provider: CommerceProviderId;
  displayName: string;
  storeUrl: string;
  storeId: string;
};

export type CommerceCredentials = {
  accessToken?: string;
  consumerKey?: string;
  consumerSecret?: string;
};

export type CommerceSyncEvent = {
  topic: string;
  externalEventId: string;
  payload: unknown;
};

export type CommerceSyncResult = {
  events: CommerceSyncEvent[];
  products: number;
  orders: number;
  carts: number;
  cursor?: string | null;
};

export type CommerceConnectionTest = {
  ok: boolean;
  accountLabel?: string;
  detail?: string;
};

export interface CommerceProvider {
  id: CommerceProviderId;
  label: string;
  capabilities: readonly CommerceResource[];
  capabilityMatrix: CommerceCapabilityMatrix;
  credentialFields: readonly (keyof CommerceCredentials)[];
  testConnection(input: { connection: CommerceConnectionConfig; credentials: CommerceCredentials }): Promise<CommerceConnectionTest>;
  sync(input: { connection: CommerceConnectionConfig; credentials: CommerceCredentials; limit: number }): Promise<CommerceSyncResult>;
}

export type NormalizedCommerceProduct = {
  externalProductId: string;
  name: string;
  description: string;
  sku: string;
  category: string;
  tags: string[];
  priceFrom: number | null;
  priceTo: number | null;
  currency: string;
  imageUrl: string;
  status: string;
  inventoryQuantity: number | null;
};

export type NormalizedCommerceOrder = {
  externalOrderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalPrice: number | null;
  currency: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingCode: string;
  trackingUrl: string;
  checkoutUrl: string;
  purchasedProductNames: string[];
  items: Array<{ name: string; quantity: number; sku: string; productId: string; price: number | null }>;
  orderedAt: string | null;
  attribution?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
    landingPage?: string;
    referrer?: string;
  };
};

export type NormalizedCommerceCart = {
  externalCartId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalPrice: number | null;
  currency: string;
  status: "abandoned" | "recovered" | "open";
  checkoutUrl: string;
  productNames: string[];
  lastActivityAt: string | null;
};

export type NormalizedCommerceEvent = {
  topic: string;
  externalEventId: string;
  product?: NormalizedCommerceProduct;
  order?: NormalizedCommerceOrder;
  cart?: NormalizedCommerceCart;
};
