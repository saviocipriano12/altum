"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CrmAvatar,
  CrmBadge,
  CrmButton,
  CrmEmpty,
  CrmHero,
  CrmInput,
  CrmLinkButton,
  CrmMetric,
  CrmNotice,
  CrmPanel,
  CrmSectionTitle,
  CrmSelect,
  CrmWorkspace,
  formatCrmDate,
  toCrmDate,
} from "@/app/cliente/painel/components/crm-workspace";
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
    proposal?: number;
  };
  items?: FollowUpItem[];
  error?: string;
};

type ViewKey = "now" | "today" | "proposal" | "all" | "done";

const views: Array<{ id: ViewKey; label: string }> = [
  { id: "now", label: "Prioridade" },
  { id: "today", label: "Hoje" },
  { id: "proposal", label: "Propostas" },
  { id: "all", label: "Pendentes" },
  { id: "done", label: "Concluidos" },
];

function millis(value: unknown) {
  return toCrmDate(value)?.getTime() || 0;
}

function isProposal(item: FollowUpItem) {
  return `${item.title} ${item.type}`.toLowerCase().includes("proposta");
}

function isUrgent(item: FollowUpItem) {
  const priority = String(item.dynamicPriority || item.priority || "").toLowerCase();
  return item.status === "pending" && (item.overdue || item.dueToday || priority === "urgent" || priority === "high" || isProposal(item));
}

function priorityTone(item: FollowUpItem) {
  const priority = String(item.dynamicPriority || item.priority || "").toLowerCase();
  if (item.overdue || priority === "urgent") return "red" as const;
  if (item.dueToday || priority === "high") return "orange" as const;
  if (priority === "low") return "neutral" as const;
  return "blue" as const;
}

