export type SalesMotion =
  | "consultative"
  | "appointment"
  | "store_visit"
  | "assisted_purchase"
  | "direct_checkout"
  | "digital_delivery";

export type SalesLifecycle =
  | "new"
  | "awaiting_reply"
  | "engaged"
  | "objection"
  | "ready_to_close"
  | "nurture"
  | "post_sale"
  | "lost";

export type SalesAction =
  | "send_first_contact"
  | "reply_now"
  | "wait_for_reply"
  | "follow_up"
  | "handle_objection"
  | "send_proposal"
  | "send_checkout"
  | "offer_time_slots"
  | "schedule_visit"
  | "confirm_delivery"
  | "post_sale_checkin"
  | "suggest_next_offer"
  | "move_to_nurture"
  | "review_lost_reason";

export type SalesJourneyRecommendation = {
  lifecycle: SalesLifecycle;
  lifecycleLabel: string;
  motion: SalesMotion;
  motionLabel: string;
  action: SalesAction;
  actionLabel: string;
  urgency: "now" | "today" | "scheduled" | "waiting";
  reason: string;
  dueAt: string | null;
  waitHours: number | null;
  requiresTemplate: boolean;
  objective: string;
  messageBrief: string;
  suggestedMessage: string;
  objection: string | null;
  guardrails: string[];
};

type SalesJourneyInput = {
  lead: Record<string, unknown>;
  chats?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown> | null;
  now?: Date;
};

const MOTION_LABELS: Record<SalesMotion, string> = {
  consultative: "Venda consultiva",
  appointment: "Agendamento",
  store_visit: "Visita",
  assisted_purchase: "Compra assistida",
  direct_checkout: "Compra direta",
  digital_delivery: "Produto digital",
};

const LIFECYCLE_LABELS: Record<SalesLifecycle, string> = {
  new: "Novo contato",
  awaiting_reply: "Aguardando resposta",
  engaged: "Em conversa",
  objection: "Objeção em aberto",
  ready_to_close: "Pronto para fechar",
  nurture: "Nutrição",
  post_sale: "Pós-venda",
  lost: "Venda perdida",
};

const ACTION_LABELS: Record<SalesAction, string> = {
  send_first_contact: "Fazer primeiro contato",
  reply_now: "Responder agora",
  wait_for_reply: "Aguardar a resposta",
  follow_up: "Retomar a conversa",
  handle_objection: "Tratar a objeção",
  send_proposal: "Apresentar proposta",
  send_checkout: "Enviar forma de compra",
  offer_time_slots: "Oferecer horários",
  schedule_visit: "Agendar visita",
  confirm_delivery: "Confirmar entrega e acesso",
  post_sale_checkin: "Fazer pós-venda",
  suggest_next_offer: "Sugerir próxima oferta",
  move_to_nurture: "Manter em nutrição",
  review_lost_reason: "Revisar motivo da perda",
};

const WON_STAGES = new Set(["fechado", "ganho", "won", "cliente", "venda_concluida", "pago"]);
const LOST_STAGES = new Set(["perdido", "lost", "descartado"]);
const READY_STAGES = new Set(["proposta_enviada", "negociacao", "em_negociacao", "checkout_enviado", "avaliacao"]);

