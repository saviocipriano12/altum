import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { connectionConfigFromDoc, getCommerceProvider, readCommerceCredentials } from "./registry";
import type { AiConversationRollout } from "@/lib/ai-conversation-rollout";
import { isExplicitAiTestConversation } from "@/lib/ai-exclusive-test-safety";
import { catalogSearchPhrase, catalogTurnFallback, isCatalogTurn, resolveCatalogConversation,
  usableCommerceContext, isLiveCatalogPilotAllowed, catalogFollowup, catalogSocialReply, wantsStoreWebsite,
  welcomeCatalogTurn, resolveStoreWebsite, acceptedCatalogInterpretation, isProtectedCommerceTurn,
  catalogAlternativePhrase, catalogRecoveryTurn, productDisplayName, type CommerceConversationTurn } from "@/lib/shopify-conversation-catalog";

// Explicit store allowlist for the pilot. No new behavior for other companies.
export async function lookupConversationCatalog(input: {
  tenantId: string; chatId?: string; inboundText: string; context?: unknown; campaignOffer?: string | null;
  allowedTools: readonly string[]; resetTopic?: boolean; preview?: boolean;
  hasReplied?: boolean;
  interpretation?: unknown; allowSemanticRetry?: boolean; finalAttempt?: boolean;
  // Trusted tenant settings, never a value supplied by a contact or model.
  rollout?: AiConversationRollout;
}): Promise<CommerceConversationTurn | null> {
  // Publication does not silently activate new replies to real customers.
  if (!input.preview && process.env.SHOPIFY_LIVE_CATALOG_MODE !== "live" && !input.chatId) return null;
  const previous = input.resetTopic ? null : usableCommerceContext(input.context);
  const interpretedQuery = acceptedCatalogInterpretation(input.interpretation, input.inboundText);
  if (!input.allowedTools.includes("knowledge_read") || isProtectedCommerceTurn(input.inboundText)
    || (!isCatalogTurn(input.inboundText, previous) && !interpretedQuery)) return null;
  const exclusiveTest = isExplicitAiTestConversation(input);
  const unavailable = () => catalogRecoveryTurn(catalogTurnFallback("unavailable", ""), "lookup_unavailable", catalogSearchPhrase(input.inboundText));
  const stores = (process.env.SHOPIFY_LIVE_CATALOG_STORES || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!stores.length) return exclusiveTest ? unavailable() : null;
  const snap = await adminDb.collection("ecommerce_connections").where("tenantId", "==", input.tenantId).limit(20).get();
  const connections = snap.docs.filter((doc) => {
    const data = doc.data();
    return data.provider === "shopify" && data.status === "active" && stores.includes(String(data.storeId || "").toLowerCase());
  });
  if (!connections.length) return exclusiveTest ? unavailable() : null;
  if (!input.preview && process.env.SHOPIFY_LIVE_CATALOG_MODE !== "live"
    && !exclusiveTest
    && !connections.every((doc) => isLiveCatalogPilotAllowed({ tenantId: input.tenantId, chatId: input.chatId, pilot: doc.data().liveCatalogPilot }))) return null;
  try { await assertTenantModule(input.tenantId, "commerce"); } catch { return exclusiveTest ? unavailable() : null; }
  if (connections.length !== 1 || snap.size === 20) return catalogTurnFallback("store_selection", "Há mais de uma loja possível. De qual loja e modelo você quer saber?");
  const connection = connections[0];
  const compatiblePrevious = previous?.connectionId === connection.id ? previous : null;
  const present = (turn: CommerceConversationTurn) => welcomeCatalogTurn(turn, input.hasReplied !== false);
  const social = catalogSocialReply(input.inboundText);
  if (social) return { ...catalogTurnFallback("social", social), decision: "respond", context: compatiblePrevious || {
    connectionId: connection.id, productId: "", productName: "", selection: {}, updatedAt: new Date().toISOString(), discovery: true,
  } };
  const websiteRequested = wantsStoreWebsite(input.inboundText)
    || Boolean(compatiblePrevious?.awaitingWebsite && /^(sim|quero|pode|pode sim|manda|pode mandar)[!.\s]*$/i.test(input.inboundText.trim()));
  const followup = catalogFollowup(input.inboundText, compatiblePrevious || {
    connectionId: connection.id, productId: "", productName: "", selection: {}, updatedAt: new Date().toISOString(), discovery: true,
  });
  if (followup.turn && !websiteRequested && !interpretedQuery) return present({ ...followup.turn,
    needsInterpretation: Boolean(followup.turn.needsInterpretation && input.allowSemanticRetry && !input.finalAttempt) });
  const phrase = interpretedQuery || followup.query || catalogSearchPhrase(input.inboundText);
  // A campaign supplies a search hint only, never evidence of a product match.
  const query = phrase || (!compatiblePrevious ? catalogSearchPhrase(input.campaignOffer || "") : "");
  if (!query && !compatiblePrevious?.productId && !followup.productId && !websiteRequested) return present(catalogTurnFallback("product_required", "Qual é o modelo da camisa e a temporada que você procura?"));
  try {
    const data = connection.data();
    const provider = getCommerceProvider(data.provider);
    if (!provider.lookupCatalog) return catalogTurnFallback("unavailable", "Não consegui consultar a loja agora. Posso pedir à equipe para verificar?");
    const lookup = (params: { query?: string; productId?: string }) => provider.lookupCatalog!({ connection: connectionConfigFromDoc(connection.id, data), credentials: readCommerceCredentials(data.apiCredentials), ...params });
    const catalog = await lookup({
      ...(websiteRequested ? { query: "camisa" } : followup.productId ? { productId: followup.productId } : query ? { query } : { productId: compatiblePrevious!.productId }) });
    if (websiteRequested) return present(resolveStoreWebsite(catalog, compatiblePrevious));
    const oldRequest = /\b(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl|[2-4]xl)\b/i.test(input.inboundText)
      ? (compatiblePrevious?.requestedText || "").replace(/\b(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl|[2-4]xl)\b/gi, "") : compatiblePrevious?.requestedText || "";
    const effectiveText = followup.productId || followup.query ? `${oldRequest} ${input.inboundText}` : input.inboundText;
    const turn = resolveCatalogConversation({ catalog, inboundText: effectiveText, previous: compatiblePrevious });
    if (turn.context && query) turn.context.searchQuery = query;
    if (!catalog.productsComplete && !catalog.products.length) return present(catalogRecoveryTurn(turn, "search_incomplete", query));
    if (catalog.productsComplete && !catalog.products.length && input.allowSemanticRetry && !input.finalAttempt) return { ...turn, needsInterpretation: true };
    const needsRecovery = (catalog.productsComplete && !catalog.products.length)
      || ["out_of_stock", "backorder_possible", "unknown", "unpublished", "not_found", "incomplete", "stale"].includes(turn.status);
    if (!needsRecovery) return present(turn);
    // Relax only model/season, never club, audience, sleeve or a requested size.
    const alternativeQuery = catalogAlternativePhrase(query || compatiblePrevious?.productName || "");
    if (alternativeQuery) {
      const alternatives = await lookup({ query: alternativeQuery });
      const originalProduct = turn.context?.productId;
      const alternativeText = [effectiveText, ...Object.values(turn.context?.selection || {})].join(" ");
      alternatives.products = alternatives.products.filter((product) => {
        if (product.id === originalProduct || product.status !== "ACTIVE" || !product.onlineStoreUrl || !product.variantsComplete) return false;
        const candidate = resolveCatalogConversation({ catalog: { ...alternatives, products: [product], productsComplete: true }, inboundText: alternativeText });
        // A stated size needs a verified available variant; no size means models
        // may be presented as choices, never as confirmed stock or replacements.
        const sizeMentioned = /\b(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl|[2-4]xl)\b/i.test(alternativeText);
        return sizeMentioned ? candidate.status === "in_stock" : product.variants.some((variant) => variant.availability === "in_stock");
      });
      if (alternatives.products.length) {
        const offered = resolveCatalogConversation({ catalog: alternatives, inboundText: effectiveText });
        // A single alternative must be chosen too; never silently replace it.
        offered.context = { connectionId: connection.id, productId: "", productName: "", selection: {}, updatedAt: alternatives.checkedAt,
          pendingProducts: alternatives.products.slice(0, 4).map((product) => ({ id: product.id, name: product.name })), requestedText: effectiveText.slice(0, 300), alternativesOffered: true,
          searchQuery: alternativeQuery, candidatesComplete: alternatives.productsComplete && alternatives.products.length <= 4 };
        offered.status = "alternatives_offered"; offered.decision = "ask_more"; offered.reason = "shopify_live_alternatives_offered";
        offered.verifiedInventory = false; offered.verifiedPrice = false; offered.variantId = null;
        offered.responseText = `Não consegui confirmar a opção exata que você pediu. Para continuar te ajudando, encontrei modelos relacionados à sua busca, de outra temporada ou versão:\n\n${alternatives.products.slice(0, 4).map((product, index) => `${index + 1}) ${productDisplayName(product.name)}`).join("\n")}\n\nAlgum deles te interessa? Se não, um vendedor pode conferir outras possibilidades.`;
        return present(offered);
      }
      if (!alternatives.productsComplete) return present(catalogRecoveryTurn(turn, "search_incomplete", query));
    }
    return present(catalogRecoveryTurn(turn, catalog.products.length ? turn.status : "product_not_located", query));
  } catch {
    // Fail closed: old imported catalog is never a fallback for live stock.
    return catalogRecoveryTurn(catalogTurnFallback("unavailable", ""), "lookup_unavailable", query);
  }
}

