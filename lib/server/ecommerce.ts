import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret, encryptSecret, hasStoredSecret, maskStoredSecret } from "@/app/lib/server/secret-crypto";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { upsertContactProfile } from "@/lib/server/contact-profile";

export const ECOMMERCE_PROVIDERS = ["shopify", "nuvemshop", "woocommerce", "vtex", "tray", "loja_integrada"] as const;

export type EcommerceProvider = (typeof ECOMMERCE_PROVIDERS)[number];
export type EcommerceConnectionStatus = "draft" | "active" | "paused" | "error";
export type EcommerceSyncMode = "webhook" | "api" | "manual";
export type EcommerceActionType = "purchase_confirmation" | "tracking_available" | "abandoned_cart_recovery" | "post_purchase_upsell";

export type EcommerceAutomationTemplate = {
  enabled: boolean;
  templateName: string;
  languageCode: string;
  params: string[];
};

export type EcommerceAutomationSettings = {
  autoSendEnabled: boolean;
  purchaseConfirmation: EcommerceAutomationTemplate;
  trackingAvailable: EcommerceAutomationTemplate;
  abandonedCartRecovery: EcommerceAutomationTemplate;
  postPurchaseUpsell: EcommerceAutomationTemplate;
};

export type EcommerceConnectionInput = {
  provider?: unknown;
  displayName?: unknown;
  storeUrl?: unknown;
  storeId?: unknown;
  status?: unknown;
  syncMode?: unknown;
  notes?: unknown;
};

type NormalizedProduct = {
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

type NormalizedOrder = {
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
};

type NormalizedCart = {
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

type NormalizedWebhookEvent = {
  topic: string;
  externalEventId: string;
  product?: NormalizedProduct;
  order?: NormalizedOrder;
  cart?: NormalizedCart;
};

const DEFAULT_AUTOMATION_SETTINGS: EcommerceAutomationSettings = {
  autoSendEnabled: false,
  purchaseConfirmation: {
    enabled: true,
    templateName: "compra_confirmada_altum",
    languageCode: "pt_BR",
    params: ["{{nome}}", "{{pedido}}"],
  },
  trackingAvailable: {
    enabled: true,
    templateName: "rastreio_disponivel_altum",
    languageCode: "pt_BR",
    params: ["{{nome}}", "{{pedido}}", "{{rastreio}}"],
  },
  abandonedCartRecovery: {
    enabled: true,
    templateName: "recuperar_carrinho_altum",
    languageCode: "pt_BR",
    params: ["{{nome}}", "{{produtos}}", "{{checkout_url}}"],
  },
  postPurchaseUpsell: {
    enabled: false,
    templateName: "pos_compra_altum",
    languageCode: "pt_BR",
    params: ["{{nome}}", "{{produtos}}"],
  },
};

const PROVIDER_LABELS: Record<EcommerceProvider, string> = {
  shopify: "Shopify",
  nuvemshop: "Nuvemshop",
  woocommerce: "WooCommerce",
  vtex: "VTEX",
  tray: "Tray",
  loja_integrada: "Loja Integrada",
};

function clean(value: unknown, max = 300) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanTemplateName(value: unknown, fallback: string) {
  return clean(value, 120).replace(/\s+/g, "_").toLowerCase() || fallback;
}

function parseParamList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n|;|\|/g)
      : fallback;
  return source.map((item) => clean(item, 160)).filter(Boolean).slice(0, 20);
}

function templateFromRaw(value: unknown, fallback: EcommerceAutomationTemplate): EcommerceAutomationTemplate {
  const raw = safeRecord(value);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    templateName: cleanTemplateName(raw.templateName, fallback.templateName),
    languageCode: clean(raw.languageCode, 24) || fallback.languageCode,
    params: parseParamList(raw.params, fallback.params),
  };
}

function normalize(value: unknown, max = 300) {
  return clean(value, max)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nestedOrSelf(value: unknown, fallback: Record<string, unknown>) {
  const nested = safeRecord(value);
  return Object.keys(nested).length ? nested : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstRecord(value: unknown) {
  return safeRecord(list(value)[0]);
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function intValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function dateIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function headerValue(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = clean(headers.get(name), 500);
    if (value) return value;
  }
  return "";
}

function hashId(parts: Array<unknown>) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => clean(part, 500)).join("|"))
    .digest("hex")
    .slice(0, 32);
}

function actionDocId(input: { tenantId: string; connectionId: string; type: string; externalId: string }) {
  return hashId([input.tenantId, input.connectionId, input.type, input.externalId]);
}

function storeSecret(value: string) {
  try {
    return encryptSecret(value);
  } catch {
    return value;
  }
}

