"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Clock3, Loader2, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { CardTitle, ClientActionButton, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";

type CommercialAgentAction = {
  id: string;
  leadId?: string;
  type?: "review_proposal" | "review_appointment" | "review_charge" | "follow_up_task";
  title?: string;
  detail?: string | null;
  risk?: "low" | "medium" | "high";
  amount?: number | null;
  currency?: string | null;
  dueAt?: string | null;
  expiresAt?: string | null;
  slaState?: "inactive" | "on_time" | "overdue" | "escalate" | "expired";
  escalationLevel?: number;
};

type CommercialAgentActionSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  expired: number;
  executionFailed: number;
  overdue: number;
  pendingAmount: number;
  approvedAmount: number;
  averageDecisionMinutes: number | null;
};

const EMPTY_SUMMARY: CommercialAgentActionSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  executed: 0,
  expired: 0,
  executionFailed: 0,
  overdue: 0,
  pendingAmount: 0,
  approvedAmount: 0,
  averageDecisionMinutes: null,
};

function actionLabel(type?: CommercialAgentAction["type"]) {
  if (type === "review_appointment") return "Agenda";
  if (type === "review_proposal") return "Proposta";
  if (type === "review_charge") return "Cobranca";
  return "Proximo passo";
}

function actionHref(item: CommercialAgentAction) {
  const leadId = encodeURIComponent(item.leadId || "");
  if (item.type === "review_appointment") return `/cliente/painel/agenda?leadId=${leadId}`;
  if (item.type === "review_proposal" || item.type === "review_charge") return `/cliente/painel/comercial?leadId=${leadId}`;
  return `/cliente/painel/crm?leadId=${leadId}`;
}

function formatMoney(amount?: number | null, currency = "BRL") {
  if (amount === null || amount === undefined) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
}

function deadlineLabel(item: CommercialAgentAction) {
  if (!item.dueAt) return null;
  const dueAt = new Date(item.dueAt).getTime();
  if (!Number.isFinite(dueAt)) return null;
  const minutes = Math.round(Math.abs(dueAt - Date.now()) / 60_000);
  if (item.slaState === "overdue" || item.slaState === "escalate" || item.slaState === "expired") {
    return `${minutes} min fora do prazo`;
  }
  if (minutes < 60) return `${minutes} min para decidir`;
  return `${Math.ceil(minutes / 60)} h para decidir`;
}

export function CommercialAgentActionQueue({
  tenantId,
  canEditLeads,
  canManageCommercial,
}: {
  tenantId: string;
  canEditLeads: boolean;
  canManageCommercial: boolean;
}) {
  const [items, setItems] = useState<CommercialAgentAction[]>([]);
  const [summary, setSummary] = useState<CommercialAgentActionSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/commercial-agent/actions?status=pending_approval`);
      const payload = await response.json() as { items?: CommercialAgentAction[]; summary?: CommercialAgentActionSummary; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar decisoes da IA.");
      setItems(payload.items || []);
      setSummary(payload.summary || EMPTY_SUMMARY);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar decisoes da IA.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    appointments: items.filter((item) => item.type === "review_appointment").length,
    proposals: items.filter((item) => item.type === "review_proposal").length,
    charges: items.filter((item) => item.type === "review_charge").length,
  }), [items]);

  function canReview(item: CommercialAgentAction) {
    return item.type === "review_charge" ? canManageCommercial : canEditLeads;
  }

  async function decide(actionId: string, decision: "approved" | "rejected") {
    setBusyId(actionId);
    setError(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/commercial-agent/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao registrar a decisao.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao registrar a decisao.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PanelCard tone={items.length ? "ai" : "neutral"} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex rounded-2xl bg-[var(--cliente-ai-soft)] p-3 text-[var(--cliente-ai)]"><Sparkles className="h-5 w-5" /></span>
          <CardTitle title="Decisoes preparadas pela IA" subtitle="A IA adianta o trabalho; uma pessoa mantem o controle de proposta, agenda e dinheiro." />
        </div>
        <ClientActionButton type="button" tone="ghost" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </ClientActionButton>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StateBadge label={`${summary.pending} aguardando`} tone={summary.pending ? "warning" : "success"} />
        <StateBadge label={`${summary.overdue} fora do prazo`} tone={summary.overdue ? "danger" : "neutral"} />
        <StateBadge label={`${summary.approved + summary.executed} aprovadas`} tone="success" />
        <StateBadge label={`${summary.rejected} recusadas`} tone={summary.rejected ? "warning" : "neutral"} />
        <StateBadge label={summary.averageDecisionMinutes === null ? "tempo ainda sem amostra" : `${summary.averageDecisionMinutes} min para decidir`} tone="info" />
        <StateBadge label={`${formatMoney(summary.approvedAmount)} liberados`} tone="success" />
        <StateBadge label={`${counts.appointments} horarios`} tone="info" />
        <StateBadge label={`${counts.proposals} propostas`} tone="ai" />
        <StateBadge label={`${counts.charges} cobrancas protegidas`} tone={counts.charges ? "danger" : "neutral"} />
      </div>

      {error ? <p className="mt-4 rounded-xl bg-[var(--cliente-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--cliente-danger)]">{error}</p> : null}
      {!loading && !items.length ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <ShieldCheck className="h-5 w-5 text-[var(--cliente-success)]" />
          <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhuma decisao pendente. A operacao esta sob controle.</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StateBadge label={actionLabel(item.type)} tone={item.type === "review_charge" ? "danger" : "ai"} />
                  <StateBadge label={item.risk === "high" ? "alto impacto" : "revisao humana"} tone={item.risk === "high" ? "danger" : "warning"} />
                  {item.slaState === "escalate" || item.slaState === "overdue" ? <StateBadge label={`escalada nivel ${item.escalationLevel || 1}`} tone="danger" /> : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">{item.title || "Revisar sugestao comercial"}</p>
                {item.detail ? <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{item.detail}</p> : null}
                {item.amount ? <p className="mt-2 text-sm font-bold text-[var(--cliente-card-text)]">{formatMoney(item.amount, item.currency || "BRL")}</p> : null}
                {deadlineLabel(item) ? (
                  <p className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${item.slaState === "escalate" || item.slaState === "overdue" ? "text-[var(--cliente-danger)]" : "text-[var(--cliente-card-text-soft)]"}`}>
                    {item.slaState === "escalate" || item.slaState === "overdue" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                    {deadlineLabel(item)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={actionHref(item)} className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[var(--cliente-border)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
                Abrir contexto <ArrowRight className="h-4 w-4" />
              </Link>
              {canReview(item) ? (
                <>
                  <ClientActionButton type="button" tone="success" disabled={busyId === item.id} onClick={() => decide(item.id, "approved")}>
                    {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {item.type === "review_charge" ? "Liberar para financeiro" : "Aprovar"}
                  </ClientActionButton>
                  <ClientActionButton type="button" tone="ghost" disabled={busyId === item.id} onClick={() => decide(item.id, "rejected")}>
                    <X className="h-4 w-4" />Recusar
                  </ClientActionButton>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
