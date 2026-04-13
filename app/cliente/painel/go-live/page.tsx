"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Rocket, ShieldCheck, Wallet } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useTenantReadiness } from "@/app/cliente/painel/hooks/use-tenant-readiness";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

type ChecklistItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  status: "ready" | "warning" | "pending" | "blocked";
  badge: string;
  tone: Tone;
  blocking: boolean;
  critical: boolean;
  weight: number;
  evidence: string;
  target: string;
};

type GoLivePayload = {
  settings?: {
    businessProfileId?: string;
    responsibleName?: string;
    businessHours?: string;
    timezone?: string;
    inboxRules?: {
      defaultResponseSlaMinutes?: number;
      mode?: string;
      defaultTeam?: string;
    };
    ai?: {
      responsiblePhone?: string;
      monthlyBudgetUsd?: number;
      monthlyUsageCap?: number;
    };
  };
  summary?: {
    readinessScore?: number;
    pilotReady?: boolean;
    criticalBlockers?: number;
    operationalChannels?: number;
    knowledgeDocs?: number;
    knowledgeDocsMinimum?: number;
    activeUsers?: number;
    aiMonthlyCostUsd?: number;
    aiMonthlyRuns?: number;
    aiMonthlyBudgetUsd?: number;
    aiMonthlyUsageCap?: number;
  };
  checklist?: ChecklistItem[];
  activation?: {
    gateStatus?: "open" | "blocked";
    status?: "approved" | "ready_to_activate" | "blocked";
    title?: string;
    description?: string;
    readyForSale?: boolean;
    blockingItems?: string[];
    validation?: {
      status?: "approved" | "blocked" | "not_checked";
      checkedAt?: string | null;
      checkedByName?: string;
      approvedAt?: string | null;
      approvedByName?: string;
    };
  };
  blockers?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    badge: string;
    tone: Tone;
  }>;
  modules?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    status: "ready" | "partial" | "pending";
    badge: string;
    tone: Tone;
  }>;
  insights?: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  message?: string;
  error?: string;
};