function text(value: unknown, max = 600) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function time(value: unknown) {
  if (typeof value === "number") return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value && typeof value === "object") {
    const source = value as { _seconds?: number; seconds?: number; toDate?: () => Date };
    if (typeof source.toDate === "function") return source.toDate().getTime();
    if (typeof source._seconds === "number") return source._seconds * 1000;
    if (typeof source.seconds === "number") return source.seconds * 1000;
  }
  return 0;
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function inferSalesMotion(input: SalesJourneyInput): SalesMotion {
  const context = record(input.settings?.businessContext);
  const company = record(context.company);
  const offer = record(context.offer);
  const sales = record(context.sales);
  const explicit = normalize(sales.motion || sales.salesMotion);
  if (["consultative", "appointment", "store_visit", "assisted_purchase", "direct_checkout", "digital_delivery"].includes(explicit)) {
    return explicit as SalesMotion;
  }

  const haystack = normalize([
    input.settings?.niche,
    input.settings?.businessProfileId,
    company.segment,
    company.description,
    offer.offeringType,
    offer.summary,
    sales.salesCycle,
    ...(Array.isArray(sales.goals) ? sales.goals : []),
  ].join(" "));

  if (includesAny(haystack, ["ebook", "e-book", "produto digital", "infoproduto", "curso online", "download"])) return "digital_delivery";
  if (includesAny(haystack, ["barbear", "salao", "clinica", "dentist", "estetica", "fisioter", "consulta", "agenda", "horario", "reserva"])) return "appointment";
  if (includesAny(haystack, ["imobili", "construtora", "showroom", "visita", "veiculo", "concessionaria"])) return "store_visit";
  if (includesAny(haystack, ["e-commerce", "ecommerce", "loja online", "shopify", "nuvemshop", "woocommerce", "varejo", "checkout"])) return "direct_checkout";
  if (includesAny(haystack, ["software", "b2b", "consultoria", "agencia", "enterprise", "projeto", "orcamento", "proposta"])) return "consultative";
  if (normalize(offer.offeringType) === "products") return "assisted_purchase";
  return "consultative";
}

function inferObjection(lead: Record<string, unknown>, chats: Array<Record<string, unknown>>) {
  const explicit = text(lead.aiDominantObjection || lead.dominantObjection || lead.objection, 120);
  if (explicit) return explicit;
  const latest = chats[0] || {};
  const haystack = normalize(`${lead.aiLastInboundText || ""} ${latest.lastMessage || ""}`);
  if (includesAny(haystack, ["caro", "preco", "valor", "desconto", "orcamento" ])) return "preço ou orçamento";
  if (includesAny(haystack, ["depois", "agora nao", "sem tempo", "outro momento"])) return "momento ou prioridade";
  if (includesAny(haystack, ["confio", "garantia", "funciona", "prova", "avaliacao"])) return "confiança ou risco";
  if (includesAny(haystack, ["frete", "entrega", "prazo", "estoque"])) return "entrega ou disponibilidade";
  if (includesAny(haystack, ["pensar", "falar com", "socio", "marido", "esposa"])) return "decisão compartilhada";
  return null;
}

function closeAction(motion: SalesMotion): SalesAction {
  if (motion === "appointment") return "offer_time_slots";
  if (motion === "store_visit") return "schedule_visit";
  if (motion === "direct_checkout" || motion === "digital_delivery" || motion === "assisted_purchase") return "send_checkout";
  return "send_proposal";
}

function cadenceHours(motion: SalesMotion, attempt: number) {
  const first: Record<SalesMotion, number> = {
    consultative: 24,
    appointment: 6,
    store_visit: 12,
    assisted_purchase: 8,
    direct_checkout: 4,
    digital_delivery: 8,
  };
  if (attempt <= 1) return first[motion];
  if (attempt === 2) return Math.max(24, first[motion] * 2);
  return 72;
}

function closingObjective(motion: SalesMotion) {
  if (motion === "appointment") return "Confirmar um horário específico com o menor atrito possível.";
  if (motion === "store_visit") return "Confirmar dia, horário e local da visita.";
  if (motion === "direct_checkout") return "Levar o cliente ao produto certo e concluir o pagamento.";
  if (motion === "digital_delivery") return "Concluir o pagamento e explicar como o acesso será entregue.";
  if (motion === "assisted_purchase") return "Confirmar a opção ideal e facilitar a compra.";
  return "Validar aderência e avançar para uma proposta ou decisão clara.";
}