function readSecret(value: unknown) {
  try {
    return decryptSecret(value);
  } catch {
    return "";
  }
}

function normalizeStoreUrl(value: unknown) {
  const raw = clean(value, 400);
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`.replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function normalizeStatus(value: unknown): EcommerceConnectionStatus {
  const normalized = normalize(value, 40);
  if (normalized === "active" || normalized === "paused" || normalized === "error") return normalized;
  return "draft";
}

function normalizeSyncMode(value: unknown): EcommerceSyncMode {
  const normalized = normalize(value, 40);
  if (normalized === "api" || normalized === "manual") return normalized;
  return "webhook";
}

function topicHas(topic: string, words: string[]) {
  const normalized = normalize(topic, 200);
  return words.some((word) => normalized.includes(word));
}

function tagsFrom(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 60)).filter(Boolean).slice(0, 20);
  return clean(value, 500)
    .split(/,|;/g)
    .map((item) => clean(item, 60))
    .filter(Boolean)
    .slice(0, 20);
}

function priceRangeFromVariants(variants: unknown[]) {
  const prices = variants
    .map((item) => numberValue(safeRecord(item).price || safeRecord(item).sale_price || safeRecord(item).regular_price))
    .filter((item): item is number => typeof item === "number");
  if (!prices.length) return { priceFrom: null, priceTo: null };
  return { priceFrom: Math.min(...prices), priceTo: Math.max(...prices) };
}

function normalizeProduct(payload: Record<string, unknown>): NormalizedProduct | null {
  const product = nestedOrSelf(payload.product, payload);
  const variants = list(product.variants || product.skus || product.variations);
  const firstVariant = firstRecord(product.variants || product.skus || product.variations);
  const firstImage = firstRecord(product.images || product.pictures);
  const category = safeRecord(product.category);
  const externalProductId =
    clean(product.id || product.product_id || product.productId || product.admin_graphql_api_id, 180) ||
    clean(firstVariant.product_id || firstVariant.productId, 180);
  const name = clean(product.title || product.name || product.productName, 180);
  if (!externalProductId && !name) return null;

  const range = priceRangeFromVariants(variants);
  const directPrice = numberValue(product.price || product.sale_price || product.regular_price || firstVariant.price);
  return {
    externalProductId: externalProductId || hashId([name, product.sku, product.slug]),
    name: name || `Produto ${externalProductId}`,
    description: clean(product.body_html || product.description || product.short_description, 1200),
    sku: clean(product.sku || firstVariant.sku || firstVariant.barcode, 120),
    category: clean(product.product_type || product.categoryName || category.name || product.vendor, 120),
    tags: tagsFrom(product.tags),
    priceFrom: range.priceFrom ?? directPrice,
    priceTo: range.priceTo ?? directPrice,
    currency: clean(product.currency || firstVariant.currency, 20) || "BRL",
    imageUrl: clean(product.image || safeRecord(product.image).src || firstImage.src || firstImage.url, 800),
    status: clean(product.status || product.published_scope || product.state, 60) || "active",
    inventoryQuantity: intValue(product.inventory_quantity || firstVariant.inventory_quantity || firstVariant.stock),
  };
}

function normalizeOrderItems(value: unknown) {
  return list(value).map((item) => {
    const row = safeRecord(item);
    return {
      name: clean(row.name || row.title || row.product_name, 180),
      quantity: intValue(row.quantity || row.qty) || 1,
      sku: clean(row.sku || row.variant_sku, 120),
      productId: clean(row.product_id || row.productId || row.id, 180),
      price: numberValue(row.price || row.unit_price || row.total),
    };
  }).filter((item) => item.name || item.productId);
}

function normalizeOrder(payload: Record<string, unknown>): NormalizedOrder | null {
  const order = nestedOrSelf(payload.order, payload);
  const customer = safeRecord(order.customer || order.client || order.billing);
  const shipping = safeRecord(order.shipping || order.shipping_address);
  const firstFulfillment = firstRecord(order.fulfillments || order.shipments || order.shipping_lines);
  const items = normalizeOrderItems(order.line_items || order.items || order.products);
  const externalOrderId = clean(order.id || order.order_id || order.orderId || order.number, 180);
  if (!externalOrderId && !items.length) return null;

  return {
    externalOrderId: externalOrderId || hashId([order.number, customer.email, order.total_price]),
    orderNumber: clean(order.name || order.number || order.order_number || order.code, 120),
    customerName: clean(customer.name || `${clean(customer.first_name, 80)} ${clean(customer.last_name, 80)}`.trim(), 180),
    customerEmail: clean(customer.email || order.email || shipping.email, 180),
    customerPhone: clean(customer.phone || customer.phone_number || order.phone || shipping.phone, 80),
    totalPrice: numberValue(order.total_price || order.total || order.value || order.amount),
    currency: clean(order.currency || order.currency_code, 20) || "BRL",
    status: clean(order.status || order.order_status || order.state, 80) || "created",
    paymentStatus: clean(order.financial_status || order.payment_status || order.paymentStatus, 80),
    fulfillmentStatus: clean(order.fulfillment_status || order.shipping_status || order.fulfillmentStatus, 80),
    trackingCode: clean(order.tracking_number || order.trackingCode || firstFulfillment.tracking_number || firstFulfillment.code, 180),
    trackingUrl: clean(order.tracking_url || firstFulfillment.tracking_url || firstFulfillment.url, 800),
    checkoutUrl: clean(order.checkout_url || order.order_status_url || order.url, 800),
    purchasedProductNames: items.map((item) => item.name).filter(Boolean).slice(0, 20),
    items,
    orderedAt: dateIso(order.created_at || order.createdAt || order.date_created),
  };
}

function normalizeCart(payload: Record<string, unknown>, topic: string): NormalizedCart | null {
  const cart = nestedOrSelf(payload.cart || payload.checkout || payload.abandoned_checkout, payload);
  const customer = safeRecord(cart.customer || cart.client || cart.billing);
  const items = normalizeOrderItems(cart.line_items || cart.items || cart.products);
  const externalCartId = clean(cart.id || cart.cart_id || cart.checkout_id || cart.token, 180);
  if (!externalCartId && !items.length) return null;
  const recovered = topicHas(topic, ["recovered", "recover", "recuperado"]);
  return {
    externalCartId: externalCartId || hashId([customer.email, cart.total_price, cart.updated_at]),
    customerName: clean(customer.name || `${clean(customer.first_name, 80)} ${clean(customer.last_name, 80)}`.trim(), 180),
    customerEmail: clean(customer.email || cart.email, 180),
    customerPhone: clean(customer.phone || cart.phone, 80),
    totalPrice: numberValue(cart.total_price || cart.total || cart.value || cart.amount),
    currency: clean(cart.currency || cart.currency_code, 20) || "BRL",
    status: recovered ? "recovered" : topicHas(topic, ["abandoned", "abandono", "carrinho"]) ? "abandoned" : "open",
    checkoutUrl: clean(cart.checkout_url || cart.recovery_url || cart.url, 800),
    productNames: items.map((item) => item.name).filter(Boolean).slice(0, 20),
    lastActivityAt: dateIso(cart.updated_at || cart.updatedAt || cart.created_at),
  };
}

async function createLeadTask(input: {
  tenantId: string;
  leadId: string;
  key: string;
  title: string;
  priority: "low" | "medium" | "high";
  dueInMinutes: number;
  source: string;
  metadata?: Record<string, unknown>;
}) {
  const taskRef = adminDb.collection("lead_tasks").doc(hashId([input.tenantId, input.leadId, input.key]));
  const snap = await taskRef.get();
  if (snap.exists) return taskRef.id;

  await taskRef.set({
    tenantId: input.tenantId,
    leadId: input.leadId,
    title: input.title,
    type: "ecommerce",
    priority: input.priority,
    dueAt: new Date(Date.now() + input.dueInMinutes * 60_000),
    status: "pending",
    source: input.source,
    taskKey: input.key,
    metadata: input.metadata || {},
    createdBy: "ecommerce_webhook",
    createdByName: "Ecommerce",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return taskRef.id;
}

async function createCommercialAction(input: {
  tenantId: string;
  connectionId: string;
  provider: EcommerceProvider;
  type: "purchase_confirmation" | "tracking_available" | "abandoned_cart_recovery" | "post_purchase_upsell";
  leadId: string;
  externalId: string;
  title: string;
  detail: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productNames: string[];
  amount: number | null;
  metadata?: Record<string, unknown>;
}) {
  const ref = adminDb.collection("ecommerce_commercial_actions").doc(
    actionDocId({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      type: input.type,
      externalId: input.externalId,
    })
  );
  const snap = await ref.get();
  await ref.set(
    {
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      type: input.type,
      status: snap.exists ? clean(snap.data()?.status, 40) || "pending" : "pending",
      leadId: input.leadId,
      externalId: input.externalId,
      title: input.title,
      detail: input.detail,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      productNames: input.productNames,
      amount: input.amount,
      metadata: input.metadata || {},
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: snap.exists ? snap.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return ref.id;
}

async function syncOrderToCommercial(input: {
  tenantId: string;
  connectionId: string;
  provider: EcommerceProvider;
  order: NormalizedOrder;
}) {
  const order = input.order;
  const productText = order.purchasedProductNames.length ? order.purchasedProductNames.join(", ") : "produtos do pedido";
  const lead = await recordInboundLead({
    tenantId: input.tenantId,
    sourceType: "ecommerce_order",
    sourceId: `${input.connectionId}:${order.externalOrderId}`,
    sourceLabel: `${providerLabel(input.provider)} - pedido`,
    channel: "ecommerce",
    nome: order.customerName || "Cliente ecommerce",
    email: order.customerEmail,
    telefone: order.customerPhone,
    mensagem: `Pedido ${order.orderNumber || order.externalOrderId} recebido. Itens: ${productText}.`,
    tags: ["ecommerce", input.provider, "pedido_realizado", order.trackingCode ? "rastreio_disponivel" : ""],
    customFields: {
      ecommerce_provider: input.provider,
      ecommerce_connection_id: input.connectionId,
      ecommerce_order_id: order.externalOrderId,
      ecommerce_order_number: order.orderNumber,
      ecommerce_order_status: order.status,
      ecommerce_payment_status: order.paymentStatus,
      ecommerce_fulfillment_status: order.fulfillmentStatus,
      ecommerce_tracking_code: order.trackingCode,
      ecommerce_total: order.totalPrice ?? "",
      ecommerce_products: productText,
    },
    attribution: {
      source: input.provider,
      medium: "ecommerce",
      campaign: "order",
      content: productText,
      sourceLabel: `${providerLabel(input.provider)} - pedido`,
      channel: "ecommerce",
      sourceType: "ecommerce_order",
    },
    automationActorId: "ecommerce_webhook",
    automationActorName: "Ecommerce",
  });

  await Promise.all([
    upsertContactProfile({
      tenantId: input.tenantId,
      phone: order.customerPhone,
      email: order.customerEmail,
      leadId: lead.leadId,
      channel: "ecommerce",
      name: order.customerName,
    }),
    adminDb.collection("leads").doc(lead.leadId).set(
      {
        priority: order.trackingCode ? "medium" : "high",
        pipelineStage: "ganho",
        stage: "ganho",
        commercialState: {
          lastEcommerceOrderId: order.externalOrderId,
          lastEcommerceOrderNumber: order.orderNumber,
          lastEcommerceProvider: input.provider,
          lastEcommerceAmount: order.totalPrice,
          lastEcommerceProducts: order.purchasedProductNames,
          lastEcommerceTrackingCode: order.trackingCode,
          updatedAt: new Date().toISOString(),
        },
        tags: FieldValue.arrayUnion("ecommerce", "cliente", input.provider),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("leads").doc(lead.leadId).collection("events").add({
      type: "ecommerce_order",
      title: "Pedido recebido",
      detail: `Pedido ${order.orderNumber || order.externalOrderId} em ${providerLabel(input.provider)}. Itens: ${productText}.`,
      metadata: {
        connectionId: input.connectionId,
        provider: input.provider,
        orderId: order.externalOrderId,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        trackingCode: order.trackingCode,
      },
      createdAt: FieldValue.serverTimestamp(),
    }),
    createCommercialAction({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      type: "purchase_confirmation",
      leadId: lead.leadId,
      externalId: order.externalOrderId,
      title: "Confirmar compra realizada",
      detail: `Confirmar pedido ${order.orderNumber || order.externalOrderId} e orientar o cliente sobre proximos passos.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      productNames: order.purchasedProductNames,
      amount: order.totalPrice,
      metadata: { orderNumber: order.orderNumber, checkoutUrl: order.checkoutUrl },
    }),
    createLeadTask({
      tenantId: input.tenantId,
      leadId: lead.leadId,
      key: `ecommerce_order:${order.externalOrderId}:confirm`,
      title: `Confirmar compra ${order.orderNumber || order.externalOrderId}`,
      priority: "medium",
      dueInMinutes: 120,
      source: "ecommerce_order",
      metadata: { provider: input.provider, orderId: order.externalOrderId },
    }),
  ]);

  if (order.trackingCode || order.trackingUrl) {
    await Promise.all([
      createCommercialAction({
        tenantId: input.tenantId,
        connectionId: input.connectionId,
        provider: input.provider,
        type: "tracking_available",
        leadId: lead.leadId,
        externalId: order.externalOrderId,
        title: "Enviar codigo de rastreio",
        detail: `Rastreio disponivel para o pedido ${order.orderNumber || order.externalOrderId}: ${order.trackingCode || order.trackingUrl}.`,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        productNames: order.purchasedProductNames,
        amount: order.totalPrice,
        metadata: { trackingCode: order.trackingCode, trackingUrl: order.trackingUrl },
      }),
      createLeadTask({
        tenantId: input.tenantId,
        leadId: lead.leadId,
        key: `ecommerce_order:${order.externalOrderId}:tracking`,
        title: `Enviar rastreio do pedido ${order.orderNumber || order.externalOrderId}`,
        priority: "high",
        dueInMinutes: 30,
        source: "ecommerce_tracking",
        metadata: { provider: input.provider, orderId: order.externalOrderId, trackingCode: order.trackingCode },
      }),
    ]);
  } else {
    await createLeadTask({
      tenantId: input.tenantId,
      leadId: lead.leadId,
      key: `ecommerce_order:${order.externalOrderId}:waiting_tracking`,
      title: `Acompanhar rastreio do pedido ${order.orderNumber || order.externalOrderId}`,
      priority: "medium",
      dueInMinutes: 1440,
      source: "ecommerce_tracking_pending",
      metadata: { provider: input.provider, orderId: order.externalOrderId },
    });
  }

  if (order.purchasedProductNames.length) {
    await createCommercialAction({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      type: "post_purchase_upsell",
      leadId: lead.leadId,
      externalId: order.externalOrderId,
      title: "Sugerir recompra ou complemento",
      detail: `Cliente comprou ${productText}. A Altum pode sugerir complemento quando houver oferta relacionada.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      productNames: order.purchasedProductNames,
      amount: order.totalPrice,
      metadata: { orderNumber: order.orderNumber },
    });
  }

  return lead.leadId;
}

async function syncCartToCommercial(input: {
  tenantId: string;
  connectionId: string;
  provider: EcommerceProvider;
  cart: NormalizedCart;
}) {
  if (input.cart.status !== "abandoned") return null;
  const cart = input.cart;
  const productText = cart.productNames.length ? cart.productNames.join(", ") : "produtos no carrinho";
  const lead = await recordInboundLead({
    tenantId: input.tenantId,
    sourceType: "ecommerce_abandoned_cart",
    sourceId: `${input.connectionId}:${cart.externalCartId}`,
    sourceLabel: `${providerLabel(input.provider)} - carrinho abandonado`,
    channel: "ecommerce",
    nome: cart.customerName || "Cliente ecommerce",
    email: cart.customerEmail,
    telefone: cart.customerPhone,
    mensagem: `Carrinho abandonado com ${productText}.`,
    tags: ["ecommerce", input.provider, "carrinho_abandonado"],
    customFields: {
      ecommerce_provider: input.provider,
      ecommerce_connection_id: input.connectionId,
      ecommerce_cart_id: cart.externalCartId,
      ecommerce_cart_total: cart.totalPrice ?? "",
      ecommerce_checkout_url: cart.checkoutUrl,
      ecommerce_products: productText,
    },
    attribution: {
      source: input.provider,
      medium: "ecommerce",
      campaign: "abandoned_cart",
      content: productText,
      sourceLabel: `${providerLabel(input.provider)} - carrinho abandonado`,
      channel: "ecommerce",
      sourceType: "ecommerce_abandoned_cart",
    },
    automationActorId: "ecommerce_webhook",
    automationActorName: "Ecommerce",
  });

  await Promise.all([
    upsertContactProfile({
      tenantId: input.tenantId,
      phone: cart.customerPhone,
      email: cart.customerEmail,
      leadId: lead.leadId,
      channel: "ecommerce",
      name: cart.customerName,
    }),
    adminDb.collection("leads").doc(lead.leadId).set(
      {
        priority: "high",
        tags: FieldValue.arrayUnion("ecommerce", "carrinho_abandonado", input.provider),
        commercialState: {
          lastAbandonedCartId: cart.externalCartId,
          lastAbandonedCartProvider: input.provider,
          lastAbandonedCartAmount: cart.totalPrice,
          lastAbandonedCartProducts: cart.productNames,
          checkoutUrl: cart.checkoutUrl,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("leads").doc(lead.leadId).collection("events").add({
      type: "ecommerce_abandoned_cart",
      title: "Carrinho abandonado",
      detail: `Carrinho em ${providerLabel(input.provider)} com ${productText}.`,
      metadata: {
        connectionId: input.connectionId,
        provider: input.provider,
        cartId: cart.externalCartId,
        totalPrice: cart.totalPrice,
        checkoutUrl: cart.checkoutUrl,
      },
      createdAt: FieldValue.serverTimestamp(),
    }),
    createCommercialAction({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      type: "abandoned_cart_recovery",
      leadId: lead.leadId,
      externalId: cart.externalCartId,
      title: "Recuperar carrinho abandonado",
      detail: `Cliente deixou ${productText} no carrinho. Abordar com ajuda, urgencia real ou incentivo aprovado.`,
      customerName: cart.customerName,
      customerPhone: cart.customerPhone,
      customerEmail: cart.customerEmail,
      productNames: cart.productNames,
      amount: cart.totalPrice,
      metadata: { checkoutUrl: cart.checkoutUrl },
    }),
    createLeadTask({
      tenantId: input.tenantId,
      leadId: lead.leadId,
      key: `ecommerce_cart:${cart.externalCartId}:recover`,
      title: "Recuperar carrinho abandonado",
      priority: "high",
      dueInMinutes: 60,
      source: "ecommerce_abandoned_cart",
      metadata: { provider: input.provider, cartId: cart.externalCartId, checkoutUrl: cart.checkoutUrl },
    }),
  ]);

  return lead.leadId;
}

export function providerLabel(provider: unknown) {
  const normalized = normalizeEcommerceProvider(provider);
  return normalized ? PROVIDER_LABELS[normalized] : "E-commerce";
}

export function normalizeEcommerceActionType(value: unknown): EcommerceActionType | "" {
  const normalized = normalize(value, 80);
  if (
    normalized === "purchase_confirmation" ||
    normalized === "tracking_available" ||
    normalized === "abandoned_cart_recovery" ||
    normalized === "post_purchase_upsell"
  ) {
    return normalized;
  }
  return "";
}

export function normalizeEcommerceAutomationSettings(value: unknown): EcommerceAutomationSettings {
  const raw = safeRecord(value);
  return {
    autoSendEnabled: raw.autoSendEnabled === true,
    purchaseConfirmation: templateFromRaw(raw.purchaseConfirmation, DEFAULT_AUTOMATION_SETTINGS.purchaseConfirmation),
    trackingAvailable: templateFromRaw(raw.trackingAvailable, DEFAULT_AUTOMATION_SETTINGS.trackingAvailable),
    abandonedCartRecovery: templateFromRaw(raw.abandonedCartRecovery, DEFAULT_AUTOMATION_SETTINGS.abandonedCartRecovery),
    postPurchaseUpsell: templateFromRaw(raw.postPurchaseUpsell, DEFAULT_AUTOMATION_SETTINGS.postPurchaseUpsell),
  };
}

export function automationTemplateForAction(settings: EcommerceAutomationSettings, actionType: EcommerceActionType) {
  if (actionType === "purchase_confirmation") return settings.purchaseConfirmation;
  if (actionType === "tracking_available") return settings.trackingAvailable;
  if (actionType === "abandoned_cart_recovery") return settings.abandonedCartRecovery;
  return settings.postPurchaseUpsell;
}

export function interpolateEcommerceTemplateParams(params: string[], action: Record<string, unknown>) {
  const metadata = safeRecord(action.metadata);
  const productNames = Array.isArray(action.productNames)
    ? action.productNames.map((item) => clean(item, 120)).filter(Boolean).join(", ")
    : "";
  const firstName = clean(action.customerName, 160).split(/\s+/).filter(Boolean)[0] || "";
  const replacements: Record<string, string> = {
    nome: firstName,
    cliente: clean(action.customerName, 160),
    telefone: clean(action.customerPhone, 80),
    email: clean(action.customerEmail, 180),
    produtos: productNames,
    valor: typeof action.amount === "number" ? action.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    pedido: clean(metadata.orderNumber || action.externalId, 120),
    rastreio: clean(metadata.trackingCode, 180),
    tracking_code: clean(metadata.trackingCode, 180),
    tracking_url: clean(metadata.trackingUrl, 800),
    checkout_url: clean(metadata.checkoutUrl, 800),
  };

  return params
    .map((item) =>
      clean(item, 200).replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key: string) => replacements[key.toLowerCase()] || "")
    )
    .map((item) => clean(item, 200))
    .filter(Boolean)
    .slice(0, 20);
}

export function normalizeEcommerceProvider(value: unknown): EcommerceProvider | "" {
  const normalized = normalize(value, 80).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (normalized === "linkedstore" || normalized === "tiendanube") return "nuvemshop";
  if (normalized === "loja_integrada" || normalized === "lojaintegrada") return "loja_integrada";
  return (ECOMMERCE_PROVIDERS as readonly string[]).includes(normalized) ? (normalized as EcommerceProvider) : "";
}

export function buildEcommerceWebhookSecret() {
  return crypto.randomBytes(24).toString("base64url");
}

export function publicConnectionFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  const provider = normalizeEcommerceProvider(data.provider);
  return {
    id: doc.id,
    tenantId: clean(data.tenantId, 180),
    provider,
    providerLabel: provider ? PROVIDER_LABELS[provider] : providerLabel(data.provider),
    displayName: clean(data.displayName, 160) || providerLabel(data.provider),
    storeUrl: clean(data.storeUrl, 400),
    storeId: clean(data.storeId, 180),
    status: normalizeStatus(data.status),
    connectionStatus: clean(data.connectionStatus, 80) || "draft",
    syncMode: normalizeSyncMode(data.syncMode),
    notes: clean(data.notes, 500),
    hasWebhookSecret: hasStoredSecret(data.webhookSecret),
    webhookSecretMasked: maskStoredSecret(data.webhookSecret),
    lastEventAt: dateIso(data.lastEventAt),
    lastSyncAt: dateIso(data.lastSyncAt),
    lastError: clean(data.lastError, 500),
    productCount: Number(data.productCount || 0),
    orderCount: Number(data.orderCount || 0),
    cartCount: Number(data.cartCount || 0),
    updatedAt: dateIso(data.updatedAt),
    createdAt: dateIso(data.createdAt),
  };
}

export function buildConnectionPayload(input: EcommerceConnectionInput & { tenantId: string; userId: string; userName?: string; webhookSecret?: string }) {
  const provider = normalizeEcommerceProvider(input.provider);
  if (!provider) throw new Error("ecommerce_provider_invalid");
  const displayName = clean(input.displayName, 160) || providerLabel(provider);
  const status = normalizeStatus(input.status);
  const payload: Record<string, unknown> = {
    tenantId: clean(input.tenantId, 180),
    provider,
    displayName,
    storeUrl: normalizeStoreUrl(input.storeUrl),
    storeId: clean(input.storeId, 180),
    status,
    connectionStatus: status === "active" ? "webhook_ready" : "draft",
    syncMode: normalizeSyncMode(input.syncMode),
    notes: clean(input.notes, 500),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.userId,
    updatedByName: clean(input.userName, 120),
  };
  if (input.webhookSecret) payload.webhookSecret = storeSecret(input.webhookSecret);
  return payload;
}

export function normalizeWebhookEvent(provider: EcommerceProvider, payload: unknown, headers: Headers): NormalizedWebhookEvent {
  const body = safeRecord(payload);
  const headerTopic = headerValue(headers, [
    "x-altum-event",
    "x-shopify-topic",
    "x-wc-webhook-topic",
    "x-linkedstore-event",
    "x-nuvemshop-event",
    "x-vtex-event",
    "x-tray-event",
  ]);
  const topic =
    clean(headerTopic, 180) ||
    clean(body.topic || body.event || body.event_type || body.type || body.action, 180) ||
    `${provider}.event`;
  const externalEventId =
    headerValue(headers, ["x-altum-event-id", "x-shopify-webhook-id", "x-wc-webhook-id", "x-request-id"]) ||
    clean(body.event_id || body.webhook_id || body.id, 180) ||
    hashId([provider, topic, JSON.stringify(body).slice(0, 1200)]);

  const product = topicHas(topic, ["product", "produto", "catalog"]) ? normalizeProduct(body) : null;
  const order = topicHas(topic, ["order", "pedido", "paid", "fulfill", "shipment", "tracking"]) ? normalizeOrder(body) : null;
  const cart = topicHas(topic, ["cart", "checkout", "abandoned", "carrinho"]) ? normalizeCart(body, topic) : null;

  return {
    topic,
    externalEventId,
    ...(product ? { product } : {}),
    ...(order ? { order } : {}),
    ...(cart ? { cart } : {}),
  };
}

export async function verifyEcommerceWebhookSecret(connection: Record<string, unknown>, req: Request) {
  const configured = clean(process.env.ECOMMERCE_WEBHOOK_TOKEN, 500) || clean(readSecret(connection.webhookSecret), 500);
  if (!configured) return true;
  const headers = req.headers;
  const incoming =
    headerValue(headers, ["x-altum-webhook-token", "x-webhook-token", "x-ecommerce-token"]) ||
    clean(headers.get("authorization"), 600).replace(/^Bearer\s+/i, "") ||
    clean(new URL(req.url).searchParams.get("token"), 500);
  if (!incoming || incoming.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(configured));
}

async function mirrorProductToKnowledge(input: {
  tenantId: string;
  connectionId: string;
  provider: EcommerceProvider;
  product: NormalizedProduct;
}) {
  const sourceKey = `ecommerce:${input.connectionId}:${input.product.externalProductId}`;
  const existing = await adminDb
    .collection("kb_docs")
    .where("tenantId", "==", input.tenantId)
    .where("sourceKey", "==", sourceKey)
    .limit(1)
    .get();
  const ref = existing.empty ? adminDb.collection("kb_docs").doc() : existing.docs[0].ref;
  const priceText =
    input.product.priceFrom !== null
      ? input.product.priceTo !== null && input.product.priceTo !== input.product.priceFrom
        ? `Faixa de preco: ${input.product.priceFrom} a ${input.product.priceTo} ${input.product.currency}.`
        : `Preco: ${input.product.priceFrom} ${input.product.currency}.`
      : "";
  await ref.set(
    {
      tenantId: input.tenantId,
      type: "catalog",
      sourceKey,
      source: "ecommerce",
      sourceProvider: input.provider,
      sourceConnectionId: input.connectionId,
      content: [input.product.name, input.product.description, priceText].filter(Boolean).join("\n\n").slice(0, 1600),
      tags: Array.from(new Set(["ecommerce", providerLabel(input.provider), ...input.product.tags])).slice(0, 20),
      productName: input.product.name,
      productCategory: input.product.category,
      priceFrom: input.product.priceFrom,
      priceTo: input.product.priceTo,
      availability: normalize(input.product.status).includes("active") ? "active" : "paused",
      mediaUrl: input.product.imageUrl || null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function processEcommerceWebhook(input: {
  tenantId: string;
  connectionId: string;
  provider: EcommerceProvider;
  payload: unknown;
  req: Request;
}) {
  const connectionRef = adminDb.collection("ecommerce_connections").doc(input.connectionId);
  const connectionSnap = await connectionRef.get();
  if (!connectionSnap.exists) throw new Error("ecommerce_connection_not_found");
  const connection = connectionSnap.data() as Record<string, unknown>;
  if (clean(connection.tenantId, 180) !== input.tenantId) throw new Error("ecommerce_connection_tenant_mismatch");
  if (normalizeEcommerceProvider(connection.provider) !== input.provider) throw new Error("ecommerce_connection_provider_mismatch");
  const allowed = await verifyEcommerceWebhookSecret(connection, input.req);
  if (!allowed) throw new Error("ecommerce_webhook_unauthorized");

  const normalized = normalizeWebhookEvent(input.provider, input.payload, input.req.headers);
  const eventRef = adminDb.collection("ecommerce_events").doc(hashId([input.tenantId, input.connectionId, normalized.externalEventId]));
  const eventAlreadyExists = (await eventRef.get()).exists;
  await eventRef.set(
    {
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      topic: normalized.topic,
      externalEventId: normalized.externalEventId,
      payload: input.payload,
      normalized: {
        product: normalized.product || null,
        order: normalized.order || null,
        cart: normalized.cart || null,
      },
      receivedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const connectionUpdates: Record<string, unknown> = {
    lastEventAt: FieldValue.serverTimestamp(),
    lastError: "",
    connectionStatus: "receiving_events",
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (normalized.product) {
    const productRef = adminDb.collection("ecommerce_products").doc(hashId([input.tenantId, input.connectionId, normalized.product.externalProductId]));
    await productRef.set(
      {
        tenantId: input.tenantId,
        connectionId: input.connectionId,
        provider: input.provider,
        ...normalized.product,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await mirrorProductToKnowledge({ tenantId: input.tenantId, connectionId: input.connectionId, provider: input.provider, product: normalized.product });
    if (!eventAlreadyExists) connectionUpdates.productCount = FieldValue.increment(1);
  }

  if (normalized.order) {
    const orderRef = adminDb.collection("ecommerce_orders").doc(hashId([input.tenantId, input.connectionId, normalized.order.externalOrderId]));
    await orderRef.set(
      {
        tenantId: input.tenantId,
        connectionId: input.connectionId,
        provider: input.provider,
        ...normalized.order,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await syncOrderToCommercial({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      order: normalized.order,
    });
    if (!eventAlreadyExists) connectionUpdates.orderCount = FieldValue.increment(1);
  }

  if (normalized.cart) {
    const cartRef = adminDb.collection("ecommerce_abandoned_carts").doc(hashId([input.tenantId, input.connectionId, normalized.cart.externalCartId]));
    await cartRef.set(
      {
        tenantId: input.tenantId,
        connectionId: input.connectionId,
        provider: input.provider,
        ...normalized.cart,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await syncCartToCommercial({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      cart: normalized.cart,
    });
    if (!eventAlreadyExists) connectionUpdates.cartCount = FieldValue.increment(1);
  }

  await connectionRef.set(connectionUpdates, { merge: true });

  return {
    ok: true,
    topic: normalized.topic,
    eventId: eventRef.id,
    product: Boolean(normalized.product),
    order: Boolean(normalized.order),
    cart: Boolean(normalized.cart),
  };
}
