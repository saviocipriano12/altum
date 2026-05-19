"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircle,
  Search,
  Target,
  UserRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, EmptyState, MetricCard, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";
import { getPipelineStageLabel } from "@/lib/pipeline";

type FollowUpItem = {
  id: string;
  leadId: string;
  title: string;
  type: string;
  priority: string;
  dynamicPriority?: string;
  status: "pending" | "done";
  dueAt?: unknown;
  overdue?: boolean;
  dueToday?: boolean;
  silenceHours?: number;
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
    dynamicUrgent?: number;
    dynamicHigh?: number;
    proposal?: number;
  };
  items?: FollowUpItem[];
  error?: string;
};

type ViewKey = "now" | "today" | "proposal" | "all" | "done";

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
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

function dateMillis(value: unknown) {
  return toDate(value)?.getTime() || 0;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem prazo";
  return date.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(value?: string) {
  const type = String(value || "follow_up").toLowerCase();
  if (type === "ligacao" || type === "call") return "Ligar";
  if (type === "reuniao") return "Reuniao";
  if (type === "proposta") return "Proposta";
  if (type === "pendencia") return "Pendencia";
  return "Retorno";
}

function priorityLabel(item: FollowUpItem) {
  const priority = String(item.dynamicPriority || item.priority || "medium").toLowerCase();
  if (priority === "urgent") return "Urgente";
  if (priority === "high") return "Alta";
  if (priority === "low") return "Baixa";
  return "Media";
}

function priorityTone(item: FollowUpItem) {
  const priority = String(item.dynamicPriority || item.priority || "medium").toLowerCase();
  if (priority === "urgent") return "danger" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "low") return "neutral" as const;
  return "info" as const;
}

function dueTone(item: FollowUpItem) {
  if (item.status === "done") return "success" as const;
  if (item.overdue) return "danger" as const;
  if (item.dueToday) return "warning" as const;
  return "neutral" as const;
}

function dueLabel(item: FollowUpItem) {
  if (item.status === "done") return "Concluido";
  if (item.overdue) return "Atrasado";
  if (item.dueToday) return "Hoje";
  return formatDateTime(item.dueAt);
}

function isProposal(item: FollowUpItem) {
  const type = String(item.type || "").toLowerCase();
  const stage = String(item.lead?.pipelineStage || "").toLowerCase();
  return type === "proposta" || stage.includes("proposta") || stage.includes("fechamento");
}

function isUrgent(item: FollowUpItem) {
  const dynamic = String(item.dynamicPriority || "").toLowerCase();
  return item.status === "pending" && (item.overdue || dynamic === "urgent" || dynamic === "high");
}