function buildMessage(input: {
  action: SalesAction;
  lead: Record<string, unknown>;
  objection: string | null;
  motion: SalesMotion;
}) {
  const firstName = text(input.lead.nome || input.lead.name, 80).split(/\s+/)[0];
  const greeting = firstName ? `Oi, ${firstName}!` : "Oi!";
  const offer = text(input.lead.aiRecommendedOffer || input.lead.recommendedOffer || input.lead.serviceInterest, 140);
  const offerText = offer ? ` sobre ${offer}` : "";
  if (input.action === "send_first_contact") return `${greeting} Vi seu interesse${offerText}. Posso te fazer uma pergunta rápida para indicar a melhor opção?`;
  if (input.action === "follow_up") return `${greeting} Retomando nossa conversa${offerText}: isso ainda faz sentido para você ou prefere que eu encerre por aqui?`;
  if (input.action === "handle_objection") return `${greeting} Entendi seu ponto sobre ${input.objection || "essa decisão"}. O que precisaria ficar claro para você se sentir seguro em avançar?`;
  if (input.action === "offer_time_slots") return `${greeting} Posso deixar isso encaminhado. Você prefere o primeiro ou o segundo horário disponível?`;
  if (input.action === "schedule_visit") return `${greeting} O próximo passo é ver isso de perto. Qual dia e período funcionam melhor para sua visita?`;
  if (input.action === "send_checkout") return `${greeting} Pelo que conversamos, esta é a opção mais adequada${offerText}. Posso te enviar o link para concluir agora?`;
  if (input.action === "send_proposal") return `${greeting} Já tenho contexto para montar a melhor opção${offerText}. Posso te apresentar a recomendação com investimento e próximo passo?`;
  if (input.action === "post_sale_checkin") return `${greeting} Passando para confirmar se ficou tudo certo com sua compra e se posso ajudar em algo.`;
  if (input.action === "suggest_next_offer") return `${greeting} Com base no que você já comprou, existe uma próxima opção que pode complementar seu resultado. Quer que eu te explique em uma mensagem curta?`;
  return `${greeting} Recebi sua mensagem e vou te ajudar a avançar pelo caminho mais simples.`;
}

