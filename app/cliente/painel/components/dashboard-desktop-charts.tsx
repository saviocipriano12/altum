"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight } from "lucide-react";
import { CardTitle, PanelCard } from "@/app/cliente/painel/components/ui";

type CampaignChartPoint = {
  name: string;
  leads: number;
  vendas: number;
  reunioes: number;
};

type StageChartPoint = {
  name: string;
  oportunidades: number;
};

export function DashboardDesktopCharts({
  campaignChartData,
  stageChartData,
  chartGridColor,
  chartTextColor,
}: {
  campaignChartData: CampaignChartPoint[];
  stageChartData: StageChartPoint[];
  chartGridColor: string;
  chartTextColor: string;
}) {
  return (
    <section className="client-advanced-layer grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <PanelCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Crescimento por origem" subtitle="Leads, reunioes e vendas com leitura visual." />
          <Link href="/cliente/painel/campanhas" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
            Campanhas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={campaignChartData} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--cliente-primary)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--cliente-primary)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--cliente-success)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--cliente-success)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: "1px solid var(--cliente-border)", borderRadius: 14, background: "var(--cliente-card)", color: "var(--cliente-card-text)" }} />
              <Area type="monotone" dataKey="leads" name="Leads" stroke="var(--cliente-primary)" strokeWidth={2.5} fill="url(#leadsGradient)" />
              <Area type="monotone" dataKey="vendas" name="Vendas" stroke="var(--cliente-success)" strokeWidth={2.5} fill="url(#salesGradient)" />
              <Area type="monotone" dataKey="reunioes" name="Reunioes" stroke="var(--cliente-ai)" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>

      <PanelCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Funil em movimento" subtitle="Onde estao as oportunidades agora." />
          <Link href="/cliente/painel/pipeline" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
            Funil
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageChartData} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: "1px solid var(--cliente-border)", borderRadius: 14, background: "var(--cliente-card)", color: "var(--cliente-card-text)" }} />
              <Bar dataKey="oportunidades" name="Oportunidades" radius={[8, 8, 0, 0]} fill="var(--cliente-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>
    </section>
  );
}