export async function saveConversationCatalogInterest(input: {
  tenantId: string; chatId: string; leadId?: string | null; messageId: string;
  turn: CommerceConversationTurn; allowCrmWrite: boolean;
}) {
  if (!input.turn.context) return;
  const chatRef = adminDb.collection("chats").doc(input.chatId);
  const leadRef = input.leadId && input.allowCrmWrite ? adminDb.collection("leads").doc(input.leadId) : null;
  const eventId = `shopify_interest_${createHash("sha256").update(`${input.tenantId}:${input.chatId}:${input.messageId}`).digest("hex").slice(0, 32)}`;
  await adminDb.runTransaction(async (transaction) => {
    const chat = await transaction.get(chatRef);
    const lead = leadRef ? await transaction.get(leadRef) : null;
    if (!chat.exists || chat.data()?.tenantId !== input.tenantId) return;
    const current = usableCommerceContext(chat.data()?.commerceConversationContext);
    if (current && Date.parse(current.updatedAt) > Date.parse(input.turn.context!.updatedAt)) return;
    transaction.update(chatRef, { commerceConversationContext: input.turn.context });
    if (!input.turn.context!.productId || input.turn.context!.pendingProducts) return;
    if (!leadRef || !lead?.exists || lead.data()?.tenantId !== input.tenantId || chat.data()?.leadId !== input.leadId) return;
    const interest = { ...input.turn.context, variantId: input.turn.variantId, source: "shopify_live",
      chatId: input.chatId, messageId: input.messageId, status: input.turn.status };
    // References only: no catalog, prices or quantities stored, no stage/revenue mutation.
    transaction.set(leadRef, { commerceInterest: interest }, { merge: true });
    transaction.set(leadRef.collection("events").doc(eventId), {
      type: "commerce_product_interest", title: "Interesse em produto da loja",
      detail: `${input.turn.context!.productName}. Opções: ${Object.entries(input.turn.context!.selection).map(([key, value]) => `${key}: ${value}`).join(", ") || "a confirmar"}. Consulta, não compra.`,
      metadata: interest, actorId: "ai_sales_agent", actorName: "Assistente Altum", createdAt: FieldValue.serverTimestamp(),
    });
  });
}