export function deriveSalesJourney(input: SalesJourneyInput): SalesJourneyRecommendation {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const lead = input.lead;
  const chats = [...(input.chats || [])].sort((a, b) => time(b.lastMessageTime || b.updatedAt) - time(a.lastMessageTime || a.updatedAt));
  const latest = chats[0] || {};
  const motion = inferSalesMotion(input);
  const stage = normalize(lead.pipelineStage || lead.stage || lead.status).replace(/\s+/g, "_");
  const objection = inferObjection(lead, chats);
  const lastInboundAt = Math.max(time(lead.lastInboundAt), time(lead.aiLastInboundAt), ...chats.map((chat) => time(chat.lastClientMessageAt)));
  const lastOutboundAt = Math.max(time(lead.lastOutboundAt), ...chats.map((chat) => time(chat.lastAgentMessageAt)));
  const lastInteractionAt = Math.max(lastInboundAt, lastOutboundAt, time(latest.lastMessageTime), time(lead.updatedAt), time(lead.createdAt));
  const channel = normalize(latest.channel || lead.channel || lead.origem);
  const attempt = Math.max(1, Number(latest.followUpCount || lead.followUpCount || lead.contactAttempts || 1));
  const isWon = WON_STAGES.has(stage) || Boolean(lead.convertedAt || lead.wonAt || lead.paidAt);
  const isLost = LOST_STAGES.has(stage);
  const inboundWaiting = lastInboundAt > 0 && lastInboundAt >= lastOutboundAt;
  const hasOutbound = lastOutboundAt > 0;
  const isReady = READY_STAGES.has(stage) || includesAny(normalize(lead.aiNextAction), ["proposta", "checkout", "agendar", "fechar"]);

  let lifecycle: SalesLifecycle = "new";
  let action: SalesAction = "send_first_contact";
  let urgency: SalesJourneyRecommendation["urgency"] = "today";
  let reason = "Ainda não há uma conversa registrada com este contato.";
  let waitHours: number | null = null;
  let dueAt: string | null = now.toISOString();

  if (isLost) {
    lifecycle = "lost";
    action = "review_lost_reason";
    urgency = "scheduled";
    reason = "A oportunidade está perdida; aprenda o motivo antes de tentar uma nova abordagem.";
    dueAt = null;
  } else if (isWon) {
    lifecycle = "post_sale";
    const saleAt = time(lead.paidAt || lead.wonAt || lead.convertedAt || lead.updatedAt);
    const daysSinceSale = saleAt ? (nowMs - saleAt) / 86_400_000 : 0;
    action = daysSinceSale >= 7 ? "suggest_next_offer" : "post_sale_checkin";
    urgency = daysSinceSale >= 1 ? "today" : "scheduled";
    reason = action === "suggest_next_offer"
      ? "A venda já foi concluída; use o histórico antes de sugerir complemento, recompra ou upgrade."
      : "Primeiro confirme entrega, acesso e satisfação; o upsell vem depois do valor entregue.";
    dueAt = action === "suggest_next_offer" ? now.toISOString() : new Date(Math.max(nowMs, saleAt + 24 * 3_600_000)).toISOString();
  } else if (objection && inboundWaiting) {
    lifecycle = "objection";
    action = "handle_objection";
    urgency = "now";
    reason = `O cliente trouxe uma objeção de ${objection}; responda com uma pergunta curta antes de argumentar.`;
  } else if (inboundWaiting) {
    lifecycle = isReady ? "ready_to_close" : "engaged";
    action = isReady ? closeAction(motion) : "reply_now";
    urgency = "now";
    reason = isReady ? `Há sinal de decisão; conduza para ${MOTION_LABELS[motion].toLowerCase()} sem criar uma etapa desnecessária.` : "A última mensagem é do cliente e precisa de resposta para manter o ritmo da conversa.";
  } else if (hasOutbound) {
    lifecycle = "awaiting_reply";
    waitHours = cadenceHours(motion, attempt);
    const elapsedSinceOutbound = Math.max(0, (nowMs - lastOutboundAt) / 3_600_000);
    const remaining = Math.max(0, waitHours - elapsedSinceOutbound);
    dueAt = new Date(nowMs + remaining * 3_600_000).toISOString();
    if (attempt >= 4 && elapsedSinceOutbound >= waitHours) {
      lifecycle = "nurture";
      action = "move_to_nurture";
      urgency = "scheduled";
      reason = "O limite de retomadas foi atingido; pare de insistir e mantenha o contato em nutrição com consentimento.";
      dueAt = null;
    } else if (elapsedSinceOutbound >= waitHours) {
      action = "follow_up";
      urgency = "today";
      reason = `Já passou a janela de ${waitHours}h deste tipo de venda; retome com contexto e uma pergunta simples.`;
    } else {
      action = "wait_for_reply";
      urgency = "waiting";
      reason = `A mensagem já foi enviada; aguarde antes de insistir e retome em aproximadamente ${Math.ceil(remaining)}h se não houver resposta.`;
    }
  }

  const requiresTemplate = channel.includes("whatsapp") && lastInboundAt > 0 && nowMs - lastInboundAt > 24 * 3_600_000;
  const objective = action === "handle_objection"
    ? "Reconhecer, entender a causa real, responder com prova adequada e combinar um próximo passo."
    : action === "follow_up"
      ? "Reabrir a conversa sem cobrança e obter uma resposta clara."
      : action === "post_sale_checkin" || action === "confirm_delivery"
        ? "Confirmar que a promessa foi entregue antes de fazer uma nova oferta."
        : action === "suggest_next_offer"
          ? "Aumentar valor para o cliente com uma oferta complementar baseada no histórico."
          : closingObjective(motion);
  const messageBrief = action === "handle_objection"
    ? "Acolha em uma frase, faça uma pergunta diagnóstica, responda só ao ponto real e termine com um próximo passo de baixo atrito."
    : action === "follow_up"
      ? "Retome o contexto, acrescente valor novo e termine com uma pergunta que possa ser respondida facilmente."
      : "Use o contexto já conhecido, seja direto e termine com uma única chamada para ação.";

  return {
    lifecycle,
    lifecycleLabel: LIFECYCLE_LABELS[lifecycle],
    motion,
    motionLabel: MOTION_LABELS[motion],
    action,
    actionLabel: ACTION_LABELS[action],
    urgency,
    reason,
    dueAt,
    waitHours,
    requiresTemplate,
    objective,
    messageBrief,
    suggestedMessage: buildMessage({ action, lead, objection, motion }),
    objection,
    guardrails: [
      "Não inventar preço, prazo, estoque, benefício ou condição.",
      "Não repetir perguntas que o cliente já respondeu.",
      "Respeitar pedido de parada e limite de retomadas.",
      ...(requiresTemplate ? ["No WhatsApp, usar template aprovado fora da janela de atendimento."] : []),
    ],
  };
}
