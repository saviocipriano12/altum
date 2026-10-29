import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { runConversationAgent, type ConversationAgentInput } from "../lib/server/ai/router.ts";
import { composeAiResponse } from "../lib/server/ai/response-composer.ts";
nextEnv.loadEnvConfig(process.cwd());
// Synthetic data only. No CRM, WhatsApp, calendar or payment functions imported.
const model = "gpt-4.1-mini";
const policy = { primaryProvider: "openai" as const, fallbackProviders: [], conversationModel: model, extractionModel: model,
  retrievalMode: "hybrid" as const, supportsToolCalling: true, supportsDeepReasoning: false, budgetMode: "conservative" as const };
const journeys = [
  { id: "furniture", business: "Loja ficticia de moveis. Armario Aurora: branco ou amadeirado. Nunca confirme preco, estoque, desconto ou frete sem ferramenta. Nao existe consulta de estoque executada neste teste.",
    turns: ["Quero o armario Aurora", "Branco", "Na verdade amadeirado. Entrega em Betim?", "Quero dois, consegue desconto?"] },
  { id: "meeting", business: "Consultoria ficticia de atendimento para lojas. Pode organizar uma conversa com a equipe. Nao possui disponibilidade de agenda consultada: nunca confirme reserva.",
    turns: ["Tenho uma loja, 3 pessoas atendendo no WhatsApp. Perdemos os retornos. Quero falar com voces.", "Pode ser uma reuniao amanha as 15h", "Na verdade as 16h", "Isso, obrigado. Nao precisa perguntar meu negocio de novo."] },
  { id: "support", business: "Loja ficticia de produtos. Suporte deve resolver problema antes de vender. Nao existe consulta de pedido ou reembolso executada.",
    turns: ["Meu pedido veio errado, comprei uma cadeira e chegou outra", "Quero trocar, nao quero comprar mais nada", "Nao tenho o numero do pedido aqui", "Pode chamar uma pessoa e explicar o que aconteceu?"] },
];
const results: Record<string, unknown>[] = [];
for (const journey of journeys) {
  const history: ConversationAgentInput["conversation"] = [];
  const turns: Record<string, unknown>[] = [];
  for (const [index, inboundText] of journey.turns.entries()) {
    const started = Date.now();
    const input: ConversationAgentInput = { tenantId: "synthetic-flow-evaluation", chatId: journey.id, inboundMessageId: `u${index}`, inboundText, channel: "whatsapp",
      assistantRole: journey.id === "support" ? "support" : "sales", toneOfVoice: "natural, direto e cordial", businessSummary: journey.business,
      objective: journey.id === "support" ? "Resolver a demanda ou encaminhar com contexto, sem upsell" : "Ajudar o cliente no proximo passo que ele pediu, sem questionario",
      guardrails: ["Nao invente fatos nem afirme efeito de ferramenta nao executada", "Nao repita perguntas respondidas no historico"],
      tier: "essential", autonomyMode: "copilot", reasoningLevel: "balanced", responseStyle: "concise", conversation: history, kbDocs: [], preferredProviders: ["openai"] };
    const generated = await runConversationAgent(input, policy);
    if (!generated.result || generated.providerFallbackTriggered || generated.result.fallbackUsed) throw Error(`Provider unavailable or fallback in ${journey.id}/${index}`);
    const draft = generated.result.responseText || "";
    const composed = composeAiResponse({ inboundText, draftText: draft, channel: "whatsapp", decision: generated.result.decision,
      previousOutboundText: history.filter(m => m.sender === "agent").at(-1)?.text });
    turns.push({ inboundText, draft, final: composed.text, decision: generated.result.decision, validation: composed.receipt, latencyMs: Date.now()-started,
      provider: generated.result.provider, model: generated.result.model });
    history.push({ id: `u${index}`, sender: "client", text: inboundText }, { id: `a${index}`, sender: "agent", text: composed.text });
    console.log(JSON.stringify({ journey: journey.id, turn: index+1, draftChanged: draft.trim() !== composed.text.trim(), decision: generated.result.decision }));
  }
  results.push({ id: journey.id, business: journey.business, turns });
}
const directory = ".qa-artifacts/client-readiness-20261019"; await mkdir(directory, { recursive: true });
const file = `${directory}/model-journeys-${Date.now()}.json`;
await writeFile(file, JSON.stringify({ capturedAt: new Date().toISOString(), model, synthetic: true,
  boundary: "router+response-composer only; not full agent, tools, persistence or WhatsApp", automatedNaturalnessApproval: false, results }, null, 2));
console.log(JSON.stringify({ artifact: file, journeys: results.length, modelTurns: 12, naturalnessRequiresReview: true }));
