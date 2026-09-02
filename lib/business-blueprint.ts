import type { PipelineStageDefinition } from "./pipeline.ts";
import type { SalesMotion } from "./sales-journey.ts";

export type BusinessBlueprintInput = {
  company: {
    name: string;
    segment: string;
    description?: string;
    audience?: string;
    businessHours?: string;
    toneOfVoice?: string;
  };
  offer: {
    offeringType: "products" | "services" | "both";
    summary: string;
    paymentMethods?: string;
    deliveryPolicy?: string;
    exchangePolicy?: string;
    warrantyPolicy?: string;
  };
  sales: {
    salesMotion: SalesMotion;
    salesCycle?: string;
    averageTicket?: string;
    leadSources?: string[];
    serviceStyle?: "human" | "ai_assisted" | "ai_first";
    goals?: string[];
    commonQuestions?: string[];
    specialRules?: string[];
    operationNarrative?: string;
  };
};

export type BusinessBlueprintAutomation = {
  key: "first_response" | "reply_recovery" | "closing_action" | "post_sale";
  name: string;
  description: string;
  trigger: "lead_created" | "waiting_for_reply" | "ai_next_action" | "finance_paid";
  enabled: boolean;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
};

export type BusinessBlueprint = {
  version: 1;
  fingerprint: string;
  title: string;
  summary: string;
  salesMotion: SalesMotion;
  salesMotionLabel: string;
  pipeline: PipelineStageDefinition[];
  qualificationFields: Array<{ id: string; label: string; required: boolean; reason: string }>;
  suggestedTags: string[];
  cadence: {
    firstFollowUpHours: number;
    secondFollowUpHours: number;
    finalFollowUpHours: number;
    maxAttempts: number;
    afterLimit: "nurture";
  };
  objections: Array<{ id: string; label: string; guidance: string }>;
  closing: { objective: string; primaryAction: string; callToAction: string };
  postSale: Array<{ afterHours: number; action: string; objective: string }>;
  aiPolicy: {
    autonomy: "copilot" | "hybrid" | "autonomous";
    toneOfVoice: string;
    guardrails: string[];
    handoffWhen: string[];
  };
  automations: BusinessBlueprintAutomation[];
  generatedFrom: string[];
};

const COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444"];

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function slug(value: string) {
  return clean(value, 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function fingerprint(value: unknown) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `bp_${(hash >>> 0).toString(36)}`;
}

function stages(items: Array<[string, string, string, number | null, number | null, boolean?]>): PipelineStageDefinition[] {
  return items.map(([id, label, description, slaHours, followUpHours, isTerminal], position) => ({
    id,
    label,
    description,
    color: COLORS[position] || COLORS[0],
    position,
    isTerminal: Boolean(isTerminal),
    slaHours,
    followUpHours,
  }));
}

function pipelineFor(motion: SalesMotion) {
  if (motion === "appointment") return stages([
    ["novo", "Novo contato", "Entrada ainda não atendida.", 1, 1],
    ["conversa", "Em conversa", "Necessidade sendo entendida.", 4, 4],
    ["qualificado", "Serviço definido", "Serviço e condições principais confirmados.", 8, 6],
    ["horario_oferecido", "Horários oferecidos", "Cliente escolhendo uma opção de agenda.", 6, 4],
    ["agendado", "Agendado", "Horário confirmado.", 24, 12],
    ["realizado", "Realizado", "Atendimento concluído.", null, null, true],
    ["perdido", "Não avançou", "Contato encerrado ou sem aderência.", null, null, true],
  ]);
  if (motion === "store_visit") return stages([
    ["novo", "Novo contato", "Entrada ainda não atendida.", 2, 2],
    ["conversa", "Em conversa", "Interesse sendo entendido.", 8, 6],
    ["perfil_validado", "Perfil validado", "Necessidade e capacidade confirmadas.", 24, 12],
    ["visita_agendada", "Visita agendada", "Data e local confirmados.", 24, 12],
    ["proposta", "Proposta", "Condição comercial apresentada.", 48, 24],
    ["ganho", "Venda concluída", "Negócio convertido.", null, null, true],
    ["perdido", "Não avançou", "Negócio perdido ou arquivado.", null, null, true],
  ]);
  if (motion === "direct_checkout" || motion === "digital_delivery") return stages([
    ["novo", "Novo contato", "Entrada ainda não atendida.", 1, 1],
    ["conversa", "Em conversa", "Dúvidas e intenção de compra.", 4, 4],
    ["produto_definido", "Opção definida", "Produto ou oferta escolhida.", 6, 4],
    ["checkout_enviado", "Pagamento enviado", "Link ou instrução de pagamento entregue.", 6, 4],
    ["pago", "Pago", "Pagamento confirmado.", 24, 12],
    ["pos_venda", "Pós-venda", "Entrega, acesso e satisfação acompanhados.", null, null, true],
    ["perdido", "Não comprou", "Compra não concluída.", null, null, true],
  ]);
  if (motion === "assisted_purchase") return stages([
    ["novo", "Novo contato", "Entrada ainda não atendida.", 1, 1],
    ["conversa", "Em conversa", "Necessidade sendo entendida.", 6, 4],
    ["opcao_recomendada", "Opção recomendada", "Oferta adequada apresentada.", 8, 6],
    ["pagamento", "Em pagamento", "Compra sendo concluída.", 8, 6],
    ["ganho", "Venda concluída", "Pagamento confirmado.", null, null, true],
    ["perdido", "Não comprou", "Compra não concluída.", null, null, true],
  ]);
  return stages([
    ["novo", "Novo contato", "Entrada ainda não atendida.", 2, 2],
    ["conversa", "Em conversa", "Contexto inicial sendo entendido.", 12, 8],
    ["qualificacao", "Qualificação", "Aderência, urgência e decisão sendo validadas.", 24, 12],
    ["proposta", "Proposta", "Solução e investimento apresentados.", 48, 24],
    ["negociacao", "Decisão", "Objeções e condições finais.", 24, 12],
    ["ganho", "Venda concluída", "Negócio convertido.", null, null, true],
    ["perdido", "Não avançou", "Negócio perdido ou arquivado.", null, null, true],
  ]);
}

const MOTION_CONFIG: Record<SalesMotion, { label: string; followUp: number; action: string; cta: string; objective: string }> = {
  appointment: { label: "Agendamento", followUp: 6, action: "Oferecer horários", cta: "Escolher um horário disponível", objective: "Confirmar o melhor horário com o menor atrito." },
  store_visit: { label: "Visita", followUp: 12, action: "Agendar visita", cta: "Escolher dia e período", objective: "Levar o contato qualificado para uma visita confirmada." },
  direct_checkout: { label: "Compra direta", followUp: 4, action: "Enviar checkout", cta: "Concluir o pagamento", objective: "Levar o cliente ao produto certo e concluir a compra." },
  digital_delivery: { label: "Produto digital", followUp: 8, action: "Enviar checkout e acesso", cta: "Comprar e receber acesso", objective: "Concluir pagamento e deixar a entrega digital clara." },
  assisted_purchase: { label: "Compra assistida", followUp: 8, action: "Confirmar opção e pagamento", cta: "Escolher a opção indicada", objective: "Ajudar o cliente a escolher e comprar na própria conversa." },
  consultative: { label: "Venda consultiva", followUp: 24, action: "Apresentar recomendação", cta: "Avançar para proposta ou decisão", objective: "Validar aderência e conduzir para uma decisão comercial clara." },
};

function qualificationFor(motion: SalesMotion) {
  const common = [
    { id: "need", label: "Necessidade principal", required: true, reason: "Evita recomendar uma oferta sem contexto." },
    { id: "offer", label: "Produto ou serviço de interesse", required: true, reason: "Conecta conversa, catálogo e próxima ação." },
  ];
  if (motion === "appointment") return [...common, { id: "availability", label: "Disponibilidade", required: true, reason: "Permite oferecer horários úteis." }];
  if (motion === "store_visit") return [...common, { id: "location", label: "Localização e período", required: true, reason: "Permite confirmar uma visita viável." }];
  if (motion === "direct_checkout" || motion === "digital_delivery" || motion === "assisted_purchase") return [...common, { id: "purchase_constraint", label: "Preferência ou restrição", required: false, reason: "Ajuda a indicar a opção certa sem interrogatório." }];
  return [...common, { id: "urgency", label: "Prazo ou urgência", required: true, reason: "Ajuda a priorizar e construir a proposta." }, { id: "decision", label: "Como a decisão será tomada", required: false, reason: "Evita perder a oportunidade depois da proposta." }];
}

export function generateBusinessBlueprint(input: BusinessBlueprintInput): BusinessBlueprint {
  const config = MOTION_CONFIG[input.sales.salesMotion];
  const segmentTag = slug(input.company.segment) || "negocio";
  const specialRules = (input.sales.specialRules || []).map((item) => clean(item, 240)).filter(Boolean);
  const autonomy = input.sales.serviceStyle === "ai_first" ? "autonomous" : input.sales.serviceStyle === "human" ? "copilot" : "hybrid";
  const blueprint: Omit<BusinessBlueprint, "fingerprint"> = {
    version: 1,
    title: `Operação comercial — ${clean(input.company.name, 120)}`,
    summary: `${clean(input.company.name, 120)} vende ${clean(input.offer.summary, 260)} para ${clean(input.company.audience, 160) || "seu público"}. A conversão principal acontece por ${config.label.toLowerCase()}.`,
    salesMotion: input.sales.salesMotion,
    salesMotionLabel: config.label,
    pipeline: pipelineFor(input.sales.salesMotion),
    qualificationFields: qualificationFor(input.sales.salesMotion),
    suggestedTags: Array.from(new Set([segmentTag, "novo_contato", "em_conversa", "cliente", "retomar", input.sales.salesMotion])).slice(0, 10),
    cadence: { firstFollowUpHours: config.followUp, secondFollowUpHours: Math.max(24, config.followUp * 2), finalFollowUpHours: 72, maxAttempts: 4, afterLimit: "nurture" },
    objections: [
      { id: "price", label: "Preço ou orçamento", guidance: "Entender a comparação e o impacto esperado antes de defender preço ou oferecer desconto." },
      { id: "timing", label: "Momento ou prioridade", guidance: "Descobrir se falta urgência, condição ou apenas um momento combinado para retomar." },
      { id: "trust", label: "Confiança ou risco", guidance: "Responder com política, prova ou informação verificável; nunca inventar garantia." },
      { id: "fit", label: "Adequação da oferta", guidance: "Confirmar a necessidade real e recomendar somente uma opção compatível." },
    ],
    closing: { objective: config.objective, primaryAction: config.action, callToAction: config.cta },
    postSale: [
      { afterHours: 24, action: "Confirmar entrega, acesso ou atendimento", objective: "Garantir que a promessa inicial foi cumprida." },
      { afterHours: 168, action: "Verificar satisfação", objective: "Resolver atritos antes de oferecer algo novo." },
      { afterHours: 720, action: "Avaliar recompra, complemento ou upgrade", objective: "Sugerir somente uma oferta coerente com o histórico." },
    ],
    aiPolicy: {
      autonomy,
      toneOfVoice: clean(input.company.toneOfVoice, 160) || "claro, humano e objetivo",
      guardrails: Array.from(new Set(["Não inventar preço, estoque, prazo, benefício ou condição.", "Não repetir perguntas já respondidas.", "Não oferecer desconto sem regra cadastrada.", "Respeitar pedido de parada e consentimento.", ...specialRules])).slice(0, 20),
      handoffWhen: ["Pedido explícito por uma pessoa", "Reclamação, cancelamento ou risco jurídico", "Condição comercial fora das regras", "Baixa confiança em informação necessária"],
    },
    automations: [
      { key: "first_response", name: "Primeira ação comercial", description: "Prioriza cada entrada nova e cria uma ação clara para o time.", trigger: "lead_created", enabled: true, conditions: {}, actions: [{ type: "create_task", title: config.action, taskType: "follow_up", priority: "high", dueInHours: 1, sequenceOrder: 1 }] },
      { key: "reply_recovery", name: "Retomar no momento certo", description: "Agenda a retomada sem disparar mensagens automáticas antes de revisão.", trigger: "waiting_for_reply", enabled: true, conditions: { waitAtLeastHours: config.followUp }, actions: [{ type: "create_task", title: "Revisar contexto e retomar a conversa", taskType: "follow_up", priority: "medium", dueInHours: config.followUp, sequenceOrder: 1 }] },
      { key: "closing_action", name: "Executar próximo passo da IA", description: `Transforma sinais de fechamento em tarefa adequada para ${config.label.toLowerCase()}.`, trigger: "ai_next_action", enabled: true, conditions: { aiNextActionIn: ["oferecer_horarios_disponiveis", "agendar_visita", "enviar_checkout_e_concluir_compra", "confirmar_opcao_e_facilitar_pagamento", "preparar_proposta_comercial"] }, actions: [{ type: "create_task", title: config.action, taskType: "follow_up", priority: "high", dueInHours: 1, sequenceOrder: 1 }] },
      { key: "post_sale", name: "Cuidar depois da venda", description: "Inicia entrega e pós-venda depois da confirmação financeira.", trigger: "finance_paid", enabled: true, conditions: {}, actions: [{ type: "create_task", title: "Confirmar entrega e satisfação inicial", taskType: "pos_venda", priority: "medium", dueInHours: 24, sequenceOrder: 1 }] },
    ],
    generatedFrom: ["descrição da empresa", "ofertas", "modelo de fechamento", "ciclo comercial", "regras", ...(input.sales.operationNarrative ? ["relato livre da operação"] : [])],
  };
  return { ...blueprint, fingerprint: fingerprint(blueprint) };
}
