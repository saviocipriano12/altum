"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, Loader2, Rocket, ShieldCheck, TriangleAlert } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useTenantReadiness } from "@/app/cliente/painel/hooks/use-tenant-readiness";
import { getBusinessProfile } from "@/lib/business-profiles";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

function toneForCount(value: number) {
  if (value <= 0) return "success" as const;
  if (value <= 2) return "warning" as const;
  return "danger" as const;
}

export default function ClienteGoLivePage() {
  const { tenant } = useClienteTenant();
  const { readiness, loading, pilotReady, readinessScore, blockerCount } = useTenantReadiness(tenant?.tenantId);

  const modules = readiness?.modules || [];
  const readyModules = modules.filter((item) => item.status === "ready").length;
  const partialModules = modules.filter((item) => item.status === "partial").length;
  const pendingModules = modules.filter((item) => item.status === "pending").length;
  const blockers = readiness?.blockers || [];
  const insights = readiness?.insights || [];
  const nextBuildItems = readiness?.nextBuildItems || [];
  const inboxRules = readiness?.settings?.inboxRules;
  const businessProfile = getBusinessProfile(readiness?.settings?.businessProfileId);

  const pilotChecklist = [
    {
      id: "capture",
      title: "Publicar uma entrada real",
      description: "Abra a landing ou formulÃƒÂ¡rio pÃƒÂºblico, envie um lead teste e confirme a entrada no CRM.",
      href: "/cliente/painel/captacao",
      done: Number(readiness?.summary?.activeForms || 0) > 0 || Number(readiness?.summary?.activeChannels || 0) > 0,
    },
    {
      id: "inbox",
      title: "Tratar a conversa no Inbox",
      description: "Validar recebimento, takeover, pausa da IA e envio manual pelo backend.",
      href: "/cliente/painel/inbox",
      done: Number(readiness?.summary?.activeUsers || 0) > 0,
    },
    {
      id: "ai",
      title: "Revisar cobertura do agente",
      description: "Confirmar handoff, responsÃƒÂ¡vel e base de conhecimento antes do primeiro lead real.",
      href: "/cliente/painel/ia",
      done:
        readiness?.summary?.pilotReady === true ||
        (Number(readiness?.summary?.knowledgeDocs || 0) > 0 && Number(readiness?.summary?.activeAutomations || 0) > 0),
    },
    {
      id: "commercial",
      title: "Fechar o ciclo comercial",
      description: "Mover lead no pipeline, gerar proposta, cobranÃƒÂ§a e registrar follow-up.",
      href: "/cliente/painel/comercial",
      done: readyModules >= 6,
    },
  ];

  if (loading && !readiness) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Go-live"
        subtitle="Checklist de prontidÃƒÂ£o, roteiro de piloto e mapa operacional para colocar o tenant em produÃƒÂ§ÃƒÂ£o com seguranÃƒÂ§a."
        action={<StateBadge label={pilotReady ? "piloto liberado" : `${blockerCount} pendencias`} tone={pilotReady ? "success" : toneForCount(blockerCount)} />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="ProntidÃƒÂ£o" value={`${readinessScore}%`} icon={Rocket} trend={pilotReady ? "tenant apto para piloto" : "fechamento antes do go-live"} />
        <MetricCard label="Bloqueios" value={String(blockerCount)} icon={TriangleAlert} trend={pilotReady ? "sem bloqueios criticos" : "itens impedindo lancamento"} />
        <MetricCard label="Modulos prontos" value={String(readyModules)} icon={ShieldCheck} trend={`${partialModules} parciais Ã‚Â· ${pendingModules} pendentes`} />
        <MetricCard
          label="Operacao"
          value={`${readiness?.summary?.activeUsers || 0} users`}
          icon={CheckCircle2}
          trend={`SLA ${inboxRules?.defaultResponseSlaMinutes || 15} min Â· ${businessProfile.label}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle
              title={pilotReady ? "Tenant pronto para piloto controlado" : "Bloqueios de go-live"}
              subtitle={
                pilotReady
                  ? "A base minima de empresa, atendimento, IA e entrada de demanda esta fechada para um piloto real."
                  : "Feche os itens abaixo antes de usar o workspace com um cliente real."
              }
            />
            <StateBadge label={pilotReady ? "go-live liberado" : "acao requerida"} tone={pilotReady ? "success" : "warning"} />
          </div>

          {blockers.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Sem bloqueios criticos. O tenant ja pode entrar em piloto controlado.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {blockers.map((item, index) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-blue-300/25 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/72">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm text-white/58">{item.description}</p>
                      </div>
                    </div>
                    <StateBadge label={item.badge} tone={item.tone} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Roteiro do primeiro teste" subtitle="Sequencia recomendada para validar o tenant com um lead real ou controlado." />
          <div className="mt-4 space-y-3">
            {pilotChecklist.map((item, index) => (
              <Link
                key={item.id}
                href={item.href}
                className={`block rounded-2xl border p-4 transition ${
                  item.done
                    ? "border-emerald-400/18 bg-emerald-500/10 hover:bg-emerald-500/14"
                    : "border-white/10 bg-black/30 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {item.done ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-200" />
                      ) : (
                        <CircleDashed className="h-5 w-5 text-white/35" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {index + 1}. {item.title}
                      </p>
                      <p className="mt-2 text-sm text-white/58">{item.description}</p>
                    </div>
                  </div>
                  <StateBadge label={item.done ? "ok" : "validar"} tone={item.done ? "success" : "info"} />
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Mapa por modulo" subtitle="O que ja esta pronto, parcial ou ainda pede fechamento antes de escalar o tenant." />
            <StateBadge label={`${modules.length} modulos`} tone="info" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {modules.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-blue-300/25 hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-white/58">{item.description}</p>
                  </div>
                  <StateBadge label={item.badge} tone={item.tone} />
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <CardTitle title="Modo operacional" subtitle="Perfil vertical que orienta IA, CRM, pipeline, métricas e captação deste tenant." />
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{businessProfile.label}</p>
                  <p className="mt-2 text-sm text-white/58">{businessProfile.description}</p>
                </div>
                <StateBadge label={readiness?.settings?.businessProfileId || "generic"} tone="info" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Movimento comercial</p>
                  <p className="mt-2 text-sm text-white/72">{businessProfile.commercialMotion}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Métricas naturais</p>
                  <p className="mt-2 text-sm text-white/72">{businessProfile.metrics.join(" · ")}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <Link href="/cliente/painel/configuracoes/empresa" className="text-blue-200 transition hover:text-blue-100">
                  Revisar modo do negócio
                </Link>
                <Link href="/cliente/painel/ia" className="text-white/58 transition hover:text-white/82">
                  Ajustar agente para este modo
                </Link>
              </div>
            </div>
          </PanelCard>
          <PanelCard className="p-5">
            <CardTitle title="Leituras do workspace" subtitle="Resumo operacional vindo do snapshot atual do tenant." />
            <div className="mt-4 space-y-3">
              {insights.length === 0 ? (
                <EmptyState title="Sem insights" description="Quando o tenant tiver mais contexto operacional, os alertas aparecem aqui." />
              ) : (
                insights.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-white/58">{item.description}</p>
                  </div>
                ))
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Proxima fase" subtitle="Itens que ainda valem aprofundamento depois do piloto." />
            {nextBuildItems.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Nenhum bloco estrutural grande pendente neste momento. O foco agora pode ser piloto, refinamento e integraÃƒÂ§ÃƒÂµes futuras.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {nextBuildItems.map((item) => (
                  <Link key={item.id} href={item.href} className="block rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:bg-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm text-white/58">{item.description}</p>
                      </div>
                      <StateBadge label={item.badge} tone={item.tone} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      </section>
    </div>
  );
}


