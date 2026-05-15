"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, CalendarDays, CheckCircle2, Loader2, MessageSquare, RefreshCw, Send, Target } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "ai";

type DailyReport = {
  dateKey: string;
  title: string;
  summaryText: string;
  whatsappText: string;
  ownerPhone?: string;
  ownerName?: string;
  reportUrl?: string;
  sendStatus?: "not_sent" | "sent" | "failed";
  sendError?: string;
  sentAt?: unknown;
  metrics?: Array<{
    id: string;
    label: string;
    value: number;
    detail?: string;
    tone: Tone;
  }>;
  highlights?: string[];
  alerts?: Array<{
    id: string;
    title: string;
    description: string;
    href: string;
    tone: Tone;
  }>;
  tomorrowPlan?: Array<{
    id: string;
    title: string;
    description: string;
    href: string;
    tone: Tone;
  }>;
};

function metricIcon(id: string) {
  if (id.includes("conversation")) return MessageSquare;
  if (id.includes("lead") || id.includes("stage")) return Target;
  if (id.includes("task")) return CheckCircle2;
  if (id.includes("ai")) return Bot;
  return CalendarDays;
}

function metricTone(tone: Tone) {
  if (tone === "success" || tone === "warning" || tone === "danger" || tone === "ai") return tone;
  return "neutral";
}

function formatDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${day}/${month}/${year}`;
}

export default function ClienteDailyReportPage({ params }: { params: Promise<{ date: string }> }) {
  const { tenant, hasCapability } = useClienteTenant();
  const [dateKey, setDateKey] = useState("");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canSend = hasCapability("manage_settings");

  useEffect(() => {
    let mounted = true;
    params.then((value) => {
      if (!mounted) return;
      setDateKey(value.date || "");
    });
    return () => {
      mounted = false;
    };
  }, [params]);

  const loadReport = useCallback(async () => {
    if (!tenant?.tenantId || !dateKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/daily-reports?dateKey=${encodeURIComponent(dateKey)}`);
      const payload = (await res.json()) as { report?: DailyReport; error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao carregar fechamento do dia.");
        return;
      }
      setReport(payload.report || null);
    } catch {
      setError("Falha ao carregar fechamento do dia.");
    } finally {
      setLoading(false);
    }
  }, [dateKey, tenant?.tenantId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function regenerate() {
    if (!tenant?.tenantId || !dateKey) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/daily-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey }),
      });
      const payload = (await res.json()) as { report?: DailyReport; error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao regerar fechamento.");
        return;
      }
      setReport(payload.report || null);
      setNotice("Fechamento atualizado com os dados mais recentes.");
    } catch {
      setError("Falha ao regerar fechamento.");
    } finally {
      setLoading(false);
    }
  }

  async function sendWhatsapp() {
    if (!tenant?.tenantId || !dateKey || !canSend) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/daily-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey, send: true }),
      });
      const payload = (await res.json()) as { result?: { report?: DailyReport; error?: string; reason?: string }; error?: string };
      if (!res.ok || payload.result?.error || payload.result?.reason) {
        setError(payload.result?.error || payload.result?.reason || payload.error || "Falha ao enviar WhatsApp.");
        await loadReport();
        return;
      }
      await loadReport();
      setNotice("Fechamento enviado para o WhatsApp do dono.");
    } catch {
      setError("Falha ao enviar WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  const statusTone = useMemo<Tone>(() => {
    if (report?.sendStatus === "sent") return "success";
    if (report?.sendStatus === "failed") return "danger";
    return "neutral";
  }, [report?.sendStatus]);

  return (
    <div className="client-daily-page space-y-5">
      <SectionHeader
        title={report?.title || `Fechamento do dia - ${formatDate(dateKey)}`}
        subtitle="Resumo executivo da operacao comercial, alertas e plano para o proximo dia."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/cliente/painel/metricas"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Relatorios
            </Link>
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-text-muted)] transition hover:bg-[var(--cliente-surface-hover)] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void sendWhatsapp()}
              disabled={sending || !canSend}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar WhatsApp
            </button>
          </div>
        }
      />

      {error ? <div className="rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {loading && !report ? (
        <PanelCard className="p-8 text-center text-[var(--cliente-card-text-muted)]">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </PanelCard>
      ) : report ? (
        <>
          <PanelCard tone="brand" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle title="Leitura da Altum" subtitle={report.summaryText} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <StateBadge label={report.sendStatus === "sent" ? "enviado" : report.sendStatus === "failed" ? "falhou" : "nao enviado"} tone={statusTone} />
                  {report.ownerName ? <StateBadge label={report.ownerName} tone="info" /> : null}
                  {report.ownerPhone ? <StateBadge label={report.ownerPhone} tone="success" /> : null}
                </div>
              </div>
              {report.sendError ? (
                <div className="max-w-md rounded-2xl border border-red-300/35 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                  {report.sendError}
                </div>
              ) : null}
            </div>
          </PanelCard>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(report.metrics || []).map((metric) => {
              const Icon = metricIcon(metric.id);
              return (
                <MetricCard
                  key={metric.id}
                  label={metric.label}
                  value={String(metric.value)}
                  trend={metric.detail || ""}
                  icon={Icon}
                  tone={metricTone(metric.tone)}
                />
              );
            })}
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <PanelCard className="p-5">
              <CardTitle title="Destaques do dia" subtitle="O que aconteceu na operacao." />
              <div className="mt-4 space-y-3">
                {(report.highlights || []).map((item) => (
                  <div key={item} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 text-sm text-[var(--cliente-card-text-muted)]">
                    {item}
                  </div>
                ))}
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <CardTitle title="Mensagem do WhatsApp" subtitle="Previa do resumo enviado ao dono." />
              <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                {report.whatsappText}
              </pre>
            </PanelCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <PanelCard className="p-5">
              <CardTitle title="Pontos de atencao" subtitle="Riscos que pedem acao." />
              <ActionList items={report.alerts || []} empty="Sem alerta critico no fechamento." />
            </PanelCard>
            <PanelCard className="p-5">
              <CardTitle title="Plano para amanha" subtitle="Acoes recomendadas para abrir o proximo dia." />
              <ActionList items={report.tomorrowPlan || []} empty="Sem plano pendente para amanha." />
            </PanelCard>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ActionList({
  items,
  empty,
}: {
  items: Array<{ id: string; title: string; description: string; href: string; tone: Tone }>;
  empty: string;
}) {
  if (!items.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-5 text-sm text-[var(--cliente-card-text-muted)]">
        {empty}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
            </div>
            <StateBadge label={item.tone === "danger" ? "risco" : item.tone === "warning" ? "atencao" : "acao"} tone={item.tone} />
          </div>
        </Link>
      ))}
    </div>
  );
}
