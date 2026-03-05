"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import type {
  AgencyActivity,
  AgencyBudget,
  AgencyLead,
  AgencyProject,
  TimestampLike,
} from "@/app/types/domain";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleDot,
  Layers,
  Rocket,
  Sparkles,
  Target,
  Timer,
  UserPlus,
  LineChart,
} from "lucide-react";

type PipelineStage =
  | "captado"
  | "contato_enviado"
  | "respondido"
  | "em_negociacao"
  | "proposta_enviada"
  | "fechado"
  | "perdido";

const PIPELINE_STAGES: PipelineStage[] = [
  "captado",
  "contato_enviado",
  "respondido",
  "em_negociacao",
  "proposta_enviada",
  "fechado",
  "perdido",
];

function isPipelineStage(value?: string): value is PipelineStage {
  return PIPELINE_STAGES.includes(value as PipelineStage);
}

function leadCreatedDate(createdAt?: TimestampLike | number | null) {
  if (!createdAt) return null;
  if (typeof createdAt === "number") return new Date(createdAt);
  if (typeof createdAt === "object" && typeof createdAt.toDate === "function") {
    return createdAt.toDate();
  }
  return null;
}

type DashboardLead = AgencyLead & {
  pipelineStage?: PipelineStage | string;
  createdAt?: TimestampLike | number | null;
};

type DashboardProject = AgencyProject;
type DashboardBudget = AgencyBudget & { titulo?: string };
type DashboardActivity = AgencyActivity & { data?: string | null };

