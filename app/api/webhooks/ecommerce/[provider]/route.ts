import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeEcommerceProvider, processEcommerceWebhook } from "@/lib/server/ecommerce";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { TenantAccessError } from "@/lib/server/tenant";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await context.params;
  const provider = normalizeEcommerceProvider(providerParam);
  const url = new URL(req.url);
  const tenantId = clean(url.searchParams.get("tenantId"), 180);
  const connectionId = clean(url.searchParams.get("connectionId"), 180);

  if (!provider) return NextResponse.json({ error: "Provider invalido." }, { status: 400 });
  if (!tenantId || !connectionId) return NextResponse.json({ error: "tenantId e connectionId sao obrigatorios." }, { status: 400 });

  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido." }, { status: 400 });
  }

  try {
    await assertTenantModule(tenantId, "commerce");
    const result = await processEcommerceWebhook({ tenantId, connectionId, provider, payload, rawBody, req });
    return NextResponse.json(result);
  } catch (error) {
    await adminDb.collection("ecommerce_events").add({
      tenantId,
      connectionId,
      provider,
      topic: "webhook_error",
      error: error instanceof Error ? error.message : "webhook_error",
      payloadMetadata: {
        contentType: clean(req.headers.get("content-type"), 120),
        contentLength: rawBody.length,
        deliveryId: clean(req.headers.get("x-shopify-webhook-id") || req.headers.get("x-wc-webhook-delivery-id"), 180),
      },
      receivedAt: FieldValue.serverTimestamp(),
    });

    if (error instanceof Error && error.message === "ecommerce_webhook_unauthorized") {
      return NextResponse.json({ error: "Webhook nao autorizado." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "ecommerce_connection_not_found") {
      return NextResponse.json({ error: "Integracao nao encontrada." }, { status: 404 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro no webhook ecommerce:", error);
    return NextResponse.json({ error: "Falha ao processar webhook ecommerce." }, { status: 500 });
  }
}

