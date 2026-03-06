"use client";

import { Bot, CheckCircle2, MessageSquareCode, Workflow } from "lucide-react";
import { MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

export default function ClienteAutomacoesPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Automacoes"
        subtitle="Fluxos inteligentes para acelerar atendimento e previsibilidade comercial."
        action={<StateBadge label="Roadmap ativo" tone="info" />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Fluxos ativos" value="04" icon={Workflow} trend="follow-up e nutricao" />
        <MetricCard label="Gatilhos" value="12" icon={MessageSquareCode} trend="eventos monitorados" />
        <MetricCard label="Regras de IA" value="08" icon={Bot} trend="guardrails aplicados" />
        <MetricCard label="SLA" value="99.2%" icon={CheckCircle2} trend="execucao no prazo" />
      </section>

      <PanelCard className="p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Mapa de evolucao</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Block title="Follow-up inteligente" desc="Sequencias por perfil de lead com pauses e retentativas." />
          <Block title="Distribuicao automatica" desc="Roteamento por disponibilidade, prioridade e carteira." />
          <Block title="Aprovacao humana" desc="Etapas sensiveis exigem validacao antes de disparar." />
        </div>
      </PanelCard>
    </div>
  );
}

function Block({ title, desc }: { title: string; desc: string }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-sm font-medium text-white/92">{title}</p>
      <p className="mt-1 text-sm text-white/58">{desc}</p>
    </article>
  );
}
