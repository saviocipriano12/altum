"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Filter,
  LayoutGrid,
  ListChecks,
  LogOut,
  Mail,
  Plus,
  Search,
  UserCircle2,
  Users,
} from "lucide-react";

type Etapa = "Novo" | "Qualificacao" | "Proposta" | "Fechamento";
type PreviewMode = "clean" | "hybrid" | "enterprise";

type Lead = {
  id: string;
  nome: string;
  empresa: string;
  etapa: Etapa;
  valorEstimado: number;
  responsavel: string;
  ultimaInteracao: string;
  proximaAcao: string;
  email: string;
  telefone: string;
  origem: string;
};

const ETAPAS: Etapa[] = ["Novo", "Qualificacao", "Proposta", "Fechamento"];

const LEADS: Lead[] = [
  {
    id: "LD-1001",
    nome: "Savio Cipriano",
    empresa: "Exclusivamente",
    etapa: "Qualificacao",
    valorEstimado: 7800,
    responsavel: "Maria",
    ultimaInteracao: "Hoje, 11:25",
    proximaAcao: "Enviar proposta resumida com 2 opcoes",
    email: "savio@cliente.com",
    telefone: "(55) 99731-1111",
    origem: "WhatsApp",
  },
  {
    id: "LD-1002",
    nome: "Ulucas Junior",
    empresa: "Studio Prime",
    etapa: "Proposta",
    valorEstimado: 12500,
    responsavel: "Diego",
    ultimaInteracao: "Hoje, 10:05",
    proximaAcao: "Confirmar reuniao de alinhamento",
    email: "ulucas@studioprime.com",
    telefone: "(55) 99731-2222",
    origem: "Formulario",
  },
  {
    id: "LD-1003",
    nome: "Lucilene Campos",
    empresa: "Clinica Viva",
    etapa: "Novo",
    valorEstimado: 5200,
    responsavel: "Maria",
    ultimaInteracao: "Ontem, 16:42",
    proximaAcao: "Fazer primeiro contato",
    email: "lucilene@clinicaviva.com",
    telefone: "(55) 99731-3333",
    origem: "Landing page",
  },
  {
    id: "LD-1004",
    nome: "Roberta Silva",
    empresa: "Rota Sul Transportes",
    etapa: "Fechamento",
    valorEstimado: 21800,
    responsavel: "Carlos",
    ultimaInteracao: "Hoje, 09:10",
    proximaAcao: "Enviar contrato para assinatura",
    email: "roberta@rotasul.com",
    telefone: "(55) 99731-4444",
    origem: "Indicacao",
  },
  {
    id: "LD-1005",
    nome: "Eduardo Rosa",
    empresa: "Argo Sistemas",
    etapa: "Qualificacao",
    valorEstimado: 9400,
    responsavel: "Diego",
    ultimaInteracao: "Ontem, 14:00",
    proximaAcao: "Validar escopo do projeto",
    email: "eduardo@argo.com",
    telefone: "(55) 99731-5555",
    origem: "WhatsApp",
  },
  {
    id: "LD-1006",
    nome: "Mariana Telles",
    empresa: "Atlas Med",
    etapa: "Novo",
    valorEstimado: 6800,
    responsavel: "Carlos",
    ultimaInteracao: "Ontem, 10:22",
    proximaAcao: "Confirmar dor principal e prazo",
    email: "mariana@atlasmed.com",
    telefone: "(55) 99731-6666",
    origem: "Indicacao",
  },
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function stageBadge(etapa: Etapa) {
  if (etapa === "Novo") return "bg-slate-100 text-slate-700";
  if (etapa === "Qualificacao") return "bg-blue-100 text-blue-700";
  if (etapa === "Proposta") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function ClienteCrmPreviewPage() {
  const [mode, setMode] = useState<PreviewMode>("hybrid");
  const [selectedLeadId, setSelectedLeadId] = useState(LEADS[0]?.id || "");
  const selectedLead = useMemo(
    () => LEADS.find((lead) => lead.id === selectedLeadId) || LEADS[0],
    [selectedLeadId]
  );

  const byStage = useMemo(
    () =>
      ETAPAS.map((etapa) => ({
        etapa,
        leads: LEADS.filter((lead) => lead.etapa === etapa),
      })),
    []
  );
  const totalPipeline = useMemo(() => LEADS.reduce((sum, lead) => sum + lead.valorEstimado, 0), []);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ALTUM CRM Lab</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Comparativo de interface</h1>
            <p className="mt-1 text-sm text-slate-600">
              Três propostas para validar usabilidade: clean, hibrida e enterprise.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode("clean")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                mode === "clean" ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Clean
            </button>
            <button
              type="button"
              onClick={() => setMode("hybrid")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                mode === "hybrid" ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Hybrid
            </button>
            <button
              type="button"
              onClick={() => setMode("enterprise")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                mode === "enterprise" ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Enterprise
            </button>
          </div>
        </div>
      </section>

      {mode === "clean" ? (
        <CleanPreview
          selectedLead={selectedLead}
          setSelectedLeadId={setSelectedLeadId}
          byStage={byStage}
          totalPipeline={totalPipeline}
        />
      ) : mode === "hybrid" ? (
        <HybridPreview
          selectedLead={selectedLead}
          setSelectedLeadId={setSelectedLeadId}
          byStage={byStage}
          totalPipeline={totalPipeline}
        />
      ) : (
        <EnterprisePreview
          selectedLead={selectedLead}
          setSelectedLeadId={setSelectedLeadId}
          byStage={byStage}
          totalPipeline={totalPipeline}
        />
      )}
    </div>
  );
}

function CleanPreview({
  selectedLead,
  setSelectedLeadId,
  byStage,
  totalPipeline,
}: {
  selectedLead: Lead;
  setSelectedLeadId: (id: string) => void;
  byStage: Array<{ etapa: Etapa; leads: Lead[] }>;
  totalPipeline: number;
}) {
  return (
    <div className="space-y-4 text-slate-900">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">CRM Comercial</h2>
            <p className="mt-1 text-sm text-slate-600">Fluxo simples para equipe comercial operar sem treinamento longo.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Mail className="h-4 w-4" />
              Convidar usuario
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Novo lead
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <UserCircle2 className="h-4 w-4 text-slate-500" />
            <span className="font-medium">Savio Cipriano</span>
            <span className="text-slate-400">|</span>
            <span>Gestor comercial</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads ativos" value={String(LEADS.length)} />
        <StatCard label="Valor no pipeline" value={formatCurrency(totalPipeline)} />
        <StatCard label="Tarefas hoje" value="6" />
        <StatCard label="Convites pendentes" value="2" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {["Visao geral", "Pipeline", "Lista de leads", "Atividades"].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  tab === "Pipeline" ? "bg-blue-100 text-blue-700" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                placeholder="Buscar lead, empresa ou telefone"
                className="h-9 w-[280px] rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-4">
            {byStage.map((column) => (
              <div key={column.etapa} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{column.etapa}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {column.leads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {column.leads.length === 0 ? (
                    <p className="text-xs text-slate-500">Sem leads nesta etapa.</p>
                  ) : (
                    column.leads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`w-full rounded-lg border p-2 text-left ${
                          selectedLead.id === lead.id
                            ? "border-blue-300 bg-blue-50"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-sm font-medium text-slate-800">{lead.nome}</p>
                        <p className="text-xs text-slate-500">{lead.empresa}</p>
                        <p className="mt-1 text-xs font-medium text-slate-700">{formatCurrency(lead.valorEstimado)}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold">Lista de leads</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3">Responsavel</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Ultima interacao</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADS.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`cursor-pointer border-t border-slate-100 ${
                        selectedLead.id === lead.id ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{lead.nome}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.empresa}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2 py-1 text-xs ${stageBadge(lead.etapa)}`}>{lead.etapa}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.responsavel}</td>
                      <td className="px-4 py-3 text-slate-800">{formatCurrency(lead.valorEstimado)}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.ultimaInteracao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">Detalhes do lead</h3>
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-slate-900">{selectedLead.nome}</p>
              <p className="text-slate-600">{selectedLead.empresa}</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span className="rounded-md bg-slate-100 px-2 py-1">ID: {selectedLead.id}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1">Etapa: {selectedLead.etapa}</span>
              </div>
              <div className="space-y-1 border-t border-slate-200 pt-2 text-slate-700">
                <p className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  {selectedLead.origem}
                </p>
                <p className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  {selectedLead.email}
                </p>
                <p className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  Responsavel: {selectedLead.responsavel}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Proxima acao</p>
              <p className="mt-1 text-sm text-blue-900">{selectedLead.proximaAcao}</p>
            </div>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Aplicar acao
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <CalendarClock className="h-4 w-4" />
                Agendar tarefa
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">Convites de acesso</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                <span className="text-slate-700">maria@cliente.com</span>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Enviado
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                <span className="text-slate-700">joao@cliente.com</span>
                <span className="text-xs text-amber-700">Pendente</span>
              </div>
            </div>
            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Mail className="h-4 w-4" />
              Novo convite
            </button>
          </div>
        </aside>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span>Preview de referencia para validar usabilidade antes da aplicacao real.</span>
        <Link href="/cliente/painel/crm" className="font-medium text-blue-700 hover:underline">
          Voltar ao CRM atual
        </Link>
      </div>
    </div>
  );
}

function EnterprisePreview({
  selectedLead,
  setSelectedLeadId,
  byStage,
  totalPipeline,
}: {
  selectedLead: Lead;
  setSelectedLeadId: (id: string) => void;
  byStage: Array<{ etapa: Etapa; leads: Lead[] }>;
  totalPipeline: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100 shadow-[0_20px_50px_rgba(2,6,23,0.35)]">
      <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-600/20 text-blue-300">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">ALTUM Sales Workspace</p>
              <p className="text-xs text-slate-400">Visao enterprise com foco em operacao e previsibilidade.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">Usuario: Savio</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_330px]">
        <aside className="border-r border-slate-800 bg-slate-900 p-3">
          <p className="mb-2 px-2 text-[11px] uppercase tracking-wide text-slate-500">Modulos</p>
          <div className="space-y-1">
            {[
              { label: "Pipeline", active: true, icon: LayoutGrid },
              { label: "Leads", active: false, icon: Users },
              { label: "Tarefas", active: false, icon: ListChecks },
              { label: "Relatorios", active: false, icon: Filter },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm ${
                  item.active ? "bg-blue-500/20 text-blue-200" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-3 p-3">
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <EnterpriseStat label="Leads" value={String(LEADS.length)} />
            <EnterpriseStat label="Pipeline" value={formatCurrency(totalPipeline)} />
            <EnterpriseStat label="Ganhos mes" value={formatCurrency(18300)} />
            <EnterpriseStat label="Tarefas hoje" value="6" />
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {["Kanban", "Tabela", "Calendario"].map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={`rounded-md px-2.5 py-1 text-xs ${
                      view === "Kanban" ? "bg-blue-500/20 text-blue-200" : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {view}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="search"
                    placeholder="Buscar lead"
                    className="h-8 w-44 rounded-md border border-slate-700 bg-slate-950 pl-7 pr-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo
                </button>
              </div>
            </div>

            <div className="grid gap-2 xl:grid-cols-4">
              {byStage.map((column) => (
                <div key={column.etapa} className="rounded-md border border-slate-800 bg-slate-950/40 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-200">{column.etapa}</p>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {column.leads.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {column.leads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`w-full rounded-md border p-2 text-left ${
                          selectedLead.id === lead.id
                            ? "border-blue-500/60 bg-blue-500/10"
                            : "border-slate-800 bg-slate-900 hover:bg-slate-800"
                        }`}
                      >
                        <p className="text-xs font-medium text-slate-100">{lead.nome}</p>
                        <p className="text-[11px] text-slate-400">{lead.empresa}</p>
                        <p className="mt-1 text-[11px] text-slate-300">{formatCurrency(lead.valorEstimado)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tabela operacional</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-950/60 text-left uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Lead</th>
                    <th className="px-3 py-2">Etapa</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Ultimo toque</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADS.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`cursor-pointer border-t border-slate-800 ${
                        selectedLead.id === lead.id ? "bg-blue-500/10" : "hover:bg-slate-800/60"
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-200">{lead.nome}</td>
                      <td className="px-3 py-2 text-slate-300">{lead.etapa}</td>
                      <td className="px-3 py-2 text-slate-300">{lead.responsavel}</td>
                      <td className="px-3 py-2 text-slate-200">{formatCurrency(lead.valorEstimado)}</td>
                      <td className="px-3 py-2 text-slate-400">{lead.ultimaInteracao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="border-l border-slate-800 bg-slate-900 p-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Lead em foco</p>
            <h3 className="mt-1 text-sm font-semibold">{selectedLead.nome}</h3>
            <p className="text-xs text-slate-400">{selectedLead.empresa}</p>

            <div className="mt-3 space-y-1.5 text-xs text-slate-300">
              <p className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
                Origem: {selectedLead.origem}
              </p>
              <p className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                {selectedLead.email}
              </p>
              <p className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-slate-500" />
                Owner: {selectedLead.responsavel}
              </p>
            </div>

            <div className="mt-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-2">
              <p className="text-[10px] uppercase tracking-wide text-blue-200">Proxima acao sugerida</p>
              <p className="mt-1 text-xs text-blue-100">{selectedLead.proximaAcao}</p>
            </div>

            <div className="mt-3 grid gap-1.5">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-2 text-xs font-medium text-white hover:bg-blue-500"
              >
                Executar acao
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Criar tarefa
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Timeline</p>
            <div className="mt-2 space-y-2 text-xs">
              {[
                "Hoje 11:25 - Lead pediu proposta final",
                "Hoje 10:05 - Reuniao registrada no CRM",
                "Ontem 16:42 - Follow-up enviado",
              ].map((event) => (
                <div key={event} className="rounded-md border border-slate-800 bg-slate-900 p-2 text-slate-300">
                  {event}
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/cliente/painel/crm"
            className="mt-3 inline-flex w-full items-center justify-between rounded-md border border-slate-700 px-2 py-2 text-xs text-slate-300 hover:bg-slate-800"
          >
            Voltar ao CRM atual
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function HybridPreview({
  selectedLead,
  setSelectedLeadId,
  byStage,
  totalPipeline,
}: {
  selectedLead: Lead;
  setSelectedLeadId: (id: string) => void;
  byStage: Array<{ etapa: Etapa; leads: Lead[] }>;
  totalPipeline: number;
}) {
  return (
    <div className="space-y-3 text-slate-900">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hybrid Workspace</p>
              <h2 className="text-lg font-semibold text-slate-900">ALTUM CRM Operacional</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                <Mail className="h-4 w-4" />
                Convidar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Novo lead
              </button>
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[180px_minmax(0,1fr)_320px]">
          <aside className="border-r border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 px-2 text-[11px] uppercase tracking-wide text-slate-500">Modulos</p>
            <div className="space-y-1">
              {[
                { label: "Pipeline", active: true, icon: LayoutGrid },
                { label: "Leads", active: false, icon: Users },
                { label: "Tarefas", active: false, icon: ListChecks },
                { label: "Filtros", active: false, icon: Filter },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                    item.active ? "bg-blue-100 text-blue-700" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600">
              <p className="font-medium text-slate-800">Usuario</p>
              <p className="mt-1 inline-flex items-center gap-1.5">
                <UserCircle2 className="h-3.5 w-3.5 text-slate-400" />
                Savio Cipriano
              </p>
            </div>
          </aside>

          <main className="space-y-3 p-3">
            <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Leads ativos" value={String(LEADS.length)} />
              <StatCard label="Pipeline" value={formatCurrency(totalPipeline)} />
              <StatCard label="Tarefas hoje" value="6" />
              <StatCard label="Sem retorno" value="4" />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {["Kanban", "Tabela", "Atividades"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        tab === "Kanban" ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="search"
                      placeholder="Buscar lead"
                      className="h-8 w-44 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-xs outline-none focus:border-blue-500"
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Filtros
                  </button>
                </div>
              </div>

              <div className="grid gap-2 xl:grid-cols-4">
                {byStage.map((column) => (
                  <div key={column.etapa} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700">{column.etapa}</p>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm">
                        {column.leads.length}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {column.leads.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => setSelectedLeadId(lead.id)}
                          className={`w-full rounded-md border p-2 text-left ${
                            selectedLead.id === lead.id
                              ? "border-blue-300 bg-blue-50"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <p className="text-xs font-medium text-slate-800">{lead.nome}</p>
                          <p className="text-[11px] text-slate-500">{lead.empresa}</p>
                          <p className="mt-1 text-[11px] text-slate-700">{formatCurrency(lead.valorEstimado)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lista resumida</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Lead</th>
                      <th className="px-3 py-2">Etapa</th>
                      <th className="px-3 py-2">Owner</th>
                      <th className="px-3 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LEADS.map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`cursor-pointer border-t border-slate-100 ${
                          selectedLead.id === lead.id ? "bg-blue-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-800">{lead.nome}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-md px-2 py-1 text-[10px] ${stageBadge(lead.etapa)}`}>{lead.etapa}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{lead.responsavel}</td>
                        <td className="px-3 py-2 text-slate-700">{formatCurrency(lead.valorEstimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          <aside className="border-l border-slate-200 bg-slate-50 p-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Lead selecionado</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">{selectedLead.nome}</h3>
              <p className="text-xs text-slate-500">{selectedLead.empresa}</p>

              <div className="mt-3 space-y-1.5 text-xs text-slate-700">
                <p className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {selectedLead.origem}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {selectedLead.email}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  Owner: {selectedLead.responsavel}
                </p>
              </div>

              <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2">
                <p className="text-[10px] uppercase tracking-wide text-blue-700">Proxima acao</p>
                <p className="mt-1 text-xs text-blue-900">{selectedLead.proximaAcao}</p>
              </div>

              <div className="mt-3 grid gap-1.5">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-2 text-xs font-medium text-white hover:bg-blue-500"
                >
                  Executar
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Agendar
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Timeline</p>
              <div className="mt-2 space-y-2 text-xs">
                {[
                  "Hoje 11:25 - Lead pediu proposta final",
                  "Hoje 10:05 - Reuniao registrada",
                  "Ontem 16:42 - Follow-up enviado",
                ].map((event) => (
                  <div key={event} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
                    {event}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Convites</p>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5">
                  <span className="text-slate-700">maria@cliente.com</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Enviado
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5">
                  <span className="text-slate-700">joao@cliente.com</span>
                  <span className="text-amber-700">Pendente</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span>Versao hibrida: simplicidade visual + operacao organizada para times maiores.</span>
        <Link href="/cliente/painel/crm" className="font-medium text-blue-700 hover:underline">
          Voltar ao CRM atual
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EnterpriseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
