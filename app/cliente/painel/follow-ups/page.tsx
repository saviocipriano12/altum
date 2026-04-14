"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  ListTodo,
  Search,
  Sparkles,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";
import { getBusinessProfile, getBusinessProfilePlaybookPreset, type BusinessProfileId } from "@/lib/business-profiles";
import { getPipelineStageLabel } from "@/lib/pipeline";

type FollowUpItem = {
  id: string;
  leadId: string;
  title: string;
  type: string;
  priority: string;
  status: "pending" | "done";
  dueAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  overdue?: boolean;
  dueToday?: boolean;
  lead?: {
    id: string;
    nome: string;
    empresa?: string;
    telefone?: string;
    owner?: string;
    ownerId?: string;
    heat?: string;
    priority?: string;
    pipelineStage?: string;
  } | null;
};

type FollowUpsResponse = {
  summary?: {
    total?: number;
    pending?: number;
    done?: number;
    overdue?: number;
    dueToday?: number;
    highPriority?: number;
    proposal?: number;
  };
  items?: FollowUpItem[];
  error?: string;
};

type TenantSettingsResponse = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

type AiSignalLog = {
  id: string;
  leadId?: string;
  chatId?: string;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  confidence?: number | null;
  nextAction?: string | null;
  extractedFields?: Record<string, string> | null;
  createdAt?: unknown;
};

