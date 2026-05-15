import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeEcommerceProvider, processEcommerceWebhook } from "@/lib/server/ecommerce";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await context.params;
  const provider = normalizeEcommerceProvider(providerParam);
  const url = new URL(req.url);
  const tenantId = clean(url.searchParams.get("tenantId"), 180);
  const connectionId = clean(url.searchParams.get("connectionId"), 180);

  if (!provider) return NextResponse.json({ error: "Provider invalido." }, { status: 400 });
  if (!tenantId || !connectionId) return NextResponse.json({ error: "tenantId e connectionId sao obrigatorios." }, { status: 400 });

  const payload = await readJson(req);

  try {
    const result = await processEcommerceWebhook({ tenantId, connectionId, provider, payload, req });
    return NextResponse.json(result);
  } catch (error) {
    await adminDb.collection("ecommerce_events").add({
      tenantId,
      connectionId,
      provider,
      topic: "webhook_error",
      error: error instanceof Error ? error.message : "webhook_error",
      payload,
      receivedAt: FieldValue.serverTimestamp(),
    });

    if (error instanceof Error && error.message === "ecommerce_webhook_unauthorized") {
      return NextResponse.json({ error: "Webhook nao autorizado." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "ecommerce_connection_not_found") {
      return NextResponse.json({ error: "Integracao nao encontrada." }, { status: 404 });
    }
    console.error("Erro no webhook ecommerce:", error);
    return NextResponse.json({ error: "Falha ao processar webhook ecommerce." }, { status: 500 });
  }
}

