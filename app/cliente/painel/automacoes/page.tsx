"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, MessageSquareCode, TriangleAlert, Workflow } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type AutomationSummaryResponse = {
  summary?: {
    activeAutomations?: number;
    monitoredConversations?: number;
    pausedConversations?: number;
    kbDocs?: number;
    guardrails?: number;
    queue?: {
      pending?: number;
      processing?: number;
      retrying?: number;
      done?: number;
      deadLetter?: number;
    };
    processedTotal?: number;
    aiEnabled?: boolean;
  };
  recentQueue?: Array<{
    id: string;
    chatId: string;
    status: "pending" | "processing" | "retrying" | "done" | "dead_letter";
    attempts: number;
    lastError?: string;
  }>;
  error?: string;
};

export default function ClienteAutomacoesPage() {
  const { tenant } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AutomationSummaryResponse>({});

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/automation-summary`);
        const payload = (await res.json()) as AutomationSummaryResponse;

        if (!mounted) return;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar automacoes.");
          return;
        }

        setData(payload);
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar automacoes.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Falha ao carregar automacoes" description={error} />;
  }

  const summary = data.summary || {};
  const queue = summary.queue || {};

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Automacoes"
        subtitle="Camada operacional do autopilot, filas de IA e orquestracao do tenant."
        action={
          <StateBadge
            label={summary.aiEnabled === false ? "IA desativada" : "Automacao rodando"}
            tone={summary.aiEnabled === false ? "warning" : "success"}
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Fluxos ativos" value={String(summary.activeAutomations || 0)} icon={Workflow} trend="automacoes habilitadas" />
        <MetricCard label="Fila pendente" value={String((queue.pending || 0) + (queue.retrying || 0))} icon={MessageSquareCode} trend="jobs aguardando execucao" />
        <MetricCard label="Guardrails" value={String(summary.guardrails || 0)} icon={Bot} trend="regras aplicadas no agente" />
        <MetricCard label="Docs ativos" value={String(summary.kbDocs || 0)} icon={CheckCircle2} trend="base de conhecimento do tenant" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Saude operacional</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <HealthRow label="Conversas monitoradas" value={String(summary.monitoredConversations || 0)} />
            <HealthRow label="Takeovers ativos" value={String(summary.pausedConversations || 0)} />
            <HealthRow label="Jobs processados" value={String(summary.processedTotal || 0)} />
            <HealthRow label="Dead letters" value={String(queue.deadLetter || 0)} danger={Boolean(queue.deadLetter)} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <QueuePill label="Pending" value={queue.pending || 0} />
            <QueuePill label="Processing" value={queue.processing || 0} />
            <QueuePill label="Retrying" value={queue.retrying || 0} />
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Leitura do sistema</h3>
          <div className="mt-4 space-y-3">
            <Insight
              title="Autopilot"
              description={
                summary.aiEnabled === false
                  ? "A IA do tenant esta desativada. O sistema depende de atendimento humano."
                  : "A IA esta habilitada e a fila operacional esta integrada ao WhatsApp deste tenant."
              }
            />
            <Insight
              title="Handoff"
              description={
                summary.pausedConversations
                  ? `${summary.pausedConversations} conversas estao em takeover ou pausa operacional.`
                  : "Nao ha takeover ativo neste momento."
              }
            />
            <Insight
              title="Conhecimento"
              description={
                summary.kbDocs
                  ? `${summary.kbDocs} documentos ajudam a IA a responder com contexto comercial.`
                  : "A base de conhecimento ainda esta vazia e limita a capacidade do agente."
              }
            />
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Fila recente</h3>
          <StateBadge
            label={queue.deadLetter ? "requer revisao" : "estavel"}
            tone={queue.deadLetter ? "warning" : "success"}
          />
        </div>

        {(data.recentQueue || []).length === 0 ? (
          <p className="mt-3 text-sm text-white/55">Nenhum job recente encontrado para este tenant.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {(data.recentQueue || []).map((job) => (
              <div key={job.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-white">Chat {job.chatId || "-"}</p>
                    <p className="text-xs text-white/50">Tentativas {job.attempts}</p>
                  </div>
                  <StateBadge
                    label={job.status.replace("_", " ")}
                    tone={job.status === "dead_letter" ? "danger" : job.status === "retrying" ? "warning" : job.status === "done" ? "success" : "info"}
                  />
                </div>
                {job.lastError ? (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{job.lastError}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function QueuePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function HealthRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${danger ? "border-rose-500/30 bg-rose-500/10" : "border-white/10 bg-black/30"}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Insight({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-sm text-white/58">{description}</p>
    </div>
  );
}
