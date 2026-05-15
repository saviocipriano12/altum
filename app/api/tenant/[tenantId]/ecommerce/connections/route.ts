import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import {
  buildConnectionPayload,
  buildEcommerceWebhookSecret,
  normalizeEcommerceProvider,
  providerLabel,
  publicConnectionFromDoc,
  type EcommerceConnectionInput,
} from "@/lib/server/ecommerce";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function rowFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    provider: clean(data.provider, 80),
    providerLabel: providerLabel(data.provider),
    connectionId: clean(data.connectionId, 180),
    type: clean(data.type, 80),
    name: clean(data.title || data.name || data.productName || data.orderNumber || data.customerName || data.topic, 180),
    detail: clean(data.detail, 280),
    leadId: clean(data.leadId, 180),
    status: clean(data.status || data.paymentStatus || data.fulfillmentStatus, 80),
    totalPrice: typeof data.totalPrice === "number" ? data.totalPrice : null,
    currency: clean(data.currency, 20),
    updatedAt: toIso(data.updatedAt),
    createdAt: toIso(data.createdAt || data.receivedAt),
  };
}

async function tenantRows(collectionName: string, tenantId: string, limit: number) {
  const snap = await adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(limit).get();
  return snap.docs.map(rowFromDoc);
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const [connectionsSnap, products, orders, carts, events, actions] = await Promise.all([
      adminDb.collection("ecommerce_connections").where("tenantId", "==", tenantId).limit(40).get(),
      tenantRows("ecommerce_products", tenantId, 80),
      tenantRows("ecommerce_orders", tenantId, 80),
      tenantRows("ecommerce_abandoned_carts", tenantId, 80),
      tenantRows("ecommerce_events", tenantId, 80),
      tenantRows("ecommerce_commercial_actions", tenantId, 120),
    ]);

    const connections = connectionsSnap.docs
      .map(publicConnectionFromDoc)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const activeConnections = connections.filter((item) => item.status === "active").length;
    const abandonedCarts = carts.filter((item) => item.status === "abandoned").length;

    return NextResponse.json({
      ok: true,
      tenantId,
      connections,
      summary: {
        totalConnections: connections.length,
        activeConnections,
        products: products.length,
        orders: orders.length,
        abandonedCarts,
        events: events.length,
        pendingActions: actions.filter((item) => item.status === "pending").length,
      },
      recent: {
        products: products.slice(0, 12),
        orders: orders.slice(0, 12),
        carts: carts.slice(0, 12),
        events: events.slice(0, 12),
        actions: actions.slice(0, 12),
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar integracoes ecommerce:", error);
    return NextResponse.json({ error: "Falha ao carregar integracoes ecommerce." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const body = (await req.json()) as EcommerceConnectionInput;
    const provider = normalizeEcommerceProvider(body.provider);
    if (!provider) return NextResponse.json({ error: "Plataforma de ecommerce invalida." }, { status: 400 });

    const webhookSecret = buildEcommerceWebhookSecret();
    const payload = {
      ...buildConnectionPayload({
        ...body,
        provider,
        tenantId,
        userId: user.uid,
        userName: user.name,
        webhookSecret,
      }),
      createdAt: FieldValue.serverTimestamp(),
    };

    const ref = adminDb.collection("ecommerce_connections").doc();
    await Promise.all([
      ref.set(payload, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "tenant_ecommerce_connection_created",
        tenantId,
        actorId: user.uid,
        actorName: user.name,
        connectionId: ref.id,
        provider,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId,
      connectionId: ref.id,
      provider,
      webhookSecret,
      message: `Conexao ${providerLabel(provider)} criada.`,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao criar integracao ecommerce:", error);
    return NextResponse.json({ error: "Falha ao criar integracao ecommerce." }, { status: 500 });
  }
}
