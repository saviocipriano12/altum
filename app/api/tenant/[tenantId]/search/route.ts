import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";

const MODULES = [
  { id: "inicio", label: "Inicio", path: "/cliente/painel", description: "Prioridades, numeros e acoes do dia" },
  { id: "conversas", label: "Conversas", path: "/cliente/painel/inbox", description: "Atendimento, WhatsApp e contexto comercial" },
  { id: "clientes", label: "Clientes & Oportunidades", path: "/cliente/painel/crm", description: "Lista, funil e relacionamento comercial" },
  { id: "followups", label: "Agenda - Tarefas", path: "/cliente/painel/follow-ups", description: "Tarefas e proximos passos" },
  { id: "agenda", label: "Agenda", path: "/cliente/painel/agenda", description: "Reunioes, agendamentos e slots operacionais" },
  { id: "pipeline", label: "Clientes & Oportunidades - Kanban", path: "/cliente/painel/pipeline", description: "Funil e gargalos comerciais" },
  { id: "comercial", label: "Clientes & Oportunidades - Propostas", path: "/cliente/painel/comercial", description: "Propostas e financeiro comercial" },
  { id: "produtos_servicos", label: "Produtos & Servicos", path: "/cliente/painel/produtos-servicos", description: "Ofertas, argumentos, duvidas e upsell" },
  { id: "captacao", label: "Campanhas - Captacao", path: "/cliente/painel/captacao", description: "Formularios e entrada de leads" },
  { id: "campanhas", label: "Campanhas", path: "/cliente/painel/campanhas", description: "Outreach, reativacao e disparos segmentados" },
  { id: "perguntar_altum", label: "Perguntar a Altum", path: "/cliente/painel/perguntar-altum", description: "Chat com dados da operacao e proximas acoes" },
  { id: "ia", label: "Assistente Altum", path: "/cliente/painel/ia", description: "Comportamento, simulacao e controle da IA" },
  { id: "conhecimento", label: "Base de conhecimento", path: "/cliente/painel/conhecimento", description: "Politicas, perguntas e processos do negocio" },
  { id: "handoffs", label: "Escaladas para humano", path: "/cliente/painel/handoffs", description: "Casos em que a IA pediu apoio humano" },
  { id: "automacoes", label: "Fluxos comerciais", path: "/cliente/painel/automacoes", description: "Regras de acao, retomada e pos-venda" },
  { id: "metricas", label: "Relatorios", path: "/cliente/painel/metricas", description: "Performance consolidada" },
  { id: "go_live", label: "Implantacao", path: "/cliente/painel/go-live", description: "Prontidao, checklist e validacao da conta" },
  { id: "logs", label: "Logs tecnicos", path: "/cliente/painel/logs", description: "Auditoria tecnica para suporte e perfis avancados" },
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

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function includesAny(haystack: string, query: string) {
  if (!haystack || !query) return false;
  return haystack.includes(query);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const url = new URL(req.url);
    const query = normalizeText(url.searchParams.get("q") || "").slice(0, 120);

    const modules = MODULES.filter((item) => {
      if (!query) return true;
      return includesAny(normalizeText(item.label), query) || includesAny(normalizeText(item.description), query);
    }).slice(0, 7);

    if (query.length < 2) {
      return NextResponse.json({ ok: true, tenantId, query, modules, leads: [], chats: [], budgets: [], finance: [] });
    }

    const [leadsSnap, chatsSnap, budgetsSnap, financeSnap] = await Promise.all([
      adminDb.collection("leads").where("tenantId", "==", tenantId).limit(180).get(),
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(180).get(),
      adminDb.collection("orcamentos").where("tenantId", "==", tenantId).limit(180).get(),
      adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(180).get(),
    ]);

    const leads: SearchLead[] = leadsSnap.docs
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

    const chats: SearchChat[] = chatsSnap.docs
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

    const budgets: SearchBudget[] = budgetsSnap.docs
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

    const finance: SearchFinance[] = financeSnap.docs
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

    return NextResponse.json({ ok: true, tenantId, query, modules, leads, chats, budgets, finance });
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
