"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  HandCoins,
  Handshake,
  LineChart,
  MessageSquare,
  Radio,
  Rocket,
  Route,
  Send,
  ShieldCheck,
  Target,
  Timer,
  UserPlus,
  Users,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import type {
  AgencyActivity,
  AgencyBudget,
  AgencyLead,
  AgencyProject,
  TimestampLike,
} from "@/app/types/domain";
import { useAuth } from "@/context/AuthContext";

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

const STAGE_LABEL: Record<PipelineStage, string> = {
  captado: "Captado",
  contato_enviado: "Contato enviado",
  respondido: "Respondido",
  em_negociacao: "Em negociacao",
  proposta_enviada: "Proposta enviada",
  fechado: "Fechado",
  perdido: "Perdido",
};

type DashboardLead = AgencyLead & {
  pipelineStage?: PipelineStage | string;
  createdAt?: TimestampLike | number | null;
};

type DashboardBudget = AgencyBudget & { titulo?: string };
type DashboardActivity = AgencyActivity & { data?: string | null };

type AdminAiSignalsResponse = {
  summary?: {
    totalSignals?: number;
    handoffs?: number;
    proposalSignals?: number;
    scheduleSignals?: number;
    activeTenants?: number;
  };
  tenants?: Array<{
    tenantId: string;
    tenantName: string;
    legacyClientId: string;
    totalSignals: number;
    handoffs: number;
    proposalSignals: number;
    scheduleSignals: number;
    lastSignalAt?: unknown;
  }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isPipelineStage(value?: string): value is PipelineStage {
  return PIPELINE_STAGES.includes(value as PipelineStage);
}

function toDateTime(value?: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
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
  if (
    typeof value === "object" &&
    value &&
    "seconds" in value &&
    typeof (value as { seconds?: number }).seconds === "number"
  ) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isToday(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function formatShortDate(value?: unknown) {
  const date = toDateTime(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stageOf(lead: DashboardLead): PipelineStage {
  return isPipelineStage(lead.pipelineStage) ? lead.pipelineStage : "captado";
}

export default function AdminAgencyCockpit() {
  const { user, isAdmin } = useAuth();
  const [leads, setLeads] = useState<DashboardLead[]>([]);
  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [budgets, setBudgets] = useState<DashboardBudget[]>([]);
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [aiSignals, setAiSignals] = useState<AdminAiSignalsResponse>({});
  const [aiSignalsLoading, setAiSignalsLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLeads([]);
      setProjects([]);
      setBudgets([]);
      setActivities([]);
      setLoading(false);
      return;
    }

    let active = true;
    async function loadDashboard() {
      try {
        setLoading(true);
        const response = await authedFetch("/api/admin/dashboard");
        const data = (await response.json().catch(() => ({}))) as {
          leads?: DashboardLead[];
          projetos?: AgencyProject[];
          orcamentos?: DashboardBudget[];
          atividades?: DashboardActivity[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Falha ao carregar o cockpit.");
        if (!active) return;
        setLeads(data.leads || []);
        setProjects(data.projetos || []);
        setBudgets(data.orcamentos || []);
        setActivities(data.atividades || []);
      } catch (error) {
        console.error("Erro ao carregar cockpit administrativo:", error);
        if (active) {
          setLeads([]);
          setProjects([]);
          setBudgets([]);
          setActivities([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => {
      active = false;
    };
  }, [user, isAdmin]);

  useEffect(() => {
    async function loadAiSignals() {
      try {
        setAiSignalsLoading(true);
        const response = await authedFetch("/api/admin/ai/signals?limit=120");
        const data = (await response.json().catch(() => ({}))) as AdminAiSignalsResponse;
        if (response.ok) setAiSignals(data);
      } catch (error) {
        console.error("Erro ao carregar sinais da IA no admin:", error);
      } finally {
        setAiSignalsLoading(false);
      }
    }

    if (user && isAdmin) {
      void loadAiSignals();
    } else {
      setAiSignals({});
      setAiSignalsLoading(false);
    }
  }, [user, isAdmin]);

  const pipeline = useMemo(() => {
    const base: Record<PipelineStage, number> = {
      captado: 0,
      contato_enviado: 0,
      respondido: 0,
      em_negociacao: 0,
      proposta_enviada: 0,
      fechado: 0,
      perdido: 0,
    };

    for (const lead of leads) {
      base[stageOf(lead)] += 1;
    }

    return base;
  }, [leads]);

  const metrics = useMemo(() => {
    const totalLeads = leads.length;
    const leadsToday = leads.filter((lead) => isToday(toDateTime(lead.createdAt))).length;
    const won = pipeline.fechado;
    const openDeals = pipeline.em_negociacao + pipeline.proposta_enviada + pipeline.respondido;
    const pendingActivities = activities.filter((activity) => activity.status === "pendente");
    const overdueActivities = pendingActivities.filter((activity) => {
      const date = toDateTime(activity.data);
      return Boolean(date && date.getTime() < Date.now());
    });
    const proposalsOpen = budgets.filter(
      (budget) => budget.status === "rascunho" || budget.status === "enviado"
    ).length;

    return {
      totalLeads,
      leadsToday,
      won,
      closeRate: totalLeads ? Math.round((won / totalLeads) * 100) : 0,
      openDeals,
      pendingActivities: pendingActivities.length,
      overdueActivities: overdueActivities.length,
      proposalsOpen,
    };
  }, [activities, budgets, leads, pipeline]);

  const priorities = useMemo(
    () => [
      {
        label: "Transformar Maps em campanha",
        detail: `${Math.max(metrics.totalLeads - pipeline.fechado - pipeline.perdido, 0)} leads podem virar audiencia da Altum.`,
        href: "/admin/prospeccao",
        icon: Target,
        tone: "blue" as const,
      },
      {
        label: "Atacar propostas e follow-ups",
        detail: `${metrics.openDeals} oportunidades abertas e ${metrics.proposalsOpen} propostas ativas.`,
        href: "/admin/orcamentos",
        icon: HandCoins,
        tone: "emerald" as const,
      },
      {
        label: "Reduzir risco operacional",
        detail:
          metrics.overdueActivities > 0
            ? `${metrics.overdueActivities} atividades atrasadas pedem acao.`
            : "Nenhuma atividade atrasada encontrada agora.",
        href: "/admin/atividades",
        icon: AlertTriangle,
        tone: metrics.overdueActivities > 0 ? ("amber" as const) : ("slate" as const),
      },
    ],
    [metrics, pipeline]
  );

  const recentLeads = useMemo(() => leads.slice(0, 6), [leads]);
  const nextActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")))
      .slice(0, 5);
  }, [activities]);

  const aiSummary = aiSignals.summary || {};
  const aiTenants = (aiSignals.tenants || []).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-400 to-purple-500" />
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <Radio className="h-3.5 w-3.5" />
                  Operacao da agencia
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  {new Date().toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                </span>
              </div>
              <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Cockpit Altum para vender, entregar e controlar a agencia
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                O admin vira a camada de comando. A operacao completa de conversas,
                CRM e IA continua no workspace do cliente quando isso for melhor para
                o usuario e para a estabilidade da plataforma.
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
              <ActionButton href="/admin/prospeccao/gerar" icon={Rocket} label="Gerar leads Maps" tone="primary" />
              <ActionButton href="/admin/templates" icon={FileText} label="Templates Meta" tone="soft" />
              <ActionButton href="/cliente/painel" icon={MessageSquare} label="Operar workspace" tone="soft" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Diretriz de arquitetura
          </p>
          <div className="mt-4 space-y-4">
            <OperatingLine icon={ShieldCheck} label="Admin" value="Comando, clientes, entrega, financeiro e governanca." />
            <OperatingLine icon={Users} label="Cliente" value="Conversas, CRM, campanhas operacionais e IA do tenant." />
            <OperatingLine icon={Bot} label="Altum" value="Usar tenant interno para operar WhatsApp e IA da propria agencia." />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UserPlus} label="Leads na agencia" value={String(metrics.totalLeads)} hint={`${metrics.leadsToday} captados hoje`} tone="blue" />
        <MetricCard icon={Gauge} label="Taxa de fechamento" value={`${metrics.closeRate}%`} hint={`${metrics.won} fechados no historico`} tone="emerald" />
        <MetricCard icon={FolderKanban} label="Projetos ativos" value={String(projects.length)} hint="Entrega e producao em andamento" tone="purple" />
        <MetricCard icon={Timer} label="Pendencias" value={String(metrics.pendingActivities)} hint={`${metrics.overdueActivities} atrasadas`} tone={metrics.overdueActivities ? "amber" : "slate"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <SectionHeader
            eyebrow="Prioridades de hoje"
            title="Onde colocar energia agora"
            actionHref="/admin/atividades"
            actionLabel="Ver agenda"
          />
          <div className="grid gap-3">
            {priorities.map((item) => (
              <PriorityCard key={item.label} {...item} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeader
            eyebrow="Arsenal da agencia"
            title="O que existe, o que evolui e o que nasce"
            actionHref="/admin/prospeccao"
            actionLabel="Abrir prospeccao"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <ArsenalCard status="Ativo" icon={Target} title="Maps + CRM de prospeccao" text="Busca, filtra, pontua, salva audiencia e prepara campanha." tone="emerald" />
            <ArsenalCard status="Ativo" icon={Send} title="Disparo Meta com midia" text="Templates aprovados, variaveis, header de imagem/video/documento e entrega registrada." tone="blue" />
            <ArsenalCard status="Ativo" icon={Route} title="Contexto para IA" text="Campanha, template e oferta ficam no lead/chat para a IA continuar a resposta." tone="purple" />
            <ArsenalCard status="Proximo" icon={LineChart} title="Compliance e saude" text="Opt-out, limite por lead, risco de cliente, implantacao, receita e qualidade da IA." tone="amber" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Fluxo recomendado"
          title="Prospectar no Maps sem duplicar a area do cliente"
          actionHref="/admin/prospeccao/gerar"
          actionLabel="Gerar nova lista"
        />
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <WorkflowStep number="01" icon={Target} title="Maps" text="Buscar por nicho, cidade, filtros e qualidade." />
          <WorkflowStep number="02" icon={BrainCircuit} title="Qualificar" text="Score, heat, motivos e inteligencia comercial." />
          <WorkflowStep number="03" icon={ClipboardList} title="Lista" text="Salvar como audiencia do tenant Altum." />
          <WorkflowStep number="04" icon={FileText} title="Template" text="Selecionar template Meta aprovado com midia." />
          <WorkflowStep number="05" icon={Send} title="Disparo" text="Registrar entrega, status e oferta enviada." />
          <WorkflowStep number="06" icon={MessageSquare} title="Resposta" text="IA continua no workspace com contexto." />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <SectionHeader
            eyebrow="IA operacional"
            title="Sinais que pedem supervisao da Altum"
            actionHref="/admin/ia"
            actionLabel="Abrir IA"
          />
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard icon={Bot} label="Sinais" value={String(aiSummary.totalSignals || 0)} hint="janela recente" tone="blue" compact />
            <MetricCard icon={Handshake} label="Handoffs" value={String(aiSummary.handoffs || 0)} hint="escalados" tone="amber" compact />
            <MetricCard icon={HandCoins} label="Propostas" value={String(aiSummary.proposalSignals || 0)} hint="intencao comercial" tone="emerald" compact />
            <MetricCard icon={CalendarClock} label="Agenda" value={String(aiSummary.scheduleSignals || 0)} hint="proximo passo" tone="purple" compact />
          </div>

          {aiSignalsLoading ? (
            <EmptyState text="Carregando sinais da IA..." />
          ) : aiTenants.length === 0 ? (
            <EmptyState text="Nenhum tenant com sinal recente da IA." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {aiTenants.map((tenant) => (
                <TenantSignalCard key={tenant.tenantId} tenant={tenant} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <SectionHeader
            eyebrow="Funil comercial"
            title="Movimento da prospeccao ate fechamento"
            actionHref="/admin/pipeline"
            actionLabel="Ver pipeline"
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage) => {
                const value = pipeline[stage];
                const percent = metrics.totalLeads ? Math.round((value / metrics.totalLeads) * 100) : 0;
                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{STAGE_LABEL[stage]}</span>
                      <span>{value} / {percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 to-purple-400"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionHeader
            eyebrow="Ultimos leads"
            title="Entradas recentes da maquina comercial"
            actionHref="/admin/prospeccao"
            actionLabel="Ver todos"
          />
          {recentLeads.length === 0 ? (
            <EmptyState text="Ainda nao existem leads cadastrados." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recentLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <SectionHeader
            eyebrow="Agenda interna"
            title="Proximas acoes da operacao"
            actionHref="/admin/atividades"
            actionLabel="Agenda completa"
          />
          {nextActivities.length === 0 ? (
            <EmptyState text="Nenhuma atividade registrada." />
          ) : (
            <div className="grid gap-3">
              {nextActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
      </section>

      {loading && <p className="text-xs text-slate-500">Carregando dados em tempo real...</p>}
    </div>
  );
}

function ActionButton({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: "primary" | "soft";
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition",
        tone === "primary"
          ? "border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-500"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function OperatingLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
        <Icon className="h-4 w-4 text-blue-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{value}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  actionHref,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  compact,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "emerald" | "purple" | "amber" | "slate";
  compact?: boolean;
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    purple: "border-purple-100 bg-purple-50 text-purple-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
    slate: "border-slate-200 bg-slate-50 text-slate-500",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className={cx("font-semibold text-slate-950", compact ? "mt-2 text-2xl" : "mt-3 text-3xl")}>{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <div className={cx("rounded-lg border p-2", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function PriorityCard({
  label,
  detail,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone: "blue" | "emerald" | "amber" | "slate";
}) {
  const iconTone = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
    slate: "border-slate-200 bg-slate-50 text-slate-500",
  }[tone];

  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border", iconTone)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-950">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

function ArsenalCard({
  status,
  icon: Icon,
  title,
  text,
  tone,
}: {
  status: string;
  icon: LucideIcon;
  title: string;
  text: string;
  tone: "blue" | "emerald" | "purple" | "amber";
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    purple: "border-purple-100 bg-purple-50 text-purple-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={cx("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", toneClass)}>
          <Icon className="h-3.5 w-3.5" />
          {status}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function WorkflowStep({
  number,
  icon: Icon,
  title,
  text,
}: {
  number: string;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black tracking-[0.18em] text-slate-300">{number}</span>
        <Icon className="h-4 w-4 text-blue-600" />
      </div>
      <h3 className="mt-5 text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function TenantSignalCard({
  tenant,
}: {
  tenant: NonNullable<AdminAiSignalsResponse["tenants"]>[number];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{tenant.tenantName}</p>
          <p className="mt-1 truncate text-xs text-slate-400">Tenant {tenant.tenantId}</p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{formatShortDate(tenant.lastSignalAt)}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <span>{tenant.handoffs} handoff</span>
        <span>{tenant.proposalSignals} proposta</span>
        <span>{tenant.scheduleSignals} agenda</span>
      </div>
      {tenant.legacyClientId ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/admin/clientes/${tenant.legacyClientId}`}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cliente
          </Link>
          <Link
            href={`/admin/clientes/${tenant.legacyClientId}/portal`}
            className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            Portal
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function LeadCard({ lead }: { lead: DashboardLead }) {
  return (
    <Link
      href={`/admin/prospeccao/${lead.id}`}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <p className="truncate text-sm font-semibold text-slate-950">{lead.nome || "Lead sem nome"}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{lead.origem || lead.sourceType || "Origem nao informada"}</p>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <CircleDot className="h-3.5 w-3.5" />
          {STAGE_LABEL[stageOf(lead)]}
        </span>
        <span>{formatShortDate(lead.createdAt)}</span>
      </div>
    </Link>
  );
}

function ActivityRow({ activity }: { activity: DashboardActivity }) {
  const done = activity.status === "concluida";

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span
        className={cx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
          done
            ? "border-emerald-100 bg-emerald-50 text-emerald-600"
            : "border-amber-100 bg-amber-50 text-amber-600"
        )}
      >
        {done ? <CheckCircle2 className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-950">{activity.descricao}</p>
        <p className="mt-1 text-xs text-slate-500">{formatShortDate(activity.data)}</p>
      </div>
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
        {done ? "Concluida" : "Pendente"}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-500">
      {text}
    </div>
  );
}
