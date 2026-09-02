import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import type { TenantModuleId } from "@/lib/tenant-entitlements";
import { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";

const MODULES: Array<{ id: string; label: string; path: string; description: string; module?: TenantModuleId }> = [
  { id: "inicio", label: "Inicio", path: "/cliente/painel", description: "Prioridades, numeros e acoes do dia" },
  { id: "conversas", label: "Conversas", path: "/cliente/painel/inbox", description: "Atendimento, WhatsApp e contexto comercial", module: "inbox" },
  { id: "clientes", label: "Clientes & Oportunidades", path: "/cliente/painel/crm", description: "Lista, funil e relacionamento comercial", module: "crm" },
  { id: "followups", label: "Agenda - Tarefas", path: "/cliente/painel/follow-ups", description: "Tarefas e proximos passos", module: "automation" },
  { id: "agenda", label: "Agenda", path: "/cliente/painel/agenda", description: "Compromissos e reunioes", module: "crm" },
  { id: "pipeline", label: "Clientes & Oportunidades - Kanban", path: "/cliente/painel/pipeline", description: "Funil e gargalos comerciais", module: "crm" },
  { id: "comercial", label: "Clientes & Oportunidades - Propostas", path: "/cliente/painel/comercial", description: "Propostas e financeiro comercial", module: "crm" },
  { id: "produtos_servicos", label: "Produtos & Servicos", path: "/cliente/painel/produtos-servicos", description: "Ofertas, argumentos, duvidas e upsell", module: "commerce" },
  { id: "captacao", label: "Campanhas - Captacao", path: "/cliente/painel/captacao", description: "Formularios e entrada de leads", module: "marketing" },
  { id: "campanhas", label: "Campanhas", path: "/cliente/painel/campanhas", description: "Outreach, reativacao e disparos segmentados", module: "marketing" },
  { id: "perguntar_altum", label: "Perguntar a Altum", path: "/cliente/painel/perguntar-altum", description: "Chat com dados da operacao e proximas acoes", module: "ai" },
  { id: "ia", label: "Assistente Altum", path: "/cliente/painel/ia", description: "Como a IA responde, aprende e chama uma pessoa", module: "ai" },
  { id: "conhecimento", label: "Base de conhecimento", path: "/cliente/painel/conhecimento", description: "Politicas, perguntas e processos do negocio", module: "ai" },
  { id: "handoffs", label: "Escaladas para humano", path: "/cliente/painel/handoffs", description: "Casos em que a IA pediu apoio humano", module: "ai" },
  { id: "automacoes", label: "Fluxos comerciais", path: "/cliente/painel/automacoes", description: "Regras de acao, retomada e pos-venda", module: "automation" },
  { id: "metricas", label: "Relatorios", path: "/cliente/painel/metricas", description: "Performance consolidada", module: "reports" },
  { id: "onboarding", label: "Implantacao guiada", path: "/cliente/painel/onboarding", description: "Prepare empresa, canais, ofertas e operacao comercial" },
  { id: "go_live", label: "Validacao final", path: "/cliente/painel/go-live", description: "Prontidao e checklist da conta" },
  { id: "logs", label: "Configuracoes - Avancado", path: "/cliente/painel/logs", description: "Diagnosticos para suporte" },
  { id: "integracoes", label: "Integracoes", path: "/cliente/painel/configuracoes/integracoes", description: "Ecommerce, conectores comerciais e canais externos" },
  { id: "configuracoes", label: "Configuracoes", path: "/cliente/painel/configuracoes", description: "Empresa, equipe, canais e integracoes" },
];

type SearchLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string;
};

type SearchChat = {
  id: string;
  contactName: string;
  contactPhone: string;
  preview: string;
};

type SearchBudget = {
  id: string;
  title: string;
  leadId: string;
  leadName: string;
  status: string;
};

type SearchFinance = {
  id: string;
  description: string;
  leadId: string;
  leadName: string;
  status: string;
  type: string;
};

type SearchTask = {
  id: string;
  title: string;
  leadId: string;
  leadName: string;
  status: string;
  dueAt: string | null;
};

type SearchOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  leadId: string;
  status: string;
  totalPrice: number | null;
  currency: string;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function includesAny(haystack: string, query: string) {
  if (!haystack || !query) return false;
  return haystack.includes(query);
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    const entitlements = await getTenantEntitlements(tenantId);

    const url = new URL(req.url);
    const query = normalizeText(url.searchParams.get("q") || "").slice(0, 120);

    const modules = MODULES.filter((item) => {
      if (item.module && !entitlements.modules[item.module]) return false;
      if (!query) return true;
      return includesAny(normalizeText(item.label), query) || includesAny(normalizeText(item.description), query);
    }).slice(0, 7);

    if (query.length < 2) {
      return NextResponse.json({ ok: true, tenantId, query, modules, leads: [], chats: [], budgets: [], finance: [], tasks: [], orders: [] });
    }

    const [leadsSnap, chatsSnap, budgetsSnap, financeSnap, tasksSnap, ordersSnap] = await Promise.all([
      entitlements.modules.crm ? adminDb.collection("leads").where("tenantId", "==", tenantId).limit(180).get() : null,
      entitlements.modules.inbox ? adminDb.collection("chats").where("tenantId", "==", tenantId).limit(180).get() : null,
      entitlements.modules.crm ? adminDb.collection("orcamentos").where("tenantId", "==", tenantId).limit(180).get() : null,
      entitlements.modules.crm ? adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(180).get() : null,
      entitlements.modules.automation ? adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).limit(180).get() : null,
      entitlements.modules.commerce ? adminDb.collection("ecommerce_orders").where("tenantId", "==", tenantId).limit(180).get() : null,
    ]);

    const teamWideAccess = hasTeamWideCommercialAccess(membership);
    const visibleLeadDocs = (leadsSnap?.docs || []).filter((doc) =>
      canAccessAssignedCommercialRecord(membership, user.uid, doc.data() as Record<string, unknown>)
    );
    const visibleLeadIds = new Set(visibleLeadDocs.map((doc) => doc.id));
    const canSeeRelatedLead = (leadId: unknown) =>
      teamWideAccess || (typeof leadId === "string" && visibleLeadIds.has(leadId));

    const leadNames = new Map(
      visibleLeadDocs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return [doc.id, typeof data.nome === "string" ? data.nome : "Cliente"] as const;
      })
    );

    const leads: SearchLead[] = visibleLeadDocs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          name: typeof data.nome === "string" ? data.nome : "Lead",
          email: typeof data.email === "string" ? data.email : "",
          phone: typeof data.telefone === "string" ? data.telefone : "",
          stage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"),
        };
      })
      .filter((item) => {
        const haystack = normalizeText(`${item.name} ${item.email} ${item.phone} ${item.stage}`);
        return includesAny(haystack, query);
      })
      .slice(0, 8);

    const chats: SearchChat[] = (chatsSnap?.docs || [])
      .filter((doc) => canAccessAssignedCommercialRecord(membership, user.uid, doc.data() as Record<string, unknown>))
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          contactName: typeof data.contactName === "string" ? data.contactName : "Conversa",
          contactPhone: typeof data.contactPhone === "string" ? data.contactPhone : "",
          preview: typeof data.lastMessage === "string" ? data.lastMessage : "",
        };
      })
      .filter((item) => {
        const haystack = normalizeText(`${item.contactName} ${item.contactPhone} ${item.preview}`);
        return includesAny(haystack, query);
      })
      .slice(0, 8);

    const budgets: SearchBudget[] = (budgetsSnap?.docs || [])
      .filter((doc) => canSeeRelatedLead(doc.data().leadId))
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          title: typeof data.titulo === "string" ? data.titulo : "Proposta",
          leadId: typeof data.leadId === "string" ? data.leadId : "",
          leadName: typeof data.leadName === "string" ? data.leadName : "",
          status: typeof data.status === "string" ? data.status : "Rascunho",
        };
      })
      .filter((item) => {
        const haystack = normalizeText(`${item.title} ${item.leadName} ${item.status}`);
        return includesAny(haystack, query);
      })
      .slice(0, 8);

    const finance: SearchFinance[] = (financeSnap?.docs || [])
      .filter((doc) => canSeeRelatedLead(doc.data().leadId))
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          description: typeof data.descricao === "string" ? data.descricao : "Lancamento",
          leadId: typeof data.leadId === "string" ? data.leadId : "",
          leadName: typeof data.leadName === "string" ? data.leadName : "",
          status: typeof data.status === "string" ? data.status : "pendente",
          type: typeof data.tipo === "string" ? data.tipo : "Receita",
        };
      })
      .filter((item) => {
        const haystack = normalizeText(`${item.description} ${item.leadName} ${item.status} ${item.type}`);
        return includesAny(haystack, query);
      })
      .slice(0, 8);

    const tasks: SearchTask[] = (tasksSnap?.docs || [])
      .filter((doc) => canSeeRelatedLead(doc.data().leadId))
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const leadId = typeof data.leadId === "string" ? data.leadId : "";
        return {
          id: doc.id,
          title: typeof data.title === "string" ? data.title : "Proximo passo",
          leadId,
          leadName: leadNames.get(leadId) || "",
          status: typeof data.status === "string" ? data.status : "pending",
          dueAt: toIso(data.dueAt),
        };
      })
      .filter((item) => includesAny(normalizeText(`${item.title} ${item.leadName} ${item.status}`), query))
      .slice(0, 8);

    const orders: SearchOrder[] = (ordersSnap?.docs || [])
      .filter((doc) => canSeeRelatedLead(doc.data().leadId))
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          orderNumber:
            typeof data.orderNumber === "string"
              ? data.orderNumber
              : typeof data.externalOrderId === "string"
                ? data.externalOrderId
                : "Pedido",
          customerName: typeof data.customerName === "string" ? data.customerName : "Cliente",
          leadId: typeof data.leadId === "string" ? data.leadId : "",
          status:
            typeof data.fulfillmentStatus === "string"
              ? data.fulfillmentStatus
              : typeof data.paymentStatus === "string"
                ? data.paymentStatus
                : typeof data.status === "string"
                  ? data.status
                  : "recebido",
          totalPrice: typeof data.totalPrice === "number" ? data.totalPrice : null,
          currency: typeof data.currency === "string" ? data.currency : "BRL",
        };
      })
      .filter((item) => includesAny(normalizeText(`${item.orderNumber} ${item.customerName} ${item.status}`), query))
      .slice(0, 8);

    return NextResponse.json({ ok: true, tenantId, query, modules, leads, chats, budgets, finance, tasks, orders });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao buscar dados no painel cliente:", error);
    return NextResponse.json({ error: "Falha ao executar busca global." }, { status: 500 });
  }
}
