import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { verifyBase64HmacSha256 } from "@/lib/server/commerce/webhook-security";
import { normalizeShopifyStore } from "@/lib/shopify-connection";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBase64HmacSha256(raw, req.headers.get("x-shopify-hmac-sha256") || "", process.env.SHOPIFY_CLIENT_SECRET || "")) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  if (req.headers.get("x-shopify-topic") !== "app/uninstalled") {
    return NextResponse.json({ error: "Evento não suportado." }, { status: 400 });
  }
  let payload: { myshopify_domain?: unknown };
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Evento inválido." }, { status: 400 }); }
  // Use the signed body, not an unsigned shop header, to select the connections.
  const shop = normalizeShopifyStore(payload?.myshopify_domain);
  if (!shop) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  try {
    const connections = await adminDb.collection("ecommerce_connections").where("storeId", "==", shop).get();
    const batch = adminDb.batch();
    for (const doc of connections.docs) {
      const data = doc.data();
      if (data.provider !== "shopify" || data.oauthManaged !== true) continue;
      batch.set(doc.ref, {
        status: "paused", connectionStatus: "revoked", apiCredentials: FieldValue.delete(),
        oauthManaged: false, webhookProvisioning: FieldValue.delete(),
        lastError: "Aplicativo removido na Shopify. Reconecte para retomar as atualizações.",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao registrar desinstalação Shopify:", error);
    return NextResponse.json({ error: "Não foi possível atualizar a conexão." }, { status: 500 });
  }
}
