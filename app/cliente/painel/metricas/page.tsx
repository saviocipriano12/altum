"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, ChartNoAxesCombined, CircleGauge, Loader2 } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type MetricsSummaryResponse = {
  metrics?: {
    conversionRate?: number;
    avgFirstResponseMinutes?: number;
    roi?: number;
    growth?: number;
    conversations?: number;
    handoffChats?: number;
    wonLeads?: number;
    totalLeads?: number;
  };
  traffic?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    ctr?: number;
    cpc?: number;
    cpl?: number;
  };
  error?: string;
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function ClienteMetricasPage() {
  const { tenant } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MetricsSummaryResponse>({});

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary`);
        const payload = (await res.json()) as MetricsSummaryResponse;

        if (!mounted) return;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar metricas.");
          return;
        }

        setData(payload);
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar metricas.");
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
    return <EmptyState title="Falha ao carregar metricas" description={error} />;
  }

  const metrics = data.metrics || {};
  const traffic = data.traffic || {};

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Metricas"
        subtitle="Performance consolidada de marketing, atendimento e resultado comercial do tenant."
        action={<StateBadge label="Analytics ao vivo" tone="success" />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Conversao" value={percent(Number(metrics.conversionRate || 0))} icon={ChartNoAxesCombined} trend={`${metrics.wonLeads || 0} ganhos de ${metrics.totalLeads || 0} leads`} />
        <MetricCard label="Tempo medio" value={`${Number(metrics.avgFirstResponseMinutes || 0).toFixed(1)} min`} icon={CircleGauge} trend="primeira resposta humana" />
        <MetricCard label="ROI" value={`${Number(metrics.roi || 0).toFixed(2)}x`} icon={ArrowUpRight} trend={`investimento ${currency(Number(traffic.spend || 0))}`} />
        <MetricCard label="Crescimento" value={percent(Number(metrics.growth || 0))} icon={BarChart3} trend="comparado aos 30 dias anteriores" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Performance de trafego</h3>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Impressoes" value={String(traffic.impressions || 0)} />
                <Row label="Cliques" value={String(traffic.clicks || 0)} />
                <Row label="Leads atribuidos" value={String(traffic.leads || 0)} />
                <Row label="CTR" value={percent(Number(traffic.ctr || 0))} />
                <Row label="CPC" value={currency(Number(traffic.cpc || 0))} />
                <Row label="CPL" value={currency(Number(traffic.cpl || 0))} />
              </tbody>
            </table>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Leitura comercial</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InsightCard
              title="Conversas abertas"
              value={String(metrics.conversations || 0)}
              detail="threads ativas no inbox do cliente"
            />
            <InsightCard
              title="Takeovers"
              value={String(metrics.handoffChats || 0)}
              detail="conversas em pausa ou assumidas por humano"
            />
            <InsightCard
              title="Leads ganhos"
              value={String(metrics.wonLeads || 0)}
              detail="etapas finais convertidas"
            />
            <InsightCard
              title="Spend total"
              value={currency(Number(traffic.spend || 0))}
              detail="midia contabilizada no tenant"
            />
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-white/10 last:border-none">
      <td className="px-3 py-2 text-white/58">{label}</td>
      <td className="px-3 py-2 text-right font-medium text-white/92">{value}</td>
    </tr>
  );
}

function InsightCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{title}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-white/58">{detail}</p>
    </div>
  );
}
