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

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  mode: "auto" | "manual";
  status: "done" | "pending" | "blocked";
  critical: boolean;
  done: boolean;
  blocking: boolean;
  evidence: string;
  doneAt: string | null;
  doneByName: string;
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
  onboarding?: {
    completed?: number;
    total?: number;
    progressPct?: number;
    pendingCritical?: number;
    manualPending?: number;
    autoPending?: number;
    steps?: OnboardingStep[];
  };
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
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: Tone; text: string } | null>(null);
  const [overrideSnapshot, setOverrideSnapshot] = useState<GoLivePayload | null>(null);

  const snapshot = (overrideSnapshot || readiness) as GoLivePayload | null;
  const checklist = snapshot?.checklist || [];
  const onboarding = snapshot?.onboarding || {};
  const onboardingSteps = onboarding.steps || [];
  const manualOnboardingSteps = onboardingSteps.filter((item) => item.mode === "manual");
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
    return "Nenhuma validacao definitiva registrada para esta conta.";
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
          text: payload.message || payload.error || "Liberacao bloqueada. Resolva os itens criticos e tente novamente.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        text: payload.message || "Operacao validada com sucesso para esta conta.",
      });
    } catch {
      setFeedback({
        tone: "danger",
        text: "Falha ao validar a operacao. Tente novamente em alguns instantes.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleManualStep(step: OnboardingStep) {
    if (!tenant?.tenantId || step.mode !== "manual" || updatingStepId) return;
    setUpdatingStepId(step.id);
    setFeedback(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: step.id,
          done: !step.done,
        }),
      });
      const payload = (await response.json()) as GoLivePayload & {
        onboarding?: GoLivePayload["onboarding"];
        summary?: GoLivePayload["summary"];
        activation?: GoLivePayload["activation"];
        error?: string;
      };

      if (!response.ok) {
        setFeedback({
          tone: "danger",
          text: payload.error || "Falha ao atualizar etapa de onboarding.",
        });
        return;
      }

      setOverrideSnapshot((prev) => ({
        ...(prev || {}),
        ...(snapshot || {}),
        onboarding: payload.onboarding || snapshot?.onboarding,
        summary: payload.summary || snapshot?.summary,
        activation: payload.activation || snapshot?.activation,
      }));
      setFeedback({
        tone: "success",
        text: !step.done ? "Etapa manual marcada como concluida." : "Etapa manual reaberta para acompanhamento.",
      });
    } catch {
      setFeedback({
        tone: "danger",
        text: "Falha ao atualizar etapa de onboarding.",
      });
    } finally {
      setUpdatingStepId(null);
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
    <div className="go-live-refined client-daily-page space-y-4">
      <SectionHeader
        title="Implantacao definitiva"
        subtitle="Uma tela para validar prontidao, criterios criticos, evidencias e bloqueios antes de vender e operar a conta sem susto."
        action={
          <StateBadge
            label={pilotReady ? "pronto para venda" : `${Number(snapshot?.summary?.criticalBlockers || 0)} bloqueio(s)`}
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
        <MetricCard label="Prontidao" value={`${readinessScore}%`} icon={Rocket} trend={pilotReady ? "criterio definitivo aprovado" : "fechar checklist critico"} />
        <MetricCard label="Criterios criticos" value={String(criticalChecklist.length)} icon={ShieldCheck} trend={`${criticalChecklist.filter((item) => item.status === "ready").length} aprovados`} />
        <MetricCard label="Uso do assistente no mes" value={String(snapshot?.summary?.aiMonthlyRuns || 0)} icon={Wallet} trend={`${formatUsd(snapshot?.summary?.aiMonthlyCostUsd)} consumidos`} />
        <MetricCard label="Cobertura humana" value={String(snapshot?.summary?.activeUsers || 0)} icon={CheckCircle2} trend={`${snapshot?.summary?.operationalChannels || 0} canal(is) pronto(s)`} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Onboarding"
          value={`${Number(onboarding.progressPct || 0)}%`}
          icon={Rocket}
          trend={`${Number(onboarding.completed || 0)}/${Number(onboarding.total || 0)} etapa(s)`}
        />
        <MetricCard
          label="Pendencias criticas"
          value={String(Number(onboarding.pendingCritical || 0))}
          icon={AlertTriangle}
          trend={Number(onboarding.pendingCritical || 0) > 0 ? "bloqueiam operacao segura" : "sem bloqueio critico"}
        />
        <MetricCard
          label="Pendencias manuais"
          value={String(Number(onboarding.manualPending || 0))}
          icon={Clock3}
          trend="itens de governanca do time"
        />
        <MetricCard
          label="Pendencias automaticas"
          value={String(Number(onboarding.autoPending || 0))}
          icon={ShieldCheck}
          trend="itens rastreados por sistema"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title={snapshot?.activation?.title || "Liberacao da operacao"} subtitle={snapshot?.activation?.description || "Valide os criterios criticos antes de liberar a conta."} />
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
              {saving ? "Validando..." : snapshot?.activation?.status === "approved" ? "Revalidar operacao" : "Liberar operacao"}
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
          <CardTitle title="Evidencias de prontidao" subtitle="Os sinais operacionais que sustentam a liberacao desta conta agora." />
          <div className="mt-4 space-y-3">
            <EvidenceRow label="Conhecimento" value={`${snapshot?.summary?.knowledgeDocs || 0}/${snapshot?.summary?.knowledgeDocsMinimum || 0} docs`} tone={Number(snapshot?.summary?.knowledgeDocs || 0) >= Number(snapshot?.summary?.knowledgeDocsMinimum || 0) ? "success" : "warning"} />
            <EvidenceRow label="Orcamento do assistente" value={formatUsd(snapshot?.summary?.aiMonthlyBudgetUsd)} tone={Number(snapshot?.summary?.aiMonthlyBudgetUsd || 0) > 0 ? "info" : "warning"} />
            <EvidenceRow label="Limite de uso" value={String(snapshot?.summary?.aiMonthlyUsageCap || 0)} tone={Number(snapshot?.summary?.aiMonthlyUsageCap || 0) > 0 ? "info" : "warning"} />
            <EvidenceRow label="Responsavel humano" value={snapshot?.settings?.ai?.responsiblePhone || "Pendente"} tone={snapshot?.settings?.ai?.responsiblePhone ? "success" : "warning"} />
            <EvidenceRow label="Responsavel operacional" value={snapshot?.settings?.responsibleName || "Pendente"} tone={snapshot?.settings?.responsibleName ? "success" : "warning"} />
            <EvidenceRow label="Prazo de resposta" value={`${snapshot?.settings?.inboxRules?.defaultResponseSlaMinutes || 0} min`} tone={Number(snapshot?.settings?.inboxRules?.defaultResponseSlaMinutes || 0) > 0 ? "info" : "warning"} />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Checklist executavel" subtitle="Cada criterio mostra status, evidencia atual, meta e se bloqueia a liberacao." />
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
            <CardTitle title="O que falta agora" subtitle="Pendencias prioritarias para tirar a conta do risco alto." />
            <div className="mt-4 space-y-3">
              {blockers.length === 0 ? (
                <EmptyState title="Sem bloqueios criticos" description="O checklist critico esta aprovado. Agora o foco pode ser cadencia, refinamento e venda." />
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
            <CardTitle title="Rotina operacional" subtitle="Ritmo minimo para implantacao e resposta a incidentes." />
            <div className="mt-4 space-y-3">
              <RunbookRow icon={Clock3} title="D0" detail="Fechar responsavel, canal, assistente, conhecimento minimo e limites de uso/custo." />
              <RunbookRow icon={CheckCircle2} title="D1" detail="Validar conversas reais, escaladas, prazo de resposta e primeira rotina de acompanhamento." />
              <RunbookRow icon={AlertTriangle} title="D7" detail="Revisar consumo do assistente, conversas paradas, eventos da loja, fluxos e gargalos de operacao." />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Etapas manuais da implantacao" subtitle="Checklist guiado para confirmar governanca de operacao e atendimento humano." />
            <div className="mt-4 space-y-3">
              {manualOnboardingSteps.length === 0 ? (
                <EmptyState title="Sem etapas manuais" description="As etapas manuais aparecerao aqui quando a conta exigir confirmacao de governanca." />
              ) : (
                manualOnboardingSteps.map((step) => (
                  <div key={step.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{step.title}</p>
                        <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{step.description}</p>
                        <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Evidencia: {step.evidence}</p>
                        {step.doneAt ? (
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                            Confirmado em {formatDate(step.doneAt)}{step.doneByName ? ` por ${step.doneByName}` : ""}.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StateBadge label={step.done ? "concluida" : "pendente"} tone={step.done ? "success" : "warning"} />
                        <div className="flex items-center gap-2">
                          <Link href={step.href} className="rounded-xl border border-[var(--cliente-border)] px-3 py-1 text-xs text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-panel-soft)]">
                            Abrir
                          </Link>
                          <button
                            type="button"
                            disabled={updatingStepId === step.id}
                            onClick={() => void handleToggleManualStep(step)}
                            className="rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent)] px-3 py-1 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {updatingStepId === step.id ? "..." : step.done ? "Reabrir" : "Concluir"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Leituras da conta" subtitle="Resumo rapido do estado atual da operacao." />
            <div className="mt-4 space-y-3">
              {insights.length === 0 ? (
                <EmptyState title="Sem leituras ainda" description="Os alertas operacionais aparecerao aqui conforme a conta ganhar contexto." />
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
          <CardTitle title="Mapa por modulo" subtitle="Leitura complementar da conta depois da liberacao definitiva." />
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
    <div className="go-live-evidence rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
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
    <div className="go-live-runbook rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
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
