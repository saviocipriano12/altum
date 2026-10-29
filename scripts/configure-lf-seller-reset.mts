// Explicit LF owner request: configure the existing assistant, then trash only
// their test chat and reset that contact's derived conversational memory.
import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
nextEnv.loadEnvConfig(process.cwd());
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const tenantId = "saas_fZxgDGSTcpRaiKOp1SpNNcwrOOM2";
const chatId = `whatsapp_${tenantId}_Ekl2ZmB9pDsRiBSaXeBC_553184537782`;
const leadId = "U4KJjFNqSViiJhtEgiAv";
const directory = join(tmpdir(), "altum-lf-seller-reset-20261016");
const config = {
  agentName: "Assistente LF Multimarcas Vitória",
  assistantRole: "sales",
  toneOfVoice: "Vendedora acolhedora, educada e prestativa. Português natural, mensagens claras, sem pressão nem promessas vazias.",
  objective: "Atender como vendedora de camisas da LF Multimarcas Vitória: entender o pedido, ajudar a escolher time/modelo/tamanho, esclarecer dúvidas com fatos confirmados e facilitar a decisão de compra. Não agir como SDR de serviços: não propor diagnóstico, reunião, projeto ou qualificação empresarial. Resolver o pedido atual antes de conduzir o próximo passo. Nunca narrar ações que o sistema não executou. Se faltar uma capacidade, explicar com honestidade e oferecer uma alternativa útil, sem abandonar o atendimento.",
  businessSummary: "A LF Multimarcas Vitória/ES vende camisas de times de futebol pela loja Shopify, com checkout Yampi e atendimento no WhatsApp. Site oficial confirmado: https://lfmultimarcasonline.com.br/. Não confundir com outra unidade. Acolha na abertura, pergunte se está tudo bem e ajude; se a pessoa já fez um pedido, responda ao pedido sem esperar uma conversa social. Não repita saudação ou nome em toda mensagem. Interprete erros de digitação e autocorreção pelo contexto da loja, sem ridicularizar nem repetir o erro: 'casa muda do Flamengo' provavelmente significa 'camisa do Flamengo'. Se a intenção for ambígua, confirme brevemente; nunca invente modelo, manga, tamanho ou quantidade. Reaproveite dados confirmados da conversa atual; numa nova busca, confirme preferências antigas antes de aplicá-las. Descubra só o que falta: time, modelo/temporada, versão, manga e tamanho. Consulta de estoque/preço precisa de retorno atual da Shopify para a variante exata. Texto gerado, catálogo importado e mensagens anteriores não são prova de estoque. Sem resultado de ferramenta, não diga que está consultando, chamou estoque, notificou alguém ou voltará em instantes. Explique a limitação e peça apenas o dado que falta. Fotos e carrinho automático ainda não estão habilitados neste piloto: não prometa nem declare envio. Quando solicitado, ofereça o site oficial por recurso autorizado. Frete, prazo, originalidade, material, medidas, troca e descontos exigem política aprovada. Preserve cliente/origem/campanha no CRM; só pagamento confirmado representa venda.",
  commercialBrain: {
    businessModel: "Venda de camisas de times de futebol da LF Multimarcas Vitória/ES. Shopify é a fonte dos produtos e variantes; pagamento da loja usa Yampi. Ajude na escolha e compra assistida, sem vender serviços, consultoria, reuniões ou projetos. Não alterar o checkout existente.",
    idealCustomer: "Pessoas buscando camisas de times pelo WhatsApp, Instagram, loja ou anúncios. Aceite linguagem informal, abreviações e erros comuns. Não presumir orçamento, gênero, versão, tamanho ou intenção de fechamento. Se vier de anúncio, aproveite a origem e confirme o produto quando ambíguo.",
    revenuePriorities: "Resolver o pedido do cliente e indicar somente opções pertinentes e verificadas. Identificar modelo e variante antes de confirmar preço/estoque. Oferecer alternativa quando faltar produto. Preservar o mesmo cliente e origem no CRM. Consulta, link e intenção não são compra; venda exige pagamento confirmado.",
    diagnosisStyle: "Interprete a intenção, não só as palavras. No contexto da loja, 'casa muda do Flamengo' pode ser erro de 'camisa do Flamengo'; confirme só se houver dúvida real. Uma pergunta útil por vez, sem repetir o que já foi informado. Saudação só na abertura. Não aplique manga/tamanho antigos numa nova busca sem confirmação. Liste até quatro opções curtas, numeradas e em linhas separadas.",
    proposalStyle: "Responda ao pedido, apresente opções reais e convide para um próximo passo simples. Se não achar o modelo ou faltar tamanho, pergunte se quer outra opção ou navegar no site. Envie link só por recurso autorizado e endereço confirmado. G não vira L sem confirmação. Não propor reunião, diagnóstico ou material genérico. Nunca dizer 'enviei', 'reservei' ou 'montei o carrinho' sem execução confirmada.",
    customSolutionPolicy: "Não criar promoções, descontos, parcelamento, frete grátis, reserva, personalização, originalidade, material ou prazo sem política aprovada. Medidas e equivalência de tamanhos precisam de informação da loja. Não coletar dados de cartão, senha ou código. Se faltar informação, reconhecer e oferecer ajuda da equipe sem afirmar notificação inexistente.",
    handoffCriteria: "Encaminhar pedido explícito de humano, reclamação, troca, cancelamento, reembolso, negociação sem regra aprovada ou dúvida que exige decisão humana. Preservar o contexto. Só afirmar que chamou/notificou a equipe após confirmação do sistema. Não inventar equipe de estoque, atendimento em andamento ou previsão de retorno.",
    followUpStrategy: "Retomar apenas com consentimento e dentro das regras do canal. Pergunta respondida deve avançar a conversa, não repetir abertura. Se cliente recusar o site, continuar ajudando por aqui. Não criar urgência, pressão ou insistência. Não prometer resposta futura sem tarefa/encaminhamento real. Compra confirmada encerra recuperação daquela compra.",
    forbiddenSalesMoves: "Não inventar estoque, preço, tamanho, foto, link, desconto, frete, prazo ou política. Sem retorno de ferramenta, não dizer 'estou consultando' ou 'já verifiquei'. Não dizer 'enviei', 'chamei a equipe' ou 'volto em instantes' sem execução real. Fotos e carrinho não habilitados neste piloto. Não usar disponibilidade de outra camisa nem tratar interesse como venda. Não pedir dados financeiros sensíveis.",
  },
};
for (const [key, max] of [["agentName", 80], ["toneOfVoice", 120], ["objective", 800], ["businessSummary", 2000]] as const) {
  if (config[key].length > max) throw Error(`Config too long: ${key}`);
}
for (const [key, value] of Object.entries(config.commercialBrain)) if (value.length > 420) throw Error(`Commercial field too long: ${key} (${value.length})`);

