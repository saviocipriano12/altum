import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";

const MODULES = [
  { id: "dashboard", label: "Dashboard", path: "/cliente/painel", description: "Visao executiva e KPIs" },
  { id: "inbox", label: "Inbox", path: "/cliente/painel/inbox", description: "Conversas e takeover" },
  { id: "crm", label: "CRM", path: "/cliente/painel/crm", description: "Leads e pipeline" },
  { id: "followups", label: "Follow-ups", path: "/cliente/painel/follow-ups", description: "Desk de tarefas e proximos passos" },
  { id: "agenda", label: "Agenda", path: "/cliente/painel/agenda", description: "Reunioes, agendamentos e slots operacionais" },
  { id: "pipeline", label: "Pipeline", path: "/cliente/painel/pipeline", description: "Kanban e gargalos comerciais" },
  { id: "comercial", label: "Comercial", path: "/cliente/painel/comercial", description: "Propostas e financeiro comercial" },
  { id: "captacao", label: "Captacao", path: "/cliente/painel/captacao", description: "Formularios e entrada de leads" },
  { id: "campanhas", label: "Campanhas", path: "/cliente/painel/campanhas", description: "Outreach, reativacao e disparos segmentados" },
  { id: "ia", label: "IA", path: "/cliente/painel/ia", description: "Agente e base de conhecimento" },
  { id: "conhecimento", label: "Conhecimento", path: "/cliente/painel/conhecimento", description: "Base de conhecimento e playbooks do agente" },
  { id: "handoffs", label: "Handoffs", path: "/cliente/painel/handoffs", description: "Escaladas humanas e fila de takeover" },
  { id: "automacoes", label: "Automacoes", path: "/cliente/painel/automacoes", description: "Fluxos e gatilhos" },
  { id: "metricas", label: "Metricas", path: "/cliente/painel/metricas", description: "Performance consolidada" },
  { id: "go_live", label: "Go-live", path: "/cliente/painel/go-live", description: "Prontidao do tenant, checklist e piloto real" },
  { id: "logs", label: "Logs", path: "/cliente/painel/logs", description: "IA, automacoes e fila operacional" },
  { id: "configuracoes", label: "Configuracoes", path: "/cliente/painel/configuracoes", description: "Canais e governanca" },
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