export default function DashboardReal() {
  const { user, isAdmin } = useAuth();
  const [leads, setLeads] = useState<DashboardLead[]>([]);
  const [projetos, setProjetos] = useState<DashboardProject[]>([]);
  const [orcamentos, setOrcamentos] = useState<DashboardBudget[]>([]);
  const [atividades, setAtividades] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLeads([]);
      setProjetos([]);
      setOrcamentos([]);
      setAtividades([]);
      setLoading(false);
      return;
    }

    const leadsQuery = isAdmin
      ? query(collection(db, "leads"), orderBy("createdAt", "desc"))
      : query(collection(db, "leads"), where("ownerId", "==", user.uid));

    const projectsQuery = isAdmin
      ? query(collection(db, "projetos"), orderBy("createdAt", "desc"))
      : query(collection(db, "projetos"), where("ownerId", "==", user.uid));

    const budgetsQuery = isAdmin
      ? query(collection(db, "orcamentos"), orderBy("createdAt", "desc"))
      : query(collection(db, "orcamentos"), where("ownerId", "==", user.uid));

    const activitiesQuery = isAdmin
      ? query(collection(db, "atividades"), orderBy("data", "asc"))
      : query(collection(db, "atividades"), where("ownerId", "==", user.uid));

    const unsubLeads = onSnapshot(
      leadsQuery,
      (snap) => {
        setLeads(
          snap.docs.map((d) => {
            const data = d.data() as Omit<DashboardLead, "id">;
            return { id: d.id, ...data };
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    // PROJETOS
    const unsubProjetos = onSnapshot(
      projectsQuery,
      (snap) => {
        setProjetos(
          snap.docs.map((d) => {
            const data = d.data() as Omit<DashboardProject, "id">;
            return { id: d.id, ...data };
          })
        );
      }
    );

    // ORÇAMENTOS
    const unsubOrcamentos = onSnapshot(
      budgetsQuery,
      (snap) => {
        setOrcamentos(
          snap.docs.map((d) => {
            const data = d.data() as Omit<DashboardBudget, "id">;
            return { id: d.id, ...data };
          })
        );
      }
    );

    // ATIVIDADES
    const unsubAtividades = onSnapshot(
      activitiesQuery,
      (snap) => {
        setAtividades(
          snap.docs.map((d) => {
            const data = d.data() as Omit<DashboardActivity, "id">;
            return { id: d.id, ...data };
          })
        );
      }
    );

    return () => {
      unsubLeads();
      unsubProjetos();
      unsubOrcamentos();
      unsubAtividades();
    };
  }, [user, isAdmin]);

  // ======== MÉTRICAS BÁSICAS ========

  const leadsHoje = useMemo(
    () => {
      const hoje = new Date();
      return leads.filter((l) => {
        if (!l.createdAt || typeof l.createdAt !== "object" || typeof l.createdAt.toDate !== "function") {
          return false;
        }
        const d = new Date(l.createdAt.toDate());
        return (
          d.getDate() === hoje.getDate() &&
          d.getMonth() === hoje.getMonth() &&
          d.getFullYear() === hoje.getFullYear()
        );
      });
    },
    [leads]
  );

  const atividadesPendentes = atividades.filter((a) => a.status === "pendente");

  // ======== RESUMO DO PIPELINE ========

  const pipelineResumo = useMemo(() => {
    const base: Record<PipelineStage, number> = {
      captado: 0,
      contato_enviado: 0,
      respondido: 0,
      em_negociacao: 0,
      proposta_enviada: 0,
      fechado: 0,
      perdido: 0,
    };

    for (const l of leads) {
      const s: PipelineStage = isPipelineStage(l.pipelineStage)
        ? l.pipelineStage
        : "captado";
      base[s] = (base[s] || 0) + 1;
    }

    return base;
  }, [leads]);

  const totalLeads = leads.length || 1; // evita divisão por zero
  const totalFechados = pipelineResumo.fechado;
  const taxaFechamento = Math.round((totalFechados / totalLeads) * 100);

  const totalPropostas = orcamentos.length;

  // próximas 5 atividades (pendentes primeiro)
  const proximasAtividades = useMemo(() => {
    const ordenadas = [...atividades].sort((a, b) =>
      (a.data || "").localeCompare(b.data || "")
    );
    return ordenadas.slice(0, 5);
  }, [atividades]);

  // últimos 6 leads
  const ultimosLeads = useMemo(() => leads.slice(0, 6), [leads]);

  return (
    <div className="space-y-8">
      {/* HERO / SAUDAÇÃO */}
      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-black p-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-white/40">
            Bem-vindo ao painel da
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-wide flex items-center gap-2">
            ALTUM
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 inline-flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Operação rodando
            </span>
          </h1>
          <p className="text-sm text-white/60 max-w-xl">
            Visão consolidada de leads, funil comercial, projetos e atividades.
            Esse painel é o “cockpit” da sua agência.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/admin/prospeccao"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 transition"
          >
            <Sparkles className="h-4 w-4" />
            Ver máquina de prospecção
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href="/admin/atividades"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 hover:bg-white/10 transition"
          >
            <Timer className="h-4 w-4" />
            Agenda & tarefas
          </Link>
        </div>
      </section>

      {/* KPIs PRINCIPAIS */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Leads totais */}
        <div className="rounded-2xl border border-white/10 bg-[#101010] p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-white/50">
            Leads totais
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-semibold">{leads.length}</p>
          </div>
          <p className="text-[11px] text-white/40 flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            Captados pela máquina + cadastros manuais.
          </p>
        </div>

        {/* Leads hoje */}
        <div className="rounded-2xl border border-blue-500/40 bg-blue-950/30 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-blue-200/80">
            Leads hoje
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-semibold text-blue-300">
              {leadsHoje.length}
            </p>
          </div>
          <p className="text-[11px] text-blue-200/70 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Performance do dia em tempo real.
          </p>
        </div>

        {/* Projetos ativos */}
        <div className="rounded-2xl border border-purple-500/40 bg-purple-950/30 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-purple-200/80">
            Projetos ativos
          </p>
          <p className="text-3xl font-semibold text-purple-200">
            {projetos.length}
          </p>
          <p className="text-[11px] text-purple-200/70 flex items-center gap-1">
            <Layers className="h-3 w-3" />
            Demandas em andamento na operação.
          </p>
        </div>

        {/* Atividades pendentes */}
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-amber-200/80">
            Atividades pendentes
          </p>
          <p className="text-3xl font-semibold text-amber-200">
            {atividadesPendentes.length}
          </p>
          <p className="text-[11px] text-amber-200/70 flex items-center gap-1">
            <Timer className="h-3 w-3" />
            Follow-ups e tarefas que precisam de atenção.
          </p>
        </div>
      </section>

      {/* GRID PRINCIPAL: FUNIL + LISTAS */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* COLUNA ESQUERDA: RESUMO DO FUNIL / PROPOSTAS */}
        <div className="space-y-4 lg:col-span-2">
          {/* Resumo do funil */}
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-white/50">
                  Funil comercial
                </p>
                <p className="text-sm text-white/70">
                  Visão geral dos estágios do pipeline.
                </p>
              </div>
              <Link
                href="/admin/pipeline"
                className="text-[11px] text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
              >
                Abrir pipeline
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {/* Conversão básica */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 space-y-2">
                <p className="text-[11px] text-emerald-200/80 uppercase tracking-wide">
                  Taxa de fechamento
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-semibold text-emerald-200">
                    {isNaN(taxaFechamento) ? 0 : taxaFechamento}%
                  </p>
                </div>
                <p className="text-[11px] text-emerald-200/70 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {totalFechados} fechados de {totalLeads} leads.
                </p>
              </div>

              {/* Propostas / orçamentos */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-3 space-y-2">
                <p className="text-[11px] text-blue-200/80 uppercase tracking-wide">
                  Propostas criadas
                </p>
                <p className="text-2xl font-semibold text-blue-200">
                  {totalPropostas}
                </p>
                <p className="text-[11px] text-blue-200/70 flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  Orçamentos registrados no sistema.
                </p>
              </div>

              {/* Leads em negociação */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 space-y-2">
                <p className="text-[11px] text-amber-200/80 uppercase tracking-wide">
                  Leads em negociação
                </p>
                <p className="text-2xl font-semibold text-amber-200">
                  {pipelineResumo.em_negociacao +
                    pipelineResumo.proposta_enviada}
                </p>
                <p className="text-[11px] text-amber-200/70 flex items-center gap-1">
                  <Rocket className="h-3 w-3" />
                  Oportunidades perto de fechar.
                </p>
              </div>
            </div>

            {/* Barrinhas de estágios */}
            <div className="mt-2 space-y-2">
              {(
                [
                  "captado",
                  "contato_enviado",
                  "respondido",
                  "em_negociacao",
                  "proposta_enviada",
                  "fechado",
                  "perdido",
                ] as PipelineStage[]
              ).map((stage) => {
                const labelMap: Record<PipelineStage, string> = {
                  captado: "Captado",
                  contato_enviado: "Contato enviado",
                  respondido: "Respondido",
                  em_negociacao: "Em negociação",
                  proposta_enviada: "Proposta enviada",
                  fechado: "Fechado",
                  perdido: "Perdido",
                };

                const value = pipelineResumo[stage];
                const perc = Math.min(
                  100,
                  Math.round((value / totalLeads) * 100)
                );

                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-white/60">
                      <span>{labelMap[stage]}</span>
                      <span>
                        {value} • {isNaN(perc) ? 0 : perc}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 to-purple-500"
                        style={{ width: `${perc || 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Últimos leads */}
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-white/50">
                Últimos leads captados
              </p>
              <Link
                href="/admin/prospeccao"
                className="text-[11px] text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
              >
                Ver todos
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {ultimosLeads.length === 0 && (
              <p className="text-xs text-white/50">
                Ainda não existem leads cadastrados.  
                Assim que a máquina de prospecção começar a rodar, tudo aparece
                aqui.
              </p>
            )}

            <div className="grid gap-2 md:grid-cols-2">
              {ultimosLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-xl border border-white/10 bg-black/40 p-3 flex flex-col justify-between hover:border-blue-500/40 transition"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {lead.nome || "Lead sem nome"}
                    </p>
                    <p className="text-[11px] text-white/50 flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {lead.origem || "Origem não informada"}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
                    <span className="flex items-center gap-1">
                      <CircleDot className="h-3 w-3" />
                      {lead.pipelineStage || "captado"}
                    </span>

                    {leadCreatedDate(lead.createdAt) && (
                      <span>{leadCreatedDate(lead.createdAt)?.toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: AGENDA + ATALHOS */}
        <div className="space-y-4">
          {/* Próximas atividades */}
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-white/50">
                Próximas atividades
              </p>
              <Link
                href="/admin/atividades"
                className="text-[11px] text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
              >
                Agenda completa
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {proximasAtividades.length === 0 && (
              <p className="text-xs text-white/50">
                Nenhuma atividade registrada ainda.  
                Use o módulo de atividades para organizar follow-ups e tarefas.
              </p>
            )}

            <div className="space-y-2">
              {proximasAtividades.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-white/10 bg-black/40 p-3 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-medium">{a.descricao}</p>
                    {a.data && (
                      <p className="text-[11px] text-white/50 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.data).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-1 rounded-lg border ${
                      a.status === "concluida"
                        ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                        : "border-white/10 text-white/60 bg-white/5"
                    }`}
                  >
                    {a.status === "concluida" ? "Concluída" : "Pendente"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-wide text-white/50">
              Ações rápidas
            </p>

            <div className="space-y-2 text-xs">
              <Link
                href="/admin/prospeccao"
                className="flex items-center justify-between rounded-xl border border-blue-500/40 bg-blue-600/10 px-3 py-2 hover:bg-blue-600/20 transition"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-300" />
                  <div className="flex flex-col">
                    <span className="font-medium text-blue-100">
                      Ver leads da prospecção
                    </span>
                    <span className="text-[11px] text-blue-100/70">
                      Acompanhar oportunidades captadas.
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-blue-200" />
              </Link>

              <Link
                href="/admin/clientes"
                className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-white/70" />
                  <div className="flex flex-col">
                    <span className="font-medium">Ver clientes</span>
                    <span className="text-[11px] text-white/60">
                      Base de clientes ativa da agência.
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-white/60" />
              </Link>

              <Link
                href="/admin/campanhas"
                className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-600/10 px-3 py-2 hover:bg-emerald-600/20 transition"
              >
                <div className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-emerald-200" />
                  <div className="flex flex-col">
                    <span className="font-medium text-emerald-100">
                      Campanhas em tempo real
                    </span>
                    <span className="text-[11px] text-emerald-100/80">
                      Integrar contas Meta/Google e analisar performance com IA.
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-emerald-100" />
              </Link>

              <Link
                href="/admin/projetos"
                className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-600/10 px-3 py-2 hover:bg-purple-600/20 transition"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-200" />
                  <div className="flex flex-col">
                    <span className="font-medium text-purple-100">
                      Projetos & entregas
                    </span>
                    <span className="text-[11px] text-purple-100/80">
                      Acompanhar sites, LPS e campanhas em produção.
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-purple-100" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {loading && (
        <p className="text-xs text-white/40">
          Carregando dados em tempo real…
        </p>
      )}
    </div>
  );
}