function toDate(value: unknown) {
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
  return null;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityTone(value?: string) {
  const priority = String(value || "").toLowerCase();
  if (priority === "high") return "warning" as const;
  if (priority === "low") return "neutral" as const;
  return "info" as const;
}

function typeLabel(value?: string) {
  const type = String(value || "follow_up").toLowerCase();
  if (type === "ligacao") return "ligacao";
  if (type === "reuniao") return "reuniao";
  if (type === "proposta") return "proposta";
  if (type === "pendencia") return "pendencia";
  return "follow-up";
}

export default function ClienteFollowUpsPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFromQuery = searchParams.get("q") || "";
  const statusFromQuery = searchParams.get("status") || "all";
  const typeFromQuery = searchParams.get("type") || "all";
  const ownerFromQuery = searchParams.get("owner") || "all";
  const priorityFromQuery = searchParams.get("priority") || "all";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FollowUpsResponse>({});
  const [search, setSearch] = useState(searchFromQuery);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "done" | "overdue" | "today">(
    statusFromQuery === "pending" ||
      statusFromQuery === "done" ||
      statusFromQuery === "overdue" ||
      statusFromQuery === "today"
      ? statusFromQuery
      : "all"
  );
  const [typeFilter, setTypeFilter] = useState<"all" | string>(typeFromQuery);
  const [ownerFilter, setOwnerFilter] = useState(ownerFromQuery || "all");
  const [priorityFilter, setPriorityFilter] = useState(priorityFromQuery || "all");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [aiLogs, setAiLogs] = useState<AiSignalLog[]>([]);
  const [showAdvancedDesk, setShowAdvancedDesk] = useState(false);
  const canOperate = hasCapability("edit_leads");

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);
      const [followUpsRes, settingsRes, aiLogsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/follow-ups`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
      ]);
      const payload = (await followUpsRes.json()) as FollowUpsResponse;
      const settingsPayload = (await settingsRes.json()) as TenantSettingsResponse;
      const aiLogsPayload = (await aiLogsRes.json().catch(() => ({}))) as { items?: AiSignalLog[] };
      if (!followUpsRes.ok) throw new Error(payload.error || "Falha ao carregar follow-ups.");
      setData(payload);
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setAiLogs(aiLogsRes.ok ? aiLogsPayload.items || [] : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar follow-ups.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchFromQuery !== search) setSearch(searchFromQuery);
    if (
      statusFromQuery === "pending" ||
      statusFromQuery === "done" ||
      statusFromQuery === "overdue" ||
      statusFromQuery === "today"
    ) {
      if (statusFromQuery !== statusFilter) setStatusFilter(statusFromQuery);
    } else if (statusFilter !== "all") {
      setStatusFilter("all");
    }
    if ((typeFromQuery || "all") !== typeFilter) setTypeFilter(typeFromQuery || "all");
    if ((ownerFromQuery || "all") !== ownerFilter) setOwnerFilter(ownerFromQuery || "all");
    if ((priorityFromQuery || "all") !== priorityFilter) setPriorityFilter(priorityFromQuery || "all");
  }, [ownerFilter, ownerFromQuery, priorityFilter, priorityFromQuery, searchFromQuery, statusFromQuery, typeFromQuery, search, statusFilter, typeFilter]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (ownerFilter !== "all") next.set("owner", ownerFilter);
    if (priorityFilter !== "all") next.set("priority", priorityFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/follow-ups?${nextQuery}` : "/cliente/painel/follow-ups");
  }, [ownerFilter, priorityFilter, router, search, searchParams, statusFilter, typeFilter]);

  const items = useMemo(() => data.items || [], [data.items]);
  const summary = data.summary || {};
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const playbookPreset = useMemo(() => getBusinessProfilePlaybookPreset(businessProfileId), [businessProfileId]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "pending" && item.status !== "pending") return false;
      if (statusFilter === "done" && item.status !== "done") return false;
      if (statusFilter === "overdue" && !item.overdue) return false;
      if (statusFilter === "today" && !item.dueToday) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (ownerFilter === "unassigned" && item.lead?.ownerId) return false;
      if (ownerFilter !== "all" && ownerFilter !== "unassigned" && item.lead?.ownerId !== ownerFilter) return false;
      if (priorityFilter !== "all" && String(item.priority || "").toLowerCase() !== priorityFilter) return false;
      if (
        normalizedSearch &&
        !`${item.title} ${item.type} ${item.lead?.nome || ""} ${item.lead?.empresa || ""} ${item.lead?.owner || ""}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [items, ownerFilter, priorityFilter, search, statusFilter, typeFilter]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.type).filter(Boolean))).sort();
  }, [items]);
  const ownerOptions = useMemo(() => {
    return Array.from(
      new Map(
        items
          .filter((item) => item.lead?.ownerId)
          .map((item) => [String(item.lead?.ownerId), String(item.lead?.owner || "Sem responsavel")])
      )
    ).map(([value, label]) => ({ value, label }));
  }, [items]);
  const ownerLoad = useMemo(() => {
    return Array.from(
      items.reduce((acc, item) => {
        const key = String(item.lead?.ownerId || "unassigned");
        const current = acc.get(key) || {
          id: key,
          name: String(item.lead?.owner || "Sem responsavel"),
          total: 0,
          overdue: 0,
          high: 0,
        };
        current.total += 1;
        if (item.overdue) current.overdue += 1;
        if (String(item.priority || "").toLowerCase() === "high") current.high += 1;
        acc.set(key, current);
        return acc;
      }, new Map<string, { id: string; name: string; total: number; overdue: number; high: number }>())
    )
      .map(([, value]) => value)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [items]);
  const nextWindow = useMemo(() => {
    const now = Date.now();
    const tomorrow = now + 48 * 60 * 60 * 1000;
    return items.filter((item) => {
      if (item.status !== "pending") return false;
      const due = toDate(item.dueAt)?.getTime() || 0;
      return due && due >= now && due <= tomorrow;
    }).length;
  }, [items]);
  const deskAiSuggestions = useMemo(() => {
    const activeLeadIds = new Set(items.filter((item) => item.status === "pending").map((item) => item.leadId).filter(Boolean));
    return aiLogs
      .filter((item) => item.leadId && activeLeadIds.has(item.leadId) && item.nextAction)
      .slice(0, 4);
  }, [aiLogs, items]);

  function applySimpleScenario(mode: "urgent" | "today" | "proposal") {
    setSearch("");
    setOwnerFilter("all");
    if (mode === "urgent") {
      setStatusFilter("overdue");
      setPriorityFilter("high");
      setTypeFilter("all");
      return;
    }

    if (mode === "proposal") {
      setStatusFilter("pending");
      setPriorityFilter("all");
      setTypeFilter("proposta");
      return;
    }

    setStatusFilter("today");
    setPriorityFilter("all");
    setTypeFilter("all");
  }

  async function toggleTask(item: FollowUpItem) {
    if (!tenant?.tenantId || !item.leadId || !canOperate) return;

    try {
      setBusyTaskId(item.id);
      const nextStatus = item.status === "done" ? "pending" : "done";
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${item.leadId}/tasks/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao atualizar follow-up.");
      await loadData();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Falha ao atualizar follow-up.");
    } finally {
      setBusyTaskId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-white/60">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Falha ao carregar desk de follow-ups"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
          >
            Tentar novamente
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Modo simples do follow-up"
            subtitle="Se estiver em duvida, siga esse fluxo rapido para nao perder lead."
            action={<StateBadge label="3 passos" tone="info" />}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/80">Passo 1</p>
              <p className="mt-2 text-sm font-medium text-white">Resolver vencidos</p>
              <p className="mt-1 text-xs text-white/60">Puxa imediatamente tudo que ja estourou prazo.</p>
              <button
                type="button"
                onClick={() => applySimpleScenario("urgent")}
                className="mt-3 rounded-xl border border-red-200/25 bg-red-500/20 px-3 py-2 text-xs font-medium text-red-100 transition hover:bg-red-500/30"
              >
                Ver vencidos agora
              </button>
            </div>

            <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">Passo 2</p>
              <p className="mt-2 text-sm font-medium text-white">Executar agenda do dia</p>
              <p className="mt-1 text-xs text-white/60">Trata os follow-ups pendentes antes de abrir novas frentes.</p>
              <button
                type="button"
                onClick={() => applySimpleScenario("today")}
                className="mt-3 rounded-xl border border-amber-200/25 bg-amber-500/20 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/30"
              >
                Ver pendentes do dia
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/80">Passo 3</p>
              <p className="mt-2 text-sm font-medium text-white">Avancar propostas</p>
              <p className="mt-1 text-xs text-white/60">Foco em leads que ja estao perto de fechar.</p>
              <button
                type="button"
                onClick={() => applySimpleScenario("proposal")}
                className="mt-3 rounded-xl border border-emerald-200/25 bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/30"
              >
                Ver propostas abertas
              </button>
            </div>
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <SectionHeader title="Configuracao rapida" subtitle="Como operar sem travar no excesso de informacao." />
          <div className="space-y-3 text-sm text-white/70">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="font-medium text-white">1. Defina quem responde cada fila</p>
              <p className="mt-1 text-xs text-white/55">Sem owner claro, o follow-up sempre estoura. Use a distribuicao no inbox.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="font-medium text-white">2. Trabalhe por prioridade e prazo</p>
              <p className="mt-1 text-xs text-white/55">Primeiro vencidos, depois hoje, depois propostas. Esse fluxo evita perda de lead.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="font-medium text-white">3. Feche ciclo no CRM</p>
              <p className="mt-1 text-xs text-white/55">Toda interacao precisa atualizar stage/nota para a IA aprender e priorizar melhor.</p>
            </div>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Desk de follow-ups"
            subtitle="Proximos passos comerciais, tarefas vencidas e cadencia operacional do tenant."
            action={<StateBadge label={`${summary.pending || 0} pendentes`} tone={(summary.pending || 0) > 0 ? "warning" : "success"} />}
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Pendentes" value={String(summary.pending || 0)} icon={ListTodo} trend="tarefas abertas" />
            <MetricCard label="Vencidos" value={String(summary.overdue || 0)} icon={AlertTriangle} trend="prioridade imediata" />
            <MetricCard label="Hoje" value={String(summary.dueToday || 0)} icon={CalendarClock} trend="janela atual" />
            <MetricCard label="Etapa proposta" value={String(summary.proposal || 0)} icon={Sparkles} trend="follow-up comercial" />
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <SectionHeader title="Leitura executiva" subtitle="O que tratar primeiro para nao perder oportunidade." />
          <div className="space-y-3">
            <SignalCard title="Atencao imediata" detail={`${summary.overdue || 0} follow-up(s) vencidos e ${summary.highPriority || 0} de alta prioridade.`} tone={(summary.overdue || 0) > 0 ? "danger" : "neutral"} />
            <SignalCard title="Ritmo do dia" detail={`${summary.dueToday || 0} tarefa(s) vencem hoje e pedem revisao do desk.`} tone={(summary.dueToday || 0) > 0 ? "warning" : "neutral"} />
            <SignalCard title="Backlog concluido" detail={`${summary.done || 0} follow-up(s) ja foram fechados no periodo atual.`} tone={(summary.done || 0) > 0 ? "success" : "neutral"} />
            <SignalCard title="Proximas 48h" detail={`${nextWindow} follow-up(s) entram na janela critica das proximas 48 horas.`} tone={nextWindow > 0 ? "info" : "neutral"} />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Modo operacional do follow-up"
            subtitle="O desk comercial fica mais assertivo quando seguimos o contexto natural do negocio."
            action={
              <div className="flex items-center gap-2">
                <StateBadge label={businessProfile.label} tone="info" />
                <button
                  type="button"
                  onClick={() => setShowAdvancedDesk((current) => !current)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/[0.08]"
                >
                  {showAdvancedDesk ? "Ocultar avancado" : "Mostrar avancado"}
                </button>
              </div>
            }
          />
          {showAdvancedDesk ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Movimento esperado</p>
              <p className="mt-2 text-sm text-white/84">{businessProfile.commercialMotion}</p>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Metricas mais naturais</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {businessProfile.metrics.slice(0, 4).map((metric) => (
                  <span key={metric} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                    {metric}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Campos para validar no contato</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {businessProfile.crm.leadFields.slice(0, 6).map((field) => (
                  <span key={field} className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                    {field}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Perguntas que nao podem faltar</p>
              <div className="mt-2 space-y-2">
                {businessProfile.ai.mandatoryQuestions.slice(0, 3).map((question) => (
                  <div key={question} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/64">
                    {question}
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm text-white/84">
                O modo avancado fica escondido para manter a operacao simples no dia a dia.
                Quando precisar calibrar playbook, campos e narrativa comercial, clique em <span className="font-semibold">Mostrar avancado</span>.
              </p>
            </div>
          )}
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <SectionHeader title="Playbook sugerido" subtitle="Atalhos para retomar negociacao sem perder a narrativa comercial." />
          <div className="space-y-3">
            {playbookPreset.offers.slice(0, 2).map((offer) => (
              <div key={`${offer.title}-${offer.category}`} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{offer.title}</p>
                  <StateBadge label={offer.category} tone="info" />
                </div>
                <p className="mt-2 text-xs text-white/58">
                  Entrar quando: {offer.whenToOffer}
                </p>
                <p className="mt-1 text-xs text-white/46">
                  Faixa sugerida: R$ {offer.priceFrom.toLocaleString("pt-BR")} a R$ {offer.priceTo.toLocaleString("pt-BR")}
                </p>
              </div>
            ))}

            <div className="rounded-2xl border border-amber-300/14 bg-amber-500/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Cena de follow-up</p>
              <p className="mt-2 text-sm text-amber-50">
                {playbookPreset.scripts[0]?.situation || "Sem script sugerido para este perfil."}
              </p>
              <p className="mt-1 text-xs leading-6 text-amber-100/72">
                {playbookPreset.scripts[0]?.script || "Quando o time calibrar mais o playbook, essa area passa a refletir o melhor caminho de retomada."}
              </p>
            </div>
          </div>
        </PanelCard>
      </section>

      {deskAiSuggestions.length ? (
        <section>
          <PanelCard className="p-5 md:p-6">
            <SectionHeader
              title="Sugestoes da IA para o desk"
              subtitle="Ultimos proximos passos detectados pela IA para leads que seguem em follow-up."
              action={<StateBadge label={`${deskAiSuggestions.length} sinais`} tone="info" />}
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {deskAiSuggestions.map((log) => {
                const relatedItem = items.find((item) => item.leadId === log.leadId);
                return (
                  <div key={log.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-sm font-medium text-white">{relatedItem?.lead?.nome || "Lead"}</p>
                    <p className="mt-1 text-xs text-white/48">{log.nextAction}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(log.extractedFields || {}).slice(0, 3).map(([field, value]) => (
                        <span key={`${log.id}_${field}`} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">
                          {field}: {value}
                        </span>
                      ))}
                    </div>
                    {relatedItem?.leadId ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(relatedItem.leadId)}`} className="text-blue-200 hover:text-blue-100">
                          CRM
                        </Link>
                        <Link href={`/cliente/painel/comercial?leadId=${encodeURIComponent(relatedItem.leadId)}`} className="text-blue-200 hover:text-blue-100">
                          Comercial
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </PanelCard>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
      <PanelCard className="p-5 md:p-6">
        <SectionHeader title="Fila ativa" subtitle="Filtre por status, tipo e caia no modulo certo sem perder contexto." />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2 flex items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-white/70">
            <Search className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar lead, empresa, owner ou tarefa"
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
            />
          </label>

          <FilterSelect
            label="Status"
            value={statusFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "pending", label: "Pendentes" },
              { value: "today", label: "Vencem hoje" },
              { value: "overdue", label: "Vencidos" },
              { value: "done", label: "Concluidos" },
            ]}
            onChange={(value) => setStatusFilter(value as "all" | "pending" | "done" | "overdue" | "today")}
          />
          <FilterSelect
            label="Tipo"
            value={typeFilter}
            options={[{ value: "all", label: "Todos" }, ...typeOptions.map((item) => ({ value: item, label: typeLabel(item) }))]}
            onChange={(value) => setTypeFilter(value)}
          />
          <FilterSelect
            label="Owner"
            value={ownerFilter}
            options={[{ value: "all", label: "Todos" }, { value: "unassigned", label: "Sem responsavel" }, ...ownerOptions]}
            onChange={(value) => setOwnerFilter(value)}
          />
          <FilterSelect
            label="Prioridade"
            value={priorityFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "high", label: "Alta" },
              { value: "medium", label: "Media" },
              { value: "low", label: "Baixa" },
            ]}
            onChange={(value) => setPriorityFilter(value)}
          />
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/42">Acao rapida</p>
            <Link href="/cliente/painel/crm" className="mt-1 inline-flex text-sm text-blue-200 hover:text-blue-100">
              Criar follow-up no CRM
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filteredItems.length ? (
            filteredItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <StateBadge label={typeLabel(item.type)} tone="info" />
                      <StateBadge label={item.status === "done" ? "concluido" : item.overdue ? "vencido" : "pendente"} tone={item.status === "done" ? "success" : item.overdue ? "danger" : "warning"} />
                      <StateBadge label={String(item.priority || "medium")} tone={priorityTone(item.priority)} />
                    </div>
                    <p className="mt-1 text-xs text-white/46">
                      {item.lead?.nome || "Lead"} {item.lead?.empresa ? `| ${item.lead.empresa}` : ""} {item.lead?.owner ? `| ${item.lead.owner}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleTask(item)}
                      disabled={busyTaskId === item.id || !canOperate}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/84 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyTaskId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {!canOperate ? "Somente leitura" : item.status === "done" ? "Reabrir" : "Concluir"}
                    </button>
                    {item.leadId ? (
                      <>
                        <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.08]">
                          CRM
                        </Link>
                        <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.08]">
                          Inbox
                        </Link>
                        <Link href={`/cliente/painel/comercial?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.08]">
                          Comercial
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <InfoTile label="Prazo" value={item.dueAt ? formatDateTime(item.dueAt) : "Sem prazo"} />
                  <InfoTile label="Etapa" value={getPipelineStageLabel(item.lead?.pipelineStage || "captado")} />
                  <InfoTile label="Temperatura" value={String(item.lead?.heat || "morno")} />
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Nenhum follow-up encontrado" description="Ajuste os filtros ou crie novas tarefas a partir do CRM e do inbox." />
          )}
        </div>
      </PanelCard>

      <div className="space-y-4">
        <PanelCard className="p-5">
          <SectionHeader title="Carga por owner" subtitle="Quem esta carregando o desk comercial." />
          <div className="space-y-3">
            {ownerLoad.length ? (
              ownerLoad.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOwnerFilter(item.id)}
                  className="w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-white/46">
                        {item.overdue} vencido(s) | {item.high} alta prioridade
                      </p>
                    </div>
                    <StateBadge label={String(item.total)} tone={item.overdue > 0 ? "warning" : "info"} />
                  </div>
                </button>
              ))
            ) : (
              <EmptyState title="Sem owners mapeados" description="Os follow-ups atribuidos passam a aparecer aqui." />
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <SectionHeader title="Playbook rapido" subtitle="Atalhos para fechar pendencias sem perder contexto." />
          <div className="space-y-3">
            <QuickLink href="/cliente/painel/inbox?queue=awaiting_reply" title="Cobrar resposta" description="Abrir conversas aguardando retorno para puxar o follow-up no canal certo." />
            <QuickLink href="/cliente/painel/comercial?budgetStatus=sent" title="Propostas em aberto" description="Tratar follow-ups na etapa mais quente do funil comercial." />
            <QuickLink href="/cliente/painel/crm?priority=high" title="Leads prioritarios" description="Cruzar follow-up com contexto completo do lead antes da abordagem." />
          </div>
        </PanelCard>
      </div>
      </section>
    </div>
  );
}

function SignalCard({ title, detail, tone }: { title: string; detail: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs text-white/50">{detail}</p>
        </div>
        <StateBadge label="desk" tone={tone} />
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">{label}</p>
      <p className="mt-2 text-sm text-white/84">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-xs text-white/45">
      <span className="block uppercase tracking-[0.16em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#111111] text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/10 bg-black/25 p-3 transition hover:bg-white/[0.04]"
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs text-white/48">{description}</p>
    </Link>
  );
}
