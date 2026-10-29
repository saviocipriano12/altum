// Real LF Shopify reads, optionally one configured-model interpretation request.
// Never creates messages, CRM writes, tasks or notifications.
import assert from "node:assert/strict";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
process.env.SHOPIFY_LIVE_CATALOG_STORES = "lf-multimarcas-vitoria-nm0fp51f.myshopify.com";
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { lookupConversationCatalog } = await import("../lib/server/commerce/conversation-catalog.ts");
const tenantId = "saas_fZxgDGSTcpRaiKOp1SpNNcwrOOM2";
try {
  for (const inboundText of process.argv.includes("--model-only") ? [] : ["Estou buscando uma camisa do Atlético Mineiro, você tem ?", "Estou buscando uma camisa do Atletico Mineiro, você tem ?", "Estou buscando uma camisa do Clube Inexistente Xpto 99/00", "Tem camisa Flamengo titular 77/78 manga longa tamanho L?"]) {
    const turn = await lookupConversationCatalog({ tenantId, inboundText, preview: true, allowedTools: ["knowledge_read"], finalAttempt: true });
    assert.ok(turn);
    if (inboundText.includes("Mineiro")) assert.ok(turn.context?.pendingProducts?.some((product) => /Atlético/.test(product.name)));
    if (inboundText.includes("Xpto")) assert.equal(turn.decision, "handoff");
    console.log(JSON.stringify({ inboundText, status: turn.status, decision: turn.decision, response: turn.responseText }));
  }
  if (process.argv.includes("--model") || process.argv.includes("--model-only")) {
    const { parseAiConfig } = await import("../lib/server/ai/agent.ts");
    const { compileTenantAiContext } = await import("../lib/server/ai/tenant-context.ts");
    const { runConversationAgent } = await import("../lib/server/ai/router.ts");
    const { acceptedCatalogInterpretation, catalogSearchProposal } = await import("../lib/shopify-conversation-catalog.ts");
    const settings = (await adminDb.collection("tenant_settings").doc(tenantId).get()).data();
    const ai = parseAiConfig(settings as Parameters<typeof parseAiConfig>[0]);
    const inboundText = "Tudo certo, estou querendo uma casa muda do Flamengo vocês tem ?";
    const tenantContext = compileTenantAiContext({ tenantId, agentName: ai.agentName, assistantRole: ai.assistantRole,
      businessSummary: ai.businessSummary, objective: ai.objective, toneOfVoice: ai.toneOfVoice, commercialBrain: ai.commercialBrain,
      guardrails: ai.guardrails, mandatoryQuestions: ai.mandatoryQuestions, escalationTopics: ai.escalationTopics, hasVerifiedOffers: false });
    const model = await runConversationAgent({ tenantId, chatId: "read_only_recovery_probe", inboundText, channel: "whatsapp",
      agentName: ai.agentName, assistantRole: ai.assistantRole, tenantContext, tenantContextConfigured: true,
      toneOfVoice: ai.toneOfVoice, businessSummary: ai.businessSummary, objective: ai.objective, guardrails: ai.guardrails,
      tier: ai.tier, autonomyMode: ai.autonomyMode, reasoningLevel: ai.reasoningLevel, responseStyle: ai.responseStyle,
      conversation: [{ id: "probe", sender: "client", text: inboundText }], kbDocs: [], preferredProviders: ai.preferredProviders }, ai.runtimePolicy);
    const interpretation = catalogSearchProposal(model.result, inboundText);
    console.log(JSON.stringify({ modelProbe: { provider: model.result?.provider, model: model.result?.model, decision: model.result?.decision, reason: model.result?.reason,
      interpretation, response: model.result?.responseText, providerError: model.providerChainError?.slice(0, 220) } }));
    assert.ok(acceptedCatalogInterpretation(interpretation, inboundText), "Configured model must identify a supported product search");
    const turn = await lookupConversationCatalog({ tenantId, inboundText, interpretation, finalAttempt: true, preview: true, allowedTools: ["knowledge_read"] });
    assert.ok(turn?.context?.pendingProducts?.some((product) => product.name.includes("Flamengo")));
    console.log(JSON.stringify({ model: model.result?.model, inboundText, interpretation, status: turn.status, response: turn.responseText }));
  }
} finally { await adminDb.terminate(); }
