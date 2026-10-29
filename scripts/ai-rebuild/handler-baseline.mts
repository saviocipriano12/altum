import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { developmentCorpus, corpusCaseHash, DEVELOPMENT_HANDLER_CASE_IDS } from "./corpus.mts";
import { callMissionEvaluationModel } from "./paid-model-call.mts";
import { EVALUATION_CANDIDATE } from "./budget.mts";
import { runColdHandlerTurn } from "./cold-handler-turn.mts";

export const SUPPORTED_CORPUS_HANDLER_CASES = DEVELOPMENT_HANDLER_CASE_IDS;

/** Run in a dedicated process: this diagnostic temporarily replaces env/fetch. */
export async function collectHandlerBaseline(config: { shopify?: boolean; corpusCaseId?: string; paidModel?: boolean } = {}) {
  const requestedCase = config.corpusCaseId ? developmentCorpus().find(item => item.scenario.id === config.corpusCaseId) : null;
  if (config.corpusCaseId && (!requestedCase || !(SUPPORTED_CORPUS_HANDLER_CASES as readonly string[]).includes(config.corpusCaseId))) {
    throw new Error("Cenario sem adaptador integral de desenvolvimento; nao executar nem substituir por outro caso.");
  }
  if (config.paidModel && (!requestedCase || !process.env.OPENAI_API_KEY)) throw new Error("Modelo pago exige caso de desenvolvimento e chave disponivel; sem chamada.");
  if (config.paidModel && config.corpusCaseId === "shop-correction-and-restart") throw new Error("Cold restart nesta rodada somente com modelo simulado, sem gasto.");
  const projectId = "demo-altum-ai-rebuild";
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost !== "127.0.0.1:8080") throw new Error("Defina explicitamente FIRESTORE_EMULATOR_HOST=127.0.0.1:8080; sem fallback para banco real.");
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  Object.assign(process.env, { FIREBASE_PROJECT_ID: projectId, NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    GCLOUD_PROJECT: projectId, FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "",
    GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "synthetic-no-billing-key", ANTHROPIC_API_KEY: "",
    GEMINI_API_KEY: "", GOOGLE_API_KEY: "", MISTRAL_API_KEY: "" });
  const prefix = `qa_rebuild_handler_${Date.now()}_${randomUUID().slice(0, 8)}`, tenantId = `${prefix}_a`, foreignTenantId = `${prefix}_b`;
  const modelRequests: Array<{ messages: Array<{ role: string; content: string }>; responseText: string }> = [];
  const delivered: Array<{ text: string; recipient: string }> = [];
  const blockedNetwork: string[] = [];
  const shopHost = "synthetic-rebuild.myshopify.com", productUrl = "https://shop.fixture.invalid/products/aurora-preta";
  const productId = "gid://shopify/Product/901";
  const catalogRequests: Array<{ query: string; variables: Record<string, unknown>; failed: boolean; fixturePrice: string; fixtureOnlineStoreUrl: string | null; returnedProductIds: string[] }> = [];
  let catalogPrice = "149.90";
  let failCatalog = false;
  const originalLookup = dns.lookup;
  let pendingResponse = "Resposta ficticia de teste";
  let activeCorpusInboundText = "";
  let paidModelCalls = 0, paidAttemptIndex = 0, paidCallFailed = false;
  const paidReceipts: Array<Awaited<ReturnType<typeof callMissionEvaluationModel>>["receipt"]> = [];
  const paidErrors: string[] = [];
  globalThis.fetch = async (url, options) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    // No pass-through at all: Firebase uses the explicitly local gRPC emulator.
    if (target.origin === "https://api.openai.com" && target.pathname === "/v1/chat/completions") {
      const body = JSON.parse(String(options?.body));
      if (config.paidModel && requestedCase && activeCorpusInboundText) {
        if (paidCallFailed) throw new Error("Lote pago suspenso apos resultado incerto; nao tentar outro modelo automaticamente.");
        const requestRecord = { messages: body.messages, responseText: "" };
        modelRequests.push(requestRecord);
        try {
          const paid = await callMissionEvaluationModel({ callId: `${prefix}.model.${++paidAttemptIndex}`, caseId: requestedCase.scenario.id,
            caseHash: corpusCaseHash(requestedCase), syntheticData: true, messages: body.messages }, originalEnv.OPENAI_API_KEY!,
          async (paidUrl, paidOptions) => { paidModelCalls++; return originalFetch(paidUrl, paidOptions); });
          paidReceipts.push(paid.receipt);
          const raw = paid.data.choices?.[0]?.message?.content || "";
          try { requestRecord.responseText = String(JSON.parse(raw).responseText || ""); } catch { requestRecord.responseText = raw; }
          return Response.json(paid.data);
        } catch (error) {
          paidCallFailed = true; paidErrors.push(error instanceof Error ? error.message : "paid_call_failed"); throw error;
        }
      }
      modelRequests.push({ messages: body.messages, responseText: pendingResponse });
      // Tool proposals must cite the actual inbound, not the formatted prompt's
      // whole user/history block (which is not an exact source excerpt).
      const lastText = activeCorpusInboundText;
      const syntheticSearch = requestedCase && /aurora/i.test(lastText) ? { catalogSearch: { kind: "product_search",
        query: config.corpusCaseId === "shop-product-unpublished" ? "Aurora especial" : "Aurora preta", evidence: lastText, confidence: 0.99 } } : {};
      return Response.json({ id: `synthetic-${modelRequests.length}`, choices: [{ message: { role: "assistant", content: JSON.stringify({
        decision: "respond", reason: "synthetic_handler_probe", confidence: 0.99,
        responseText: pendingResponse, nextAction: "responder_cliente", turnGoal: "responder_duvida",
        memorySummary: requestedCase ? "" : "Compra Aurora preta; tamanho corrigido para GG.", ...syntheticSearch,
      }) } }], usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 } });
    }
    if (target.origin === "https://graph.facebook.com" && /\/qa-rebuild-number\/messages$/.test(target.pathname)) {
      const body = JSON.parse(String(options?.body));
      if (body.type !== "text") throw new Error("Diagnostico textual nao permite outra midia/template.");
      delivered.push({ text: body.text.body, recipient: body.to });
      return Response.json({ messages: [{ id: `wamid.synthetic-handler-${delivered.length}` }] });
    }
    if ((config.shopify || requestedCase) && target.origin === `https://${shopHost}` && /^\/admin\/api\/[^/]+\/graphql.json$/.test(target.pathname)) {
      const body = JSON.parse(String(options?.body));
      if (typeof body.query !== "string" || !/^query AltumLive(?:Product|Catalog)\(/.test(body.query)) throw new Error("Somente leitura de catalogo sintetico e permitida.");
      const onlineStoreUrl = config.corpusCaseId === "shop-product-unpublished" ? null : productUrl;
      const requestRecord = { query: body.query, variables: body.variables, failed: failCatalog,
        fixturePrice: catalogPrice, fixtureOnlineStoreUrl: onlineStoreUrl, returnedProductIds: [] as string[] };
      catalogRequests.push(requestRecord);
      if (failCatalog) return Response.json({ message: "synthetic Shopify unavailable" }, { status: 503 });
      const product = { id: productId, title: config.corpusCaseId === "shop-product-unpublished" ? "Camisa Aurora especial" : "Camisa Aurora preta", status: "ACTIVE", onlineStoreUrl,
        description: "Produto ficticio de teste", variants: { pageInfo: { hasNextPage: false }, nodes: ["M", "G", "GG"].map((size, index) => ({
          id: `gid://shopify/ProductVariant/${9010 + index}`, title: size, price: catalogPrice, sku: `AURORA-${size}`,
          selectedOptions: [{ name: "Tamanho", value: size }], availableForSale: true,
          inventoryQuantity: 3, sellableOnlineQuantity: 3, inventoryPolicy: "DENY",
        })) } };
      const terms = [...String(body.variables?.query || "").matchAll(/title:([\p{L}\p{N}/-]+)\*/gu)].map(match => match[1].toLowerCase());
      const titleWords = product.title.toLowerCase().split(/\s+/);
      const matches = terms.length > 0 && terms.every(term => titleWords.some(word => word.startsWith(term)));
      // Fixture conditions are not exposure: an unmatched query returns no
      // product, even though a price/publication condition exists in the store.
      requestRecord.returnedProductIds = body.variables?.id
        ? body.variables.id === product.id ? [product.id] : [] : matches ? [product.id] : [];
      return Response.json({ data: { shop: { currencyCode: "BRL", primaryDomain: { url: "https://shop.fixture.invalid" } },
        ...(body.variables?.id ? { product: body.variables.id === product.id ? product : null }
          : { products: { pageInfo: { hasNextPage: false }, nodes: matches ? [product] : [] } }) } });
    }
    blockedNetwork.push(`${target.origin}${target.pathname}`);
    throw new Error("Rede bloqueada pelo diagnostico isolado");
  };
  const criticalFiles = ["lib/server/ai/agent.ts", "lib/server/ai/router.ts", "lib/server/ai/knowledge-context.ts", "lib/server/chat-outbound.ts",
    "lib/server/commerce/conversation-catalog.ts", "lib/server/commerce/providers/shopify.ts", "lib/shopify-conversation-catalog.ts"];
  const hashes = async () => Object.fromEntries(await Promise.all(criticalFiles.map(async path => [path,
    createHash("sha256").update(await readFile(fileURLToPath(new URL(`../../${path}`, import.meta.url)))).digest("hex")])));
  const beforeHashes = await hashes();
  let database: typeof import("../../app/lib/server/firebase-admin.ts").adminDb | undefined;
  try {
    const { getApps } = await import("firebase-admin/app");
    if (getApps().length) throw new Error("Use um processo isolado sem Firebase previamente inicializado.");
    const { adminDb } = await import("../../app/lib/server/firebase-admin.ts"); database = adminDb;
    const { handleIncomingMessage, getChatStateDocId } = await import("../../lib/server/ai/agent.ts");
    const { getConversationTurnDocId } = await import("../../lib/server/ai/turn-coordinator.ts");
    const { enqueueConversationCommercialObservation, processConversationCommercialObservationJobs } = await import("../../lib/server/crm/conversation-observation-queue.ts");
    const channelId = `${prefix}_channel`, chatId = `${prefix}_chat`, leadId = `${prefix}_lead`;
    await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, name: "Loja Aurora ficticia", businessProfileId: "ecommerce",
      ai: { enabled: true, assistantRole: "sales", agentName: "Assistente Aurora", businessSummary: "Loja Shopify de roupas Aurora. Estoque e preco somente pela loja conectada.",
        objective: "Ajudar com produtos e politica da loja sem impor reuniao.", voiceReplyEnabled: false, handoffNotifyEnabled: false,
        operatingProfile: { autonomyMode: "hybrid", responseStyle: "concise", preferredProviders: ["openai"], monthlyBudgetUsd: 0, monthlyUsageCap: 0,
          ...(config.paidModel ? { conversationModelOverride: EVALUATION_CANDIDATE.model } : {}) } } });
    await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active",
      channelScope: "shared", phoneNumberId: "qa-rebuild-number", accessToken: "synthetic-never-real" });
    await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Comprador ficticio", pipelineStage: "captado" });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date() });
    await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true, humanOwnerUserId: null });
    const inboundTexts = ["Quero a Aurora preta no G", "Na verdade eu quero GG, nao G", "Minha cidade e Campinas", "Qual tamanho e cidade eu informei?"];
    const replies = ["Entendi: Aurora preta no G. Vou consultar a opcao antes de afirmar disponibilidade.",
      "Certo, o tamanho passa a ser GG, mantendo Aurora preta.", "Campinas anotada para esta compra.", "Voce informou GG e Campinas, para a Aurora preta."];
    const turns = [];
    for (const [index, text] of inboundTexts.entries()) {
      const messageId = `${prefix}_in_${index}`, modelBefore = modelRequests.length, deliveryBefore = delivered.length;
      await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId, sender: "client", type: "text", text, createdAt: new Date() });
      await adminDb.collection("ai_conversation_turns").doc(getConversationTurnDocId(tenantId, chatId)).set({ tenantId, chatId, latestMessageId: messageId });
      pendingResponse = replies[index];
      const result = await handleIncomingMessage({ tenantId, chatId, messageId });
      turns.push({ index, inputText: text, modelResponse: pendingResponse, result,
        modelRequests: modelRequests.slice(modelBefore), delivered: delivered.slice(deliveryBefore) });
    }
    const beforeReplay = { models: modelRequests.length, deliveries: delivered.length };
    const replayResult = await handleIncomingMessage({ tenantId, chatId, messageId: `${prefix}_in_3` });
    const replayProbe = { result: replayResult, extraModelRequests: modelRequests.length - beforeReplay.models,
      extraDeliveries: delivered.length - beforeReplay.deliveries };
    // The same core entry point receives a deliberately mismatched source record.
    // This is a diagnostic finding, not a customer message or accepted behavior.
    const foreignId = `${prefix}_foreign`, beforeForeign = modelRequests.length;
    await adminDb.collection("messages").doc(foreignId).set({ tenantId: foreignTenantId, chatId: `${prefix}_foreign_chat`,
      sender: "client", type: "text", text: "SYNTHETIC_FOREIGN_SOURCE_MARKER", createdAt: new Date() });
    pendingResponse = "Resposta sintetica da sonda de isolamento";
    const foreignResult = await handleIncomingMessage({ tenantId, chatId, messageId: foreignId });
    const foreignRequests = modelRequests.slice(beforeForeign);
    const foreignSourceReachedModel = foreignRequests.some(call => JSON.stringify(call.messages).includes("SYNTHETIC_FOREIGN_SOURCE_MARKER"));

    const wrongChatId = `${prefix}_wrongchat`, beforeWrongChat = modelRequests.length;
    await adminDb.collection("messages").doc(wrongChatId).set({ tenantId, chatId: `${prefix}_different_chat`,
      sender: "client", type: "text", text: "SYNTHETIC_OTHER_CHAT_MARKER", createdAt: new Date() });
    const wrongChatResult = await handleIncomingMessage({ tenantId, chatId, messageId: wrongChatId });
    const wrongChatReachedModel = modelRequests.length !== beforeWrongChat;
    const incompleteId = `${prefix}_missinglink`, beforeIncomplete = modelRequests.length;
    await adminDb.collection("messages").doc(incompleteId).set({ tenantId, sender: "client", type: "text", text: "SYNTHETIC_MISSING_CHAT", createdAt: new Date() });
    const incompleteResult = await handleIncomingMessage({ tenantId, chatId, messageId: incompleteId });
    const missingLinkModelRequests = modelRequests.length - beforeIncomplete;

    // Observation is exercised independently with the reply path paused.
    await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ aiEnabled: false, humanOwnerUserId: "synthetic-seller" }, { merge: true });
    const passiveId = `${prefix}_passive`, passiveDeliveryBefore = delivered.length;
    await adminDb.collection("messages").doc(passiveId).set({ tenantId, chatId, leadId, sender: "client", type: "text", text: "Minha cidade e Recife", createdAt: new Date() });
    const passive = await enqueueConversationCommercialObservation({ tenantId, chatId, messageId: passiveId, source: "qa_handler_baseline" });
    await processConversationCommercialObservationJobs({ jobId: passive.jobId, limit: 1 });
    const pausedResult = await handleIncomingMessage({ tenantId, chatId, messageId: passiveId });
    const passiveDeliveries = delivered.length - passiveDeliveryBefore;
    let catalogProbe = null;
    if (config.shopify || requestedCase) {
      // The real provider's SSRF checks remain active. Only DNS resolution is a
      // fixture; fetch above never forwards to a real store or public IP.
      dns.lookup = (async (hostname: string, options: { all?: boolean }) => {
        if (hostname !== shopHost || options?.all !== true) throw new Error("DNS nao autorizado pelo teste");
        return [{ address: "203.0.113.10", family: 4 }];
      }) as unknown as typeof dns.lookup;
      syncBuiltinESMExports();
      Object.assign(process.env, { SHOPIFY_LIVE_CATALOG_STORES: shopHost, SHOPIFY_LIVE_CATALOG_MODE: "pilot" });
      const cases = requestedCase ? [{ id: requestedCase.scenario.id, inputs: requestedCase.scenario.turns }] : [
        { id: "purchase-link", inputs: ["Voces tem a camisa Aurora preta?", "G", "Pode mandar o link direto do produto para comprar"] },
        { id: "size-correction", inputs: ["Voces tem a camisa Aurora preta?", "G", "Na verdade GG"] },
        { id: "lookup-failure", inputs: ["Voces tem a camisa Aurora preta?", "GG", "O GG ainda tem estoque?"] },
      ];
      const connectionId = `${prefix}_shopify`;
      await adminDb.collection("tenant_settings").doc(tenantId).set({ ai: { rollout: { mode: "automatic", rolloutPercent: 100,
        exclusiveTest: { tenantId, chatIds: cases.map(item => `${prefix}_catalog_${item.id}`) } } } }, { merge: true });
      await adminDb.collection("ecommerce_connections").doc(connectionId).set({ tenantId, provider: "shopify", status: "active",
        displayName: "Loja sintetica", storeId: shopHost, storeUrl: `https://${shopHost}`, apiCredentials: { accessToken: "synthetic-never-real" } });
      const catalogTurns = [];
      for (const scenario of cases) {
        const catalogChatId = `${prefix}_catalog_${scenario.id}`, catalogLeadId = `${prefix}_catalog_lead_${scenario.id}`;
        await adminDb.collection("leads").doc(catalogLeadId).set({ tenantId, nome: "Comprador catalogo ficticio", pipelineStage: "captado" });
        await adminDb.collection("chats").doc(catalogChatId).set({ tenantId, leadId: catalogLeadId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date() });
        await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, catalogChatId)).set({ tenantId, chatId: catalogChatId, aiEnabled: true });
        for (const [index, text] of scenario.inputs.entries()) {
          activeCorpusInboundText = requestedCase ? text : "";
          catalogPrice = config.corpusCaseId === "shop-price-changed-before-link" && index >= 2 ? "169.90" : "149.90";
          failCatalog = scenario.id === "lookup-failure" && index === 2;
          const messageId = `${prefix}_catalog_${scenario.id}_${index}`, lookupBefore = catalogRequests.length, deliveryBefore = delivered.length, modelBefore = modelRequests.length;
          await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId: catalogChatId, leadId: catalogLeadId,
            sender: "client", type: "text", text, createdAt: new Date() });
          await adminDb.collection("ai_conversation_turns").doc(getConversationTurnDocId(tenantId, catalogChatId)).set({ tenantId, chatId: catalogChatId, latestMessageId: messageId });
          pendingResponse = "Nao tenho uma consulta confirmada para afirmar disponibilidade.";
          const cold = config.corpusCaseId === "shop-correction-and-restart"
            ? await runColdHandlerTurn({ tenantId, chatId: catalogChatId, messageId }, globalThis.fetch) : null;
          const result = cold !== null ? cold.result : await handleIncomingMessage({ tenantId, chatId: catalogChatId, messageId });
          const currentChat = (await adminDb.collection("chats").doc(catalogChatId).get()).data();
          const currentLead = (await adminDb.collection("leads").doc(catalogLeadId).get()).data();
          catalogTurns.push({ caseId: scenario.id, index, inputText: text, result, requests: catalogRequests.slice(lookupBefore), delivered: delivered.slice(deliveryBefore),
            worker: cold ? { pid: cold.workerPid, bootId: cold.bootId, execution: "fresh_process" as const } : null,
            modelRequests: modelRequests.slice(modelBefore),
            context: currentChat?.commerceConversationContext ?? null, interest: currentLead?.commerceInterest ?? null,
            stage: currentLead?.pipelineStage ?? null });
        }
      }
      const linkTurn = catalogTurns.find(turn => turn.caseId === "purchase-link" && turn.index === 2);
      const correctionTurn = catalogTurns.find(turn => turn.caseId === "size-correction" && turn.index === 2);
      const directProductUrlDelivered = (requestedCase ? catalogTurns.at(-1) : linkTurn)?.delivered.some(item => item.text.includes(productUrl)) || false;
      const correctionRetained = correctionTurn?.context?.selection?.Tamanho === "GG";
      catalogProbe = { productUrl, productId, boundary: "Actual handler and Shopify provider; DNS/GraphQL/model/channel are synthetic and never forwarded.",
        requests: catalogRequests, turns: catalogTurns,
        directProductUrlDelivered, correctionRetained,
        findings: [
          ...(linkTurn && !directProductUrlDelivered ? [{ id: "requested_product_link_not_delivered", caseId: "purchase-link" }] : []),
          ...(correctionTurn && !correctionRetained ? [{ id: "size_correction_not_applied", caseId: "size-correction" }] : []),
          ...(correctionTurn?.requests.some(request => String(request.variables.query).includes("title:verdade*"))
            ? [{ id: "correction_searched_as_new_product", caseId: "size-correction" }] : []),
        ],
        failedLookupObserved: catalogRequests.some(item => item.failed) };
    }
    const lead = (await adminDb.collection("leads").doc(leadId).get()).data();
    const logs = await adminDb.collection("ai_logs").where("tenantId", "==", tenantId).get();
    const outbound = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get();
    const afterHashes = await hashes();
    return { schemaVersion: "shopify-handler-baseline-v1", capturedAt: new Date().toISOString(), synthetic: true,
      boundary: config.paidModel ? "Real handler + partial paid model inference; Firestore, Shopify and channel are isolated fixtures. Not live Shopify, real delivery or final quality acceptance."
        : "Real handler + local Firestore; model and WhatsApp are intercepted fixtures. Not inference, webhook coverage, live Shopify or real channel delivery.",
      paidModelCalls, paidReceipts, paidErrors, partialRealInferencePerformed: paidModelCalls > 0,
      externalEffectsExecuted: paidModelCalls > 0, externalBusinessEffectsExecuted: false, modelRequestsIntercepted: modelRequests.length,
      channelRequestsIntercepted: delivered.length, blockedNetwork, sourceHashes: beforeHashes,
      sourceUnchanged: criticalFiles.every(path => beforeHashes[path] === afterHashes[path]), turns,
      replayProbe,
      corpusCase: requestedCase ? { id: requestedCase.scenario.id, hash: corpusCaseHash(requestedCase), partition: requestedCase.partition } : null,
      catalogProbe,
      foreignSourceProbe: { result: foreignResult, foreignSourceReachedModel, modelRequests: foreignRequests.length },
      wrongChatProbe: { result: wrongChatResult, wrongChatReachedModel },
      missingLinkProbe: { result: incompleteResult, modelRequests: missingLinkModelRequests },
      passiveProbe: { result: pausedResult, observationJobId: passive.jobId, city: lead?.customFields?.cidade ?? null,
        deliveryWhilePaused: passiveDeliveries },
      logs: logs.docs.map(doc => ({ messageId: doc.data().messageId, decision: doc.data().decision, reason: doc.data().reason, output: doc.data().output })),
      outbound: outbound.docs.map(doc => ({ id: doc.id, messageId: doc.data().messageId, status: doc.data().status })),
      acceptance: { stageA: "in_progress", productReady: false, realModelQualityTested: false, liveShopifyTested: false } };
  } finally {
    try { if (database) {
      // Delete only fixture-owned documents in the fixed demo project, including
      // their children. Never use a collection-wide/project-wide destructive wipe.
      const collections = await database.listCollections();
      for (const collection of collections) {
        const rows = await collection.get();
        for (const row of rows.docs) if ([tenantId, foreignTenantId].includes(String(row.data().tenantId)) || row.id.startsWith(prefix)) await database.recursiveDelete(row.ref);
      }
      await database.terminate();
    } } finally {
      dns.lookup = originalLookup;
      syncBuiltinESMExports();
      globalThis.fetch = originalFetch;
      for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  }
}