export default function ClienteFollowUpsPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canOperate = hasCapability("edit_leads");
  const viewFromQuery = searchParams.get("view") || searchParams.get("status") || "now";
  const ownerFromQuery = searchParams.get("owner") || "all";
  const queryFromUrl = searchParams.get("q") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<FollowUpsResponse>({});
  const [view, setView] = useState<ViewKey>(normalizeView(viewFromQuery));
  const [owner, setOwner] = useState(ownerFromQuery);
  const [search, setSearch] = useState(queryFromUrl);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/follow-ups`);
      const payload = (await res.json()) as FollowUpsResponse;
      if (!res.ok) {
        setError(payload.error || "Falha ao carregar retornos.");
        return;
      }
      setData(payload);
    } catch {
      setError("Falha ao carregar retornos.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const nextView = normalizeView(viewFromQuery);
    setView((current) => (current === nextView ? current : nextView));
    setOwner((current) => (current === ownerFromQuery ? current : ownerFromQuery));
    setSearch((current) => (current === queryFromUrl ? current : queryFromUrl));
  }, [ownerFromQuery, queryFromUrl, viewFromQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== "now") next.set("view", view);
    if (owner !== "all") next.set("owner", owner);
    if (search.trim()) next.set("q", search.trim());
    const query = next.toString();
    const current = searchParams.toString();
    if (query === current) return;
    router.replace(query ? `/cliente/painel/follow-ups?${query}` : "/cliente/painel/follow-ups");
  }, [owner, router, search, searchParams, view]);

  const items = useMemo(() => data.items || [], [data.items]);
  const pendingItems = useMemo(() => items.filter((item) => item.status === "pending"), [items]);
  const summary = useMemo(() => {
    return {
      pending: pendingItems.length,
      overdue: pendingItems.filter((item) => item.overdue).length,
      today: pendingItems.filter((item) => item.dueToday).length,
      proposals: pendingItems.filter(isProposal).length,
      done: items.filter((item) => item.status === "done").length,
    };
  }, [items, pendingItems]);

  const ownerOptions = useMemo(() => {
    return Array.from(
      new Map(
        items
          .filter((item) => item.lead?.ownerId)
          .map((item) => [String(item.lead?.ownerId), String(item.lead?.owner || "Responsavel")] as const)
      )
    ).map(([value, label]) => ({ value, label }));
  }, [items]);

  const ownerLoad = useMemo(() => {
    return Array.from(
      pendingItems.reduce((acc, item) => {
        const key = item.lead?.ownerId || "unassigned";
        const current = acc.get(key) || {
          id: key,
          name: item.lead?.owner || "Sem responsavel",
          total: 0,
          late: 0,
        };
        current.total += 1;
        if (item.overdue) current.late += 1;
        acc.set(key, current);
        return acc;
      }, new Map<string, { id: string; name: string; total: number; late: number }>())
    )
      .map(([, value]) => value)
      .sort((a, b) => b.late - a.late || b.total - a.total)
      .slice(0, 6);
  }, [pendingItems]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (view === "now" && !isUrgent(item)) return false;
      if (view === "today" && !(item.status === "pending" && item.dueToday)) return false;
      if (view === "proposal" && !(item.status === "pending" && isProposal(item))) return false;
      if (view === "all" && item.status !== "pending") return false;
      if (view === "done" && item.status !== "done") return false;
      if (owner === "unassigned" && item.lead?.ownerId) return false;
      if (owner !== "all" && owner !== "unassigned" && item.lead?.ownerId !== owner) return false;
      if (term) {
        const haystack = `${item.title} ${item.type} ${item.lead?.nome || ""} ${item.lead?.empresa || ""} ${item.lead?.owner || ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [items, owner, search, view]);

  const orderedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      if (a.status !== b.status) return a.status === "done" ? 1 : -1;
      if (Number(a.overdue) !== Number(b.overdue)) return Number(b.overdue) - Number(a.overdue);
      if (Number(a.dueToday) !== Number(b.dueToday)) return Number(b.dueToday) - Number(a.dueToday);
      return dateMillis(a.dueAt) - dateMillis(b.dueAt);
    });
  }, [filteredItems]);

  async function toggleTask(item: FollowUpItem) {
    if (!tenant?.tenantId || !item.leadId || !canOperate) return;

    try {
      setBusyTaskId(item.id);
      setError(null);
      setNotice(null);
      const nextStatus = item.status === "done" ? "pending" : "done";
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${item.leadId}/tasks/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar retorno.");
        return;
      }
      setNotice(nextStatus === "done" ? "Retorno concluido." : "Retorno reaberto.");
      await loadData();
    } catch {
      setError("Falha ao atualizar retorno.");
    } finally {
      setBusyTaskId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Falha ao carregar retornos"
        description={error}
        action={
          <button type="button" onClick={() => void loadData()} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
            Tentar novamente
          </button>
        }
      />
    );
  }

  return (
    <div className="followups-refined client-daily-page space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,#2563eb_18%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,#eff6ff_84%,var(--cliente-card)),color-mix(in_srgb,#f5f3ff_70%,var(--cliente-panel-soft)))] p-5 shadow-[0_24px_70px_-48px_rgba(37,99,235,0.5)] md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <StateBadge label="Follow-ups" tone="info" />
              <StateBadge label="O que fazer agora" tone="warning" />
            </div>
            <h1 className="mt-5 text-3xl font-black leading-tight tracking-[-0.03em] text-[var(--cliente-card-text)] md:text-5xl">
              Retornos claros para nao perder venda por falta de proximo passo.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)] md:text-base">
              Comece pelos atrasados, resolva o que vence hoje e acompanhe propostas sem linguagem tecnica.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/cliente/painel/agenda" className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
              Ver compromissos
            </Link>
            <Link href="/cliente/painel/crm" className="inline-flex items-center gap-2 rounded-[16px] bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]">
              Abrir clientes
            </Link>
          </div>
        </div>
      </section>

      {notice ? <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Fazer agora" value={String(summary.overdue)} icon={AlertTriangle} trend="atrasados" tone={summary.overdue ? "danger" : "success"} />
        <MetricCard label="Hoje" value={String(summary.today)} icon={CalendarCheck} trend="vencem no dia" tone="brand" />
        <MetricCard label="Propostas" value={String(summary.proposals)} icon={Target} trend="perto de venda" tone="warning" />
        <MetricCard label="Pendentes" value={String(summary.pending)} icon={Clock3} trend="fila aberta" tone="neutral" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Lista de retornos" subtitle="Filtre pelo momento e conclua o que ja foi resolvido." />
            <label className="flex min-w-[260px] items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, empresa ou responsavel"
                className="w-full bg-transparent text-sm text-[var(--cliente-card-text)] outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {[
              { value: "now", label: "Agora" },
              { value: "today", label: "Hoje" },
              { value: "proposal", label: "Propostas" },
              { value: "all", label: "Pendentes" },
              { value: "done", label: "Concluidos" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setView(option.value as ViewKey)}
                className={`rounded-[16px] border px-3 py-2.5 text-sm font-bold transition ${
                  view === option.value
                    ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_11%,var(--cliente-card))] text-[#2563eb]"
                    : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-hover)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <select value={owner} onChange={(event) => setOwner(event.target.value)} className="client-input rounded-2xl border px-3 py-2.5 text-sm outline-none">
              <option value="all">Todos os responsaveis</option>
              <option value="unassigned">Sem responsavel</option>
              {ownerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Link href="/cliente/painel/crm" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
              Criar retorno no CRM
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {orderedItems.length ? (
              orderedItems.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:bg-[var(--cliente-surface-hover)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-black text-[var(--cliente-card-text)]">{item.title || "Retorno"}</p>
                        <StateBadge label={typeLabel(item.type)} tone="info" />
                        <StateBadge label={dueLabel(item)} tone={dueTone(item)} />
                        <StateBadge label={priorityLabel(item)} tone={priorityTone(item)} />
                      </div>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                        {item.lead?.nome || "Cliente"} {item.lead?.empresa ? `| ${item.lead.empresa}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleTask(item)}
                      disabled={busyTaskId === item.id || !canOperate}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        item.status === "done"
                          ? "border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)] hover:bg-[var(--cliente-surface-hover)]"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {busyTaskId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {!canOperate ? "Somente leitura" : item.status === "done" ? "Reabrir" : "Concluir"}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <InfoPill icon={Clock3} label={formatDateTime(item.dueAt)} />
                    <InfoPill icon={UserRound} label={item.lead?.owner || "Sem responsavel"} />
                    <InfoPill icon={Target} label={getPipelineStageLabel(item.lead?.pipelineStage || "captado")} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.leadId ? (
                      <>
                        <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
                          Abrir cliente
                        </Link>
                        <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
                          <MessageCircle className="h-4 w-4" />
                          Conversa
                        </Link>
                      </>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Nenhum retorno aqui" description="Troque o filtro ou crie um retorno dentro do cliente no CRM." />
            )}
          </div>
        </PanelCard>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="warning" className="p-5">
            <CardTitle title="Como usar" subtitle="A rotina fica simples quando segue esta ordem." />
            <div className="mt-4 space-y-2">
              <PlanStep number="1" title="Resolva atrasados" detail="Evita perder clientes que ja esperam resposta." onClick={() => setView("now")} />
              <PlanStep number="2" title="Passe pelo dia" detail="Veja tudo que precisa acontecer hoje." onClick={() => setView("today")} />
              <PlanStep number="3" title="Cuide das propostas" detail="Priorize contatos mais perto de venda." onClick={() => setView("proposal")} />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Por responsavel" subtitle="Quem tem retorno aberto agora." />
            <div className="mt-4 space-y-2">
              {ownerLoad.length ? (
                ownerLoad.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOwner(item.id)}
                    className="w-full rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-left transition hover:bg-[var(--cliente-surface-hover)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[var(--cliente-card-text)]">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.late} atrasado(s)</p>
                      </div>
                      <StateBadge label={String(item.total)} tone={item.late ? "warning" : "info"} />
                    </div>
                  </button>
                ))
              ) : (
                <p className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
                  Sem retornos pendentes por responsavel.
                </p>
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Atalhos" subtitle="Ir direto para onde resolve." />
            <div className="mt-4 grid gap-2">
              <Shortcut href="/cliente/painel/agenda" icon={CalendarCheck} label="Compromissos marcados" />
              <Shortcut href="/cliente/painel/inbox" icon={MessageCircle} label="Conversas abertas" />
              <Shortcut href="/cliente/painel/crm" icon={UserRound} label="Clientes e oportunidades" />
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function normalizeView(value: string): ViewKey {
  if (value === "today") return "today";
  if (value === "proposal") return "proposal";
  if (value === "all" || value === "pending") return "all";
  if (value === "done") return "done";
  return "now";
}

function InfoPill({ icon: Icon, label }: { icon: typeof Search; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)]">
      <Icon className="h-4 w-4 text-[#2563eb]" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function PlanStep({ number, title, detail, onClick }: { number: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-left transition hover:-translate-y-0.5 hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[#2563eb] text-xs font-black text-white">{number}</span>
        <span>
          <span className="block text-sm font-black text-[var(--cliente-card-text)]">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--cliente-card-text-muted)]">{detail}</span>
        </span>
      </div>
    </button>
  );
}

function Shortcut({ href, icon: Icon, label }: { href: string; icon: typeof Search; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
      <Icon className="h-4 w-4 text-[#2563eb]" />
      {label}
    </Link>
  );
}
