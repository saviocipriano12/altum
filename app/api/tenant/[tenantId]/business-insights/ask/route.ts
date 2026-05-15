import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";

type Row = { id: string } & Record<string, unknown>;

type AskBody = {
  question?: string;
};

function clean(value: unknown, max = 280) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalize(value: unknown) {
  return clean(value, 400)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isWithinDays(value: unknown, days: number) {
  const date = toDate(value);
  if (!date) return false;
  return date.getTime() >= Date.now() - days * 86400000;
}

function rowFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): Row {
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) };
}

async function listTenantRows(collectionName: string, tenantId: string, limit: number): Promise<Row[]> {
  const snap = await adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(limit).get();
  return snap.docs.map(rowFromDoc);
}

function stageLabel(value: unknown) {
  const stage = normalizePipelineStageId(value || "captado");
  if (stage === "captado") return "Captado";
  if (stage === "contato") return "Contato";
  if (stage === "qualificacao") return "Qualificacao";
  if (stage === "proposta") return "Proposta";
  if (stage === "fechamento") return "Fechamento";
  if (stage === "ganho") return "Ganho";
  if (stage === "perdido") return "Perdido";
  return stage;
}

function topCounts(items: string[], fallback = "Sem categoria") {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const label = clean(item, 80) || fallback;
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function isOpenChat(item: Row) {
  const status = normalize(item.status || item.queueStatus || "open");
  return !["resolved", "archived", "closed", "done"].includes(status);
}

function isPendingTask(item: Row) {
  return normalize(item.status || "pending") !== "done";
}

function isOverdueTask(item: Row) {
  if (!isPendingTask(item)) return false;
  const dueAt = toDate(item.dueAt);
  return Boolean(dueAt && dueAt.getTime() < Date.now());
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSources(collections: string[]) {
  return collections.map((collection) => ({ collection }));
}

function hasAny(question: string, words: string[]) {
  return words.some((word) => question.includes(word));
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const body = (await req.json()) as AskBody;
    const question = clean(body.question, 500);
    const q = normalize(question);

    if (!question) {
      return NextResponse.json({ error: "Pergunta vazia." }, { status: 400 });
    }

    const [
      leads,
      chats,
      tasks,
      appointments,
      kbDocs,
      aiLogs,
      campaignSnapshots,
      outboundCampaigns,
      finance,
      ecommerceConnections,
      ecommerceProducts,
      ecommerceOrders,
      ecommerceCarts,
      ecommerceActions,
    ] = await Promise.all([
      listTenantRows("leads", tenantId, 500),
      listTenantRows("chats", tenantId, 350),
      listTenantRows("lead_tasks", tenantId, 500),
      listTenantRows("appointments", tenantId, 250),
      listTenantRows("kb_docs", tenantId, 250),
      listTenantRows("ai_logs", tenantId, 350),
      listTenantRows("campaign_snapshots", tenantId, 350),
      listTenantRows("outbound_campaigns", tenantId, 200),
      listTenantRows("financeiro", tenantId, 300),
      listTenantRows("ecommerce_connections", tenantId, 80),
      listTenantRows("ecommerce_products", tenantId, 500),
      listTenantRows("ecommerce_orders", tenantId, 500),
      listTenantRows("ecommerce_abandoned_carts", tenantId, 300),
      listTenantRows("ecommerce_commercial_actions", tenantId, 400),
    ]);

    const recentLeads = leads.filter((item) => isWithinDays(item.createdAt, 30));
    const openChats = chats.filter(isOpenChat);
    const pendingTasks = tasks.filter(isPendingTask);
    const overdueTasks = tasks.filter(isOverdueTask);
    const recentAiLogs = aiLogs.filter((item) => isWithinDays(item.createdAt, 14));
    const handoffs = recentAiLogs.filter((item) => normalize(item.decision) === "handoff");
    const lowConfidence = recentAiLogs.filter((item) => typeof item.confidence === "number" && Number(item.confidence) < 0.55);
    const catalogDocs = kbDocs.filter((item) => normalize(item.type) === "catalog");
    const policyDocs = kbDocs.filter((item) => normalize(item.type) === "policy");
    const faqDocs = kbDocs.filter((item) => normalize(item.type) === "faq");
    const activeStores = ecommerceConnections.filter((item) => normalize(item.status) === "active");
    const recentOrders = ecommerceOrders.filter((item) => isWithinDays(item.orderedAt || item.createdAt || item.updatedAt, 30));
    const abandonedCarts = ecommerceCarts.filter((item) => normalize(item.status) === "abandoned");
    const recentAbandonedCarts = abandonedCarts.filter((item) => isWithinDays(item.lastActivityAt || item.createdAt || item.updatedAt, 14));
    const pendingEcommerceActions = ecommerceActions.filter((item) => normalize(item.status || "pending") === "pending");
    const recentSnapshots = campaignSnapshots.filter((item) => isWithinDays(item.createdAt || item.updatedAt || item.date, 30));
    const totalSpend = recentSnapshots.reduce((sum, item) => sum + numberValue(item.spend), 0);
    const paidFinance = finance
      .filter((item) => ["pago", "em dia", "paid"].includes(normalize(item.status)))
      .reduce((sum, item) => sum + numberValue(item.valor || item.amount), 0);
    const pendingFinance = finance
      .filter((item) => ["pendente", "atrasado", "pending"].includes(normalize(item.status)))
      .reduce((sum, item) => sum + numberValue(item.valor || item.amount), 0);

    const stageCounts = topCounts(leads.map((lead) => stageLabel(lead.pipelineStage || lead.stage)));
    const channelCounts = topCounts(
      leads.map((lead) => clean(lead.sourceLabel || lead.origem || lead.channel || lead.source, 80)),
      "Sem origem"
    );
    const productCategories = topCounts(
      [...catalogDocs.map((doc) => clean(doc.productCategory || "", 80)), ...ecommerceProducts.map((doc) => clean(doc.category || "", 80))],
      "Sem categoria"
    );
    const ecommerceProviders = topCounts(
      ecommerceConnections.map((item) => clean(item.displayName || item.provider, 80)),
      "Loja sem nome"
    );
    const purchasedProducts = topCounts(
      ecommerceOrders.flatMap((order) => (Array.isArray(order.purchasedProductNames) ? order.purchasedProductNames : [])).map((item) => clean(item, 100)),
      "Produto sem nome"
    );
    const handoffReasons = topCounts(
      handoffs.map((log) => clean(log.reason || log.objectionType || log.responseGoal, 120)),
      "Sem motivo"
    );

    let title = "Resumo da operacao";
    let answer: string[] = [
      `A operacao tem ${leads.length} cliente(s)/oportunidade(s), ${openChats.length} conversa(s) aberta(s) e ${pendingTasks.length} tarefa(s) pendente(s).`,
      `Nos ultimos 30 dias entraram ${recentLeads.length} lead(s).`,
      `Financeiro registrado: ${money(paidFinance)} recebido e ${money(pendingFinance)} pendente.`,
      ecommerceConnections.length
        ? `Ecommerce: ${activeStores.length} loja(s) ativa(s), ${ecommerceProducts.length} produto(s), ${recentOrders.length} pedido(s) recentes e ${recentAbandonedCarts.length} carrinho(s) abandonado(s) recentes.`
        : "Ecommerce ainda nao tem loja conectada.",
    ];
    let sources = buildSources(["leads", "chats", "lead_tasks", "financeiro", "ecommerce_connections"]);

    if (hasAny(q, ["produto", "servico", "catalogo", "oferta", "upsell", "cross", "vender"])) {
      title = "Produtos e servicos";
      const thinCatalog = catalogDocs.filter((item) => !clean(item.productName) || clean(item.content).length < 120);
      const withoutUpsell = catalogDocs.filter((item) => !(Array.isArray(item.upsellKeys) && item.upsellKeys.length) && !(Array.isArray(item.crossSellKeys) && item.crossSellKeys.length));
      answer = [
        `A Altum conhece ${catalogDocs.length} item(ns) manuais e ${ecommerceProducts.length} produto(s) vindos de ecommerce.`,
        `${thinCatalog.length} item(ns) precisam de mais contexto comercial para a IA responder melhor.`,
        `${withoutUpsell.length} item(ns) ainda nao tem upsell ou cross-sell configurado.`,
        productCategories.length
          ? `Categorias mais presentes: ${productCategories.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "Ainda faltam categorias para organizar melhor a oferta.",
      ];
      sources = buildSources(["kb_docs", "ecommerce_products"]);
    } else if (hasAny(q, ["ecommerce", "loja", "shopify", "nuvemshop", "woocommerce", "pedido", "compra", "rastreio", "carrinho", "abandono", "recompra"])) {
      title = "Ecommerce e pos-venda";
      const trackedOrders = ecommerceOrders.filter((item) => clean(item.trackingCode || item.trackingUrl, 220));
      answer = [
        `Encontrei ${ecommerceConnections.length} loja(s) conectada(s), sendo ${activeStores.length} ativa(s).`,
        `A base ecommerce tem ${ecommerceProducts.length} produto(s), ${ecommerceOrders.length} pedido(s) e ${abandonedCarts.length} carrinho(s) abandonado(s).`,
        `Nos ultimos 30 dias chegaram ${recentOrders.length} pedido(s). ${trackedOrders.length} pedido(s) ja possuem rastreio registrado.`,
        `Existem ${pendingEcommerceActions.length} acao(oes) comerciais pendentes geradas por ecommerce.`,
        purchasedProducts.length
          ? `Produtos mais comprados: ${purchasedProducts.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "Ainda nao ha historico suficiente para sugerir recompra com precisao.",
        ecommerceProviders.length
          ? `Lojas/fontes: ${ecommerceProviders.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "Nenhuma loja aparece como fonte ativa ainda.",
      ];
      sources = buildSources(["ecommerce_connections", "ecommerce_products", "ecommerce_orders", "ecommerce_abandoned_carts", "ecommerce_commercial_actions"]);
    } else if (hasAny(q, ["campanha", "anuncio", "meta", "google", "trafego", "cpl", "ads"])) {
      title = "Campanhas e captacao";
      const campaignCount = outboundCampaigns.length || recentSnapshots.length;
      const snapshotLeads = recentSnapshots.reduce((sum, item) => sum + numberValue(item.leads), 0);
      const clicks = recentSnapshots.reduce((sum, item) => sum + numberValue(item.clicks), 0);
      answer = [
        `Encontrei ${campaignCount} registro(s) de campanha/snapshot no tenant.`,
        `Nos snapshots recentes, o investimento foi ${money(totalSpend)} com ${snapshotLeads} lead(s) atribuídos e ${clicks} clique(s).`,
        channelCounts.length
          ? `As principais origens nos leads sao: ${channelCounts.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "Ainda nao ha origem suficiente nos leads para comparar canais.",
      ];
      sources = buildSources(["campaign_snapshots", "outbound_campaigns", "leads"]);
    } else if (hasAny(q, ["conversa", "whatsapp", "atendimento", "resposta", "fila", "cliente esperando"])) {
      title = "Conversas e atendimento";
      const unassigned = openChats.filter((item) => !clean(item.assignedToName || item.ownerName || item.assignedTo)).length;
      answer = [
        `Existem ${openChats.length} conversa(s) aberta(s).`,
        `${unassigned} conversa(s) parecem sem responsavel claro pelos campos atuais.`,
        `${handoffs.length} escalada(s) para humano apareceram nos logs recentes da IA.`,
        handoffReasons.length
          ? `Motivos mais frequentes de escalada: ${handoffReasons.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "Nao encontrei motivo dominante de escalada nos logs recentes.",
      ];
      sources = buildSources(["chats", "ai_logs"]);
    } else if (hasAny(q, ["funil", "lead", "oportunidade", "cliente", "venda", "pipeline", "quente"])) {
      title = "Clientes e oportunidades";
      answer = [
        `A base tem ${leads.length} oportunidade(s), sendo ${recentLeads.length} criada(s) nos ultimos 30 dias.`,
        stageCounts.length
          ? `Distribuicao do funil: ${stageCounts.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "Ainda nao ha etapas suficientes para ler o funil.",
        channelCounts.length
          ? `Origens mais fortes: ${channelCounts.map((item) => `${item.label} (${item.value})`).join(", ")}.`
          : "As origens dos leads ainda precisam ser melhor preenchidas.",
      ];
      sources = buildSources(["leads"]);
    } else if (hasAny(q, ["ia", "assistente", "altum", "base", "conhecimento", "nao soube", "escala", "escalada"])) {
      title = "Assistente Altum";
      answer = [
        `A base tem ${kbDocs.length} documento(s): ${faqDocs.length} FAQ, ${policyDocs.length} politica(s) e ${catalogDocs.length} item(ns) de oferta.`,
        `Nos logs recentes, encontrei ${recentAiLogs.length} decisao(oes), ${handoffs.length} escalada(s) e ${lowConfidence.length} caso(s) de baixa confianca.`,
        handoffReasons.length
          ? `Principal ponto de atencao: ${handoffReasons[0].label} (${handoffReasons[0].value}x).`
          : "Nao encontrei um gargalo claro de escalada nesta janela.",
      ];
      sources = buildSources(["kb_docs", "ai_logs"]);
    } else if (hasAny(q, ["hoje", "prioridade", "fazer agora", "acao", "pendente", "atrasado"])) {
      title = "Prioridades de acao";
      const todayAppointments = appointments.filter((item) => isWithinDays(item.startAt || item.date || item.createdAt, 1));
      answer = [
        `Comece pelas ${overdueTasks.length} tarefa(s) vencida(s).`,
        `Depois revise ${openChats.length} conversa(s) aberta(s), principalmente as sem responsavel.`,
        `Ha ${todayAppointments.length} compromisso(s)/agenda(s) na janela de hoje.`,
        lowConfidence.length
          ? `Tambem vale revisar ${lowConfidence.length} resposta(s) de baixa confianca da IA.`
          : "A IA nao mostrou volume relevante de baixa confianca nos logs recentes.",
      ];
      sources = buildSources(["lead_tasks", "chats", "appointments", "ai_logs"]);
    }

    return NextResponse.json({
      ok: true,
      title,
      answer: answer.filter(Boolean).join("\n"),
      metrics: {
        leads: leads.length,
        recentLeads: recentLeads.length,
        openChats: openChats.length,
        pendingTasks: pendingTasks.length,
        overdueTasks: overdueTasks.length,
        kbDocs: kbDocs.length,
        catalogDocs: catalogDocs.length,
        aiHandoffs: handoffs.length,
        lowConfidence: lowConfidence.length,
        campaignSpend30d: totalSpend,
        paidFinance,
        pendingFinance,
      },
      sources,
      suggestedQuestions: [
        "O que preciso fazer hoje?",
        "Onde estou perdendo oportunidades?",
        "Quais produtos precisam de mais contexto?",
        "Como estao minhas conversas no WhatsApp?",
        "O que a IA nao esta sabendo responder?",
      ],
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao responder Perguntar a Altum:", error);
    return NextResponse.json({ error: "Falha ao responder pergunta." }, { status: 500 });
  }
}
