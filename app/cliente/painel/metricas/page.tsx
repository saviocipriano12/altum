"use client";

import { ArrowUpRight, BarChart3, ChartNoAxesCombined, CircleGauge } from "lucide-react";
import { MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

export default function ClienteMetricasPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Metricas"
        subtitle="Visao consolidada de performance comercial, atendimento e retorno operacional."
        action={<StateBadge label="Analytics pronto" tone="success" />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Conversao" value="18.4%" icon={ChartNoAxesCombined} trend="mql para sql" />
        <MetricCard label="Tempo medio" value="5m 42s" icon={CircleGauge} trend="primeira resposta" />
        <MetricCard label="ROI" value="3.6x" icon={ArrowUpRight} trend="midia paga" />
        <MetricCard label="Crescimento" value="+22%" icon={BarChart3} trend="ultimos 30 dias" />
      </section>

      <PanelCard className="p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Resumo executivo</h3>
        <p className="mt-2 text-sm text-white/58">
          Este modulo concentra os indicadores mais relevantes para decisao estrategica da empresa, conectando marketing,
          operacao e resultado financeiro em um unico painel.
        </p>
      </PanelCard>
    </div>
  );
}
