// User-authorized, expiring Shopify pilot for the LF owner's test conversation.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const tenantId = "saas_fZxgDGSTcpRaiKOp1SpNNcwrOOM2";
const connectionId = "D6yHmAWl8s31HQecWLfs";
const chatId = `whatsapp_${tenantId}_Ekl2ZmB9pDsRiBSaXeBC_553184537782`;
const connectionRef = adminDb.collection("ecommerce_connections").doc(connectionId);
const chatRef = adminDb.collection("chats").doc(chatId);
const settingsRef = adminDb.collection("tenant_settings").doc(tenantId);
const enabled = process.argv.includes("--enable");
if (!enabled && !process.argv.includes("--disable")) throw new Error("Specify --enable or --disable");
const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
await adminDb.runTransaction(async (transaction) => {
  const [connection, chat, settings] = await Promise.all([
    transaction.get(connectionRef), transaction.get(chatRef), transaction.get(settingsRef),
  ]);
  const data = connection.data();
  const contact = chat.data();
  const ai = settings.data()?.ai;
  if (!data || data.tenantId !== tenantId || data.provider !== "shopify" || data.status !== "active"
    || data.storeId !== "lf-multimarcas-vitoria-nm0fp51f.myshopify.com") throw new Error("Unexpected LF Shopify connection");
  if (!contact || contact.tenantId !== tenantId || contact.channel !== "whatsapp"
    || !String(contact.contactPhone || "").replace(/\D/g, "").endsWith("7782") || !contact.leadId) throw new Error("Authorized test chat not verified");
  if (enabled && (!ai?.businessSummary || ai.enabled === false || ai.responsePaused === true)) throw new Error("LF assistant is not ready or is paused; do not bypass controls");
  transaction.update(connectionRef, { liveCatalogPilot: { enabled, tenantId, chatIds: enabled ? [chatId] : [], expiresAt,
    purpose: "owner_authorized_whatsapp_test", authorizedContactSuffix: "7782" }, updatedAt: FieldValue.serverTimestamp() });
});
console.log(JSON.stringify({ enabled, tenant: "LF Multimarcas Vitória", authorizedContactSuffix: "7782", expiresAt, scope: "one_existing_chat", globalModeUnchanged: true }));
process.exit(0);