function formatUsd(value?: number) {
  return `US$ ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Ainda nao validado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Ainda nao validado";
  return parsed.toLocaleString("pt-BR");
}

export default function ClienteGoLivePage() {
  const { tenant } = useClienteTenant();
  const { readiness, loading } = useTenantReadiness(tenant?.tenantId);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: Tone; text: string } | null>(null);
  const [overrideSnapshot, setOverrideSnapshot] = useState<GoLivePayload | null>(null);

  const snapshot = (overrideSnapshot || readiness) as GoLivePayload | null;
  const checklist = snapshot?.checklist || [];
  const criticalChecklist = checklist.filter((item) => item.critical);
  const blockers = snapshot?.blockers || [];
  const modules = snapshot?.modules || [];
  const insights = snapshot?.insights || [];
  const readinessScore = Number(snapshot?.summary?.readinessScore || 0);
  const pilotReady = snapshot?.activation?.readyForSale === true || snapshot?.summary?.pilotReady === true;
  const validation = snapshot?.activation?.validation;
  const validationSummary = useMemo(() => {
    if (validation?.status === "approved") {
      return `Aprovado em ${formatDate(validation.approvedAt || validation.checkedAt)} por ${validation.approvedByName || validation.checkedByName || "usuario nao identificado"}.`;
    }
    if (validation?.status === "blocked") {
      return `Ultimo bloqueio em ${formatDate(validation.checkedAt)} por ${validation.checkedByName || "usuario nao identificado"}.`;
    }
    return "Nenhuma validacao definitiva registrada para este tenant.";
  }, [validation?.approvedAt, validation?.approvedByName, validation?.checkedAt, validation?.checkedByName, validation?.status]);

  async function handleValidate() {
    if (!tenant?.tenantId || saving) return;
    setSaving(true);
    setFeedback(null);

    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/readiness`, { method: "POST" });
      const payload = (await response.json()) as GoLivePayload;
      setOverrideSnapshot(payload);

      if (!response.ok) {
        setFeedback({
          tone: "danger",
          text: payload.message || payload.error || "Go-live bloqueado. Resolva os itens criticos e tente novamente.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        text: payload.message || "Go-live validado com sucesso para este tenant.",
      });
    } catch {
      setFeedback({
        tone: "danger",
        text: "Falha ao validar o go-live. Tente novamente em alguns instantes.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Go-live definitivo"
        subtitle="Uma tela para validar score, gates criticos, evidencias e bloqueios antes de vender e operar o tenant sem susto."
        action={
          <StateBadge
            label={pilotReady ? "pronto para venda" : `${Number(snapshot?.summary?.criticalBlockers || 0)} gates bloqueando`}
            tone={pilotReady ? "success" : "warning"}
          />
        }
      />

      {feedback ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${feedback.tone === "success" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"}`}>
          {feedback.text}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Score de go-live" value={`${readinessScore}%`} icon={Rocket} trend={pilotReady ? "gate definitivo aprovado" : "fechar checklist critico"} />
        <MetricCard label="Gates criticos" value={String(criticalChecklist.length)} icon={ShieldCheck} trend={`${criticalChecklist.filter((item) => item.status === "ready").length} aprovados`} />
        <MetricCard label="Uso IA no mes" value={String(snapshot?.summary?.aiMonthlyRuns || 0)} icon={Wallet} trend={`${formatUsd(snapshot?.summary?.aiMonthlyCostUsd)} consumidos`} />
        <MetricCard label="Cobertura humana" value={String(snapshot?.summary?.activeUsers || 0)} icon={CheckCircle2} trend={`${snapshot?.summary?.operationalChannels || 0} canal(is) pronto(s)`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title={snapshot?.activation?.title || "Go-live"} subtitle={snapshot?.activation?.description || "Valide os criterios criticos antes de liberar o tenant."} />
            <StateBadge label={snapshot?.activation?.status === "approved" ? "validado" : pilotReady ? "pronto para liberar" : "bloqueado"} tone={snapshot?.activation?.status === "approved" ? "success" : pilotReady ? "info" : "warning"} />
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Ultima validacao</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{validationSummary}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={saving || snapshot?.activation?.gateStatus === "blocked"}
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Validando..." : snapshot?.activation?.status === "approved" ? "Revalidar go-live" : "Liberar go-live"}
            </button>
            <Link href="/cliente/painel/configuracoes" className="inline-flex items-center justify-center rounded-2xl border border-[var(--cliente-border)] px-4 py-2 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]">
              Ajustar setup
            </Link>
          </div>

          {snapshot?.activation?.gateStatus === "blocked" ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              O botao de liberacao fica bloqueado enquanto existir qualquer criterio critico pendente.
            </div>
          ) : null}
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Evidencias de prontidao" subtitle="Os sinais operacionais que sustentam o go-live deste tenant agora." />
          <div className="mt-4 space-y-3">
            <EvidenceRow label="Conhecimento" value={`${snapshot?.summary?.knowledgeDocs || 0}/${snapshot?.summary?.knowledgeDocsMinimum || 0} docs`} tone={Number(snapshot?.summary?.knowledgeDocs || 0) >= Number(snapshot?.summary?.knowledgeDocsMinimum || 0) ? "success" : "warning"} />
            <EvidenceRow label="Budget IA" value={formatUsd(snapshot?.summary?.aiMonthlyBudgetUsd)} tone={Number(snapshot?.summary?.aiMonthlyBudgetUsd || 0) > 0 ? "info" : "warning"} />
            <EvidenceRow label="Cap de execucao" value={String(snapshot?.summary?.aiMonthlyUsageCap || 0)} tone={Number(snapshot?.summary?.aiMonthlyUsageCap || 0) > 0 ? "info" : "warning"} />
            <EvidenceRow label="Handoff IA" value={snapshot?.settings?.ai?.responsiblePhone || "Pendente"} tone={snapshot?.settings?.ai?.responsiblePhone ? "success" : "warning"} />
            <EvidenceRow label="Owner operacional" value={snapshot?.settings?.responsibleName || "Pendente"} tone={snapshot?.settings?.responsibleName ? "success" : "warning"} />
            <EvidenceRow label="SLA padrao" value={`${snapshot?.settings?.inboxRules?.defaultResponseSlaMinutes || 0} min`} tone={Number(snapshot?.settings?.inboxRules?.defaultResponseSlaMinutes || 0) > 0 ? "info" : "warning"} />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Checklist executavel" subtitle="Cada criterio mostra status, evidencia atual, meta e se bloqueia o go-live." />
            <StateBadge label={`${checklist.length} criterios`} tone="info" />
          </div>
          <div className="mt-4 space-y-3">
            {checklist.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                      <StateBadge label={item.critical ? "critico" : "apoio"} tone={item.critical ? "warning" : "info"} />
                      <StateBadge label={item.blocking ? "bloqueia" : "nao bloqueia"} tone={item.blocking ? "danger" : "neutral"} />
                    </div>
                    <p className="text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                    <p className="text-sm text-[var(--cliente-card-text-muted)]">
                      <span className="font-medium text-[var(--cliente-card-text)]">Evidencia atual:</span> {item.evidence}
                    </p>
                    <p className="text-sm text-[var(--cliente-card-text-muted)]">
                      <span className="font-medium text-[var(--cliente-card-text)]">Meta:</span> {item.target}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StateBadge label={item.badge} tone={item.tone} />
                    <StateBadge label={`${item.weight} pts`} tone="neutral" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <CardTitle title="O que falta agora" subtitle="Pendencias prioritarias para tirar o tenant do risco alto." />
            <div className="mt-4 space-y-3">
              {blockers.length === 0 ? (
                <EmptyState title="Sem bloqueios criticos" description="O checklist critico esta aprovado. Agora o foco pode ser cadence, refinamento e venda." />
              ) : (
                blockers.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                        <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                      </div>
                      <StateBadge label={item.badge} tone={item.tone} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Runbook operacional" subtitle="Ritmo minimo para onboarding e resposta a incidentes, alinhado aos docs do repositorio." />
            <div className="mt-4 space-y-3">
              <RunbookRow icon={Clock3} title="D0" detail="Fechar owner, canal, IA, conhecimento minimo e limites de uso/custo." />
              <RunbookRow icon={CheckCircle2} title="D1" detail="Validar fila real, handoff, SLA e primeira rotina de acompanhamento." />
              <RunbookRow icon={AlertTriangle} title="D7" detail="Revisar consumo de IA, backlog, webhook, automacoes e gargalos de operacao." />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Leituras do workspace" subtitle="Resumo rapido do estado atual do tenant." />
            <div className="mt-4 space-y-3">
              {insights.length === 0 ? (
                <EmptyState title="Sem insights" description="Os alertas operacionais aparecerao aqui conforme o tenant ganhar contexto." />
              ) : (
                insights.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>
      </section>

      <PanelCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle title="Mapa por modulo" subtitle="Leitura complementar do tenant depois do gate definitivo." />
          <StateBadge label={`${modules.length} modulos`} tone="info" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                  <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                </div>
                <StateBadge label={item.badge} tone={item.tone} />
              </div>
            </Link>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}

function EvidenceRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--cliente-card-text-muted)]">{label}</p>
        <StateBadge label={value} tone={tone} />
      </div>
    </div>
  );
}

function RunbookRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Clock3;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-card-text-muted)]">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
          <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{detail}</p>
        </div>
      </div>
    </div>
  );
}