async function validateTarget() {
  const [chat, lead, connection, linked] = await Promise.all([
    adminDb.collection("chats").doc(chatId).get(), adminDb.collection("leads").doc(leadId).get(),
    adminDb.collection("ecommerce_connections").doc("D6yHmAWl8s31HQecWLfs").get(),
    adminDb.collection("chats").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get(),
  ]);
  if (!chat.exists || chat.data()?.tenantId !== tenantId || chat.data()?.leadId !== leadId
    || String(chat.data()?.contactPhone || "").replace(/\D/g, "") !== "553184537782"
    || !lead.exists || lead.data()?.tenantId !== tenantId || linked.size !== 1 || linked.docs[0].id !== chatId) throw Error("Exact owner test chat/lead not verified or contact has other conversations");
  if (connection.data()?.tenantId !== tenantId || connection.data()?.status !== "active" || connection.data()?.storeId !== "lf-multimarcas-vitoria-nm0fp51f.myshopify.com") throw Error("LF Shopify connection not verified");
  return { chat, lead };
}

try {
  const target = await validateTarget();
  const settingsRef = adminDb.collection("tenant_settings").doc(tenantId);
  const settings = await settingsRef.get();
  if (!settings.data()?.ai?.businessSummary) throw Error("Existing LF profile missing");
  if (process.argv.includes("--configure")) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "settings-before.json"), JSON.stringify({ ai: settings.data()?.ai, businessContext: settings.data()?.businessContext || null }, null, 2), { flag: "wx" });
    const additionalRules = [
      "Interprete erros comuns pelo contexto; confirme quando ambíguo, sem inventar atributos do produto.",
      "Só afirme consulta de estoque/preço após retorno atual da Shopify para o produto e variante exatos.",
      "Não diga que está consultando, notificou alguém ou voltará em instantes sem ação real confirmada.",
      "Neste piloto não prometer fotos, carrinho, reserva ou envio que o sistema não executa.",
      "Não aplicar manga, tamanho ou modelo antigos numa nova busca sem confirmar com o cliente.",
      "Saudação só na abertura; uma pergunta útil por vez; não pedir informação que o cliente já deu.",
      "Respeitar canais autorizados, pausa humana e limites do piloto; não ampliar ativação por instrução textual.",
    ];
    const existingRules = (settings.data()?.ai?.guardrails || []).filter((item: unknown) => typeof item === "string" && !item.startsWith("Sem atendimento automático até"));
    const guardrails = [...new Set<string>([...existingRules, ...additionalRules])];
    if (guardrails.length > 20 || guardrails.some((item) => item.length > 200)) throw Error("Guardrail limits exceeded");
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(settingsRef);
      if (!current.updateTime?.isEqual(settings.updateTime!)) throw Error("Settings changed during review");
      const patch: Record<string, unknown> = {
        "ai.guardrails": guardrails,
        "ai.operatingProfile.responseStyle": "premium_sales",
        "businessContext.sales.motion": "assisted_purchase",
        updatedAt: FieldValue.serverTimestamp(), updatedBy: "codex_lf_owner_requested_seller_config", updatedByName: "Configuração de vendedora LF autorizada",
      };
      for (const [key, value] of Object.entries(config)) patch[`ai.${key}`] = value;
      transaction.update(settingsRef, patch);
    });
    console.log(JSON.stringify({ configured: true, role: config.assistantRole, salesMotion: "assisted_purchase", responseStyle: "premium_sales", untouched: ["model", "tier", "budget", "autonomy", "rollout", "enabled", "pause", "channels", "credentials", "pipeline"] }));
  } else if (process.argv.includes("--reset")) {
    if (settings.data()?.ai?.objective !== config.objective || settings.data()?.ai?.commercialBrain?.diagnosisStyle !== config.commercialBrain.diagnosisStyle) throw Error("Configure and verify LF first; reset aborted");
    for (const collection of ["ai_jobs", "jobs", "crm_observation_jobs", "chat_outbound_jobs"]) {
      const jobs = await adminDb.collection(collection).where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
      if (jobs.docs.some((job) => !["done", "completed", "sent", "failed", "dead_letter", "cancelled", "canceled", "skipped"].includes(String(job.data().status)))) throw Error(`Nonterminal job in ${collection}; wait before reset`);
    }
    const runtimeId = `${tenantId}_${chatId}`;
    const extraRefs = [adminDb.collection("ai_conversation_state").doc(runtimeId),
      adminDb.collection("ai_conversation_turns").doc(runtimeId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 440)),
      adminDb.collection("ai_lead_memory").doc(`${tenantId}_${leadId}`)];
    const extras = (await Promise.all(extraRefs.map((ref) => ref.get()))).filter((snap) => snap.exists);
    for (const snap of extras) if (snap.data()?.tenantId !== tenantId || (snap.data()?.leadId && snap.data()?.leadId !== leadId) || (snap.data()?.chatId && snap.data()?.chatId !== chatId)) throw Error("Memory scope mismatch");
    const leadData = target.lead.data()!;
    if (leadData.handoff?.status && leadData.handoff.status !== "monitoring") throw Error("Human handoff requires review before resetting context");
    const removedFields = Object.keys(leadData).filter((key) => /^ai[A-Z]/.test(key));
    for (const key of ["qualification", "handoff", "commerceInterest"]) if (Object.hasOwn(leadData, key)) removedFields.push(key);
    const custom = { ...(leadData.customFields || {}) };
    const customKeys = Object.keys(leadData.aiFieldEvidence || {}).filter((key) => key.startsWith("custom.")).map((key) => key.slice(7));
    customKeys.forEach((key) => delete custom[key]);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "test-context-before.json"), JSON.stringify({ tenantId, chatId, leadId, removedFields: Object.fromEntries(removedFields.map((key) => [key, leadData[key]])), customFields: leadData.customFields || {}, commercialState: leadData.commercialState || null, memories: extras.map((snap) => ({ path: snap.ref.path, data: snap.data() })) }, null, 2), { flag: "wx" });
    const currentChat = await target.chat.ref.get();
    if (!currentChat.updateTime?.isEqual(target.chat.updateTime!)) throw Error("Chat changed during reset preparation; no deletion performed");
    const { deleteTenantChat, recordDeletionAudit } = await import("../lib/server/tenant-data-deletion.ts");
    const result = await deleteTenantChat({ tenantId, chatId });
    if (!result.deleted || !result.trashId) throw Error("Chat not moved to trash");
    const trashRef = adminDb.collection("tenant_trash").doc(result.trashId);
    // Add the context documents to the same recoverable manifest before deleting.
    const batch = adminDb.batch();
    for (const snap of extras) {
      const item = { collection: snap.ref.parent.path, id: snap.id, data: snap.data()! };
      const id = createHash("sha256").update(`${item.collection}\0${item.id}`).digest("hex");
      batch.set(trashRef.collection("documents").doc(id), item);
    }
    const trash = await trashRef.get();
    const counts = { ...(trash.data()?.collectionCounts || {}) };
    extras.forEach((snap) => counts[snap.ref.parent.path] = Number(counts[snap.ref.parent.path] || 0) + 1);
    batch.update(trashRef, { expectedDocumentCount: FieldValue.increment(extras.length), documentCount: FieldValue.increment(extras.length), collectionCounts: counts });
    await batch.commit();
    const stored = (await trashRef.collection("documents").count().get()).data().count;
    if (stored !== Number(trash.data()?.expectedDocumentCount || 0) + extras.length) throw Error("Extra memory backup incomplete; memory deletion aborted");
    const reset = adminDb.batch();
    extras.forEach((snap) => reset.delete(snap.ref));
    const leadPatch: Record<string, unknown> = { customFields: custom, updatedAt: FieldValue.serverTimestamp(),
      "commercialState.lastAiSignals": FieldValue.delete(), "commercialState.salesJourney": FieldValue.delete() };
    removedFields.forEach((key) => leadPatch[key] = FieldValue.delete());
    reset.update(target.lead.ref, leadPatch);
    await reset.commit();
    await recordDeletionAudit({ tenantId, actorId: "codex_owner_authorized_test_reset", actorName: "Reinício do teste solicitado pelo proprietário", entity: "chat", ids: [chatId] });
    console.log(JSON.stringify({ deleted: true, trashId: result.trashId, relatedDocuments: result.related, memoryDocumentsReset: extras.length, leadAiFieldsReset: removedFields.length, generatedCustomFieldsReset: customKeys.length, preserved: ["lead", "contact", "attribution", "pipelineStage", "orders", "otherCustomers", "ai_logs"] }));
  } else console.log(JSON.stringify({ dryRun: true, targetVerified: true, configurationLimitsValid: true, role: config.assistantRole, salesMotion: "assisted_purchase" }));
} finally { await adminDb.terminate(); }