export default function ClienteFollowUpsPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("edit_leads");

  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [summary, setSummary] = useState<FollowUpsResponse["summary"]>({});
  const [view, setView] = useState<ViewKey>("now");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/follow-ups`);
      const payload = (await res.json()) as FollowUpsResponse;
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao carregar retornos.");
      setItems(payload.items || []);
      setSummary(payload.summary || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar retornos.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (item.lead?.ownerId) map.set(item.lead.ownerId, item.lead.owner || "Responsavel");
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (view === "now" && !isUrgent(item)) return false;
        if (view === "today" && !(item.status === "pending" && item.dueToday)) return false;
        if (view === "proposal" && !(item.status === "pending" && isProposal(item))) return false;
        if (view === "all" && item.status !== "pending") return false;
        if (view === "done" && item.status !== "done") return false;
        if (owner === "unassigned" && item.lead?.ownerId) return false;
        if (owner !== "all" && owner !== "unassigned" && item.lead?.ownerId !== owner) return false;
        if (!term) return true;
        return `${item.title} ${item.type} ${item.lead?.nome || ""} ${item.lead?.empresa || ""} ${item.lead?.owner || ""}`.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "done" ? 1 : -1;
        if (Number(a.overdue) !== Number(b.overdue)) return Number(b.overdue) - Number(a.overdue);
        if (Number(a.dueToday) !== Number(b.dueToday)) return Number(b.dueToday) - Number(a.dueToday);
        return millis(a.dueAt) - millis(b.dueAt);
      });
  }, [items, owner, search, view]);

  async function toggleTask(item: FollowUpItem) {
    if (!tenant?.tenantId || !item.leadId || !canOperate) return;
    setBusyTaskId(item.id);
    setError(null);
    setNotice(null);
    const nextStatus = item.status === "done" ? "pending" : "done";
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${item.leadId}/tasks/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar retorno.");
      setNotice(nextStatus === "done" ? "Retorno concluido." : "Retorno reaberto.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar retorno.");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <CrmWorkspace>
      <CrmHero
        active="Atividades"
        title="Proximas acoes do CRM, sem perder venda no caminho."
        description="A mesa de atividades mostra atrasos, retornos de hoje e propostas que precisam de cuidado comercial."
        assistantTitle="Fila inteligente"
        assistantSubtitle="Retornos em ordem"
        assistantText="A Altum organiza atrasos, retornos de hoje e propostas para o time executar sem procurar tarefa em varias telas."
        action={
          <>
            <CrmButton type="button" onClick={loadData}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </CrmButton>
            <CrmLinkButton href="/cliente/painel/agenda" tone="primary">
              Agenda
              <ArrowRight className="h-4 w-4" />
            </CrmLinkButton>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <CrmMetric label="Pendentes" value={String(summary?.pending ?? 0)} detail="retornos abertos" icon={Clock3} tone="blue" />
          <CrmMetric label="Vencidos" value={String(summary?.overdue ?? 0)} detail="precisam resposta" icon={AlertTriangle} tone={(summary?.overdue || 0) > 0 ? "red" : "neutral"} />
          <CrmMetric label="Hoje" value={String(summary?.dueToday ?? 0)} detail="na agenda do time" icon={CalendarCheck} tone="orange" />
          <CrmMetric label="Propostas" value={String(summary?.proposal ?? 0)} detail="com chance comercial" icon={MessageSquareText} tone="purple" />
        </div>
      </CrmHero>

      {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}
      {notice ? <CrmNotice tone="green">{notice}</CrmNotice> : null}

      <CrmPanel padded={false} className="overflow-hidden">
        <div className="border-b border-[var(--cliente-border)] p-5">
          <CrmSectionTitle
            eyebrow="Atividades"
            title="Fila de trabalho"
            description="Tudo que precisa ser feito para responder, vender e acompanhar clientes."
            action={!canOperate ? <CrmBadge tone="orange">somente leitura</CrmBadge> : null}
          />

          <div className="mt-5 flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-muted)]" />
              <CrmInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato, empresa, responsavel..." className="w-full pl-9" />
            </div>
            <CrmSelect value={owner} onChange={(event) => setOwner(event.target.value)} className="lg:w-[220px]">
              <option value="all">Todos responsaveis</option>
              <option value="unassigned">Sem responsavel</option>
              {owners.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </CrmSelect>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`rounded-full border px-3 py-2 text-xs font-black transition ${view === item.id ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary)] text-white" : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-[var(--cliente-border)]">
          {loading ? <div className="p-5"><CrmEmpty title="Carregando atividades" /></div> : null}
          {!loading && filteredItems.length === 0 ? <div className="p-5"><CrmEmpty title="Nenhuma atividade neste recorte" description="Altere os filtros ou volte para a visao de prioridade." /></div> : null}
          {filteredItems.map((item) => (
            <article key={item.id} className="grid gap-4 px-5 py-4 transition hover:bg-[var(--cliente-surface-muted)] lg:grid-cols-[minmax(0,1fr)_180px_170px_140px] lg:items-center">
              <div className="min-w-0">
                <CrmAvatar name={item.lead?.nome || "Contato"} subtitle={item.lead?.empresa || item.lead?.telefone || "Sem empresa"} />
                <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">{item.title || "Retorno comercial"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CrmBadge tone={priorityTone(item)}>{item.overdue ? "vencido" : item.dueToday ? "hoje" : "retorno"}</CrmBadge>
                  {item.lead?.pipelineStage ? <CrmBadge tone="blue">{getPipelineStageLabel(item.lead.pipelineStage)}</CrmBadge> : null}
                  {item.lead?.owner ? <CrmBadge>{item.lead.owner}</CrmBadge> : null}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Prazo</p>
                <p className="mt-1 text-sm font-bold text-[var(--cliente-card-text)]">{formatCrmDate(item.dueAt, "Sem prazo")}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]">
                  Ficha
                </Link>
                <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]">
                  Conversa
                </Link>
              </div>

              <CrmButton type="button" tone={item.status === "done" ? "secondary" : "green"} disabled={!canOperate || busyTaskId === item.id} onClick={() => toggleTask(item)}>
                {busyTaskId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {item.status === "done" ? "Reabrir" : "Concluir"}
              </CrmButton>
            </article>
          ))}
        </div>
      </CrmPanel>
    </CrmWorkspace>
  );
}
