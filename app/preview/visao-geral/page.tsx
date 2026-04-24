"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  ChartColumn,
  Clock3,
  Funnel,
  Handshake,
  Inbox,
  MoonStar,
  Sparkles,
  SunMedium,
  Wallet,
} from "lucide-react";

type ViewMode = "essencial" | "detalhado";
type ThemeMode = "dark" | "light";

export default function PreviewVisaoGeralPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("essencial");
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  const isDark = themeMode === "dark";

  const surfaceClass = isDark
    ? "border-white/10 bg-neutral-900/80 text-white"
    : "border-black/10 bg-white text-neutral-900";
  const mutedClass = isDark ? "text-white/60" : "text-neutral-500";
  const subtleClass = isDark ? "bg-white/5" : "bg-black/[0.03]";

  const metrics = useMemo(
    () => [
      { label: "Leads ativos", value: "34", trend: "+4 hoje", href: "/preview/crm", icon: Funnel },
      { label: "Conversas", value: "11", trend: "2 sem dono", href: "/preview/plataforma", icon: Inbox },
      { label: "Investimento", value: "R$ 18.900", trend: "CPL R$ 42", href: "/preview/plataforma", icon: Wallet },
      { label: "Receita", value: "R$ 67.200", trend: "R$ 14.000 pendente", href: "/preview/plataforma", icon: Handshake },
    ],
    []
  );

  return (
    <div
      className={`min-h-screen px-4 py-6 [font-family:'Space_Grotesk','Manrope',sans-serif] lg:px-6 ${
        isDark
          ? "bg-[radial-gradient(circle_at_top,_#1A1A1A,_#080808_55%)] text-white"
          : "bg-[radial-gradient(circle_at_top,_#fff7f2,_#f3f4f6_55%)] text-neutral-900"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <header className={`rounded-3xl border p-4 ${surfaceClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-xs uppercase tracking-[0.18em] ${mutedClass}`}>ALTUM Preview</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Visao Geral - Novo Padrao</h1>
              <p className={`mt-2 text-sm ${mutedClass}`}>Mistura NeoGlass + Command Center com leitura empresarial simples.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("essencial")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "essencial"
                    ? "bg-[#EB5002] text-white"
                    : `${subtleClass} ${mutedClass}`
                }`}
              >
                Essencial
              </button>
              <button
                type="button"
                onClick={() => setViewMode("detalhado")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "detalhado"
                    ? "bg-[#EB5002] text-white"
                    : `${subtleClass} ${mutedClass}`
                }`}
              >
                Detalhado
              </button>
              <button
                type="button"
                onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-white/15 bg-white/5 text-white/80" : "border-black/10 bg-black/[0.03] text-neutral-600"}`}
              >
                {isDark ? <SunMedium className="h-3.5 w-3.5" /> : <MoonStar className="h-3.5 w-3.5" />}
                {isDark ? "Modo claro" : "Modo escuro"}
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <article className={`rounded-3xl border p-5 ${surfaceClass}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#EB5002]/30 bg-[#EB5002]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#EB5002]">
              <Sparkles className="h-3.5 w-3.5" />
              Comando do dia
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">Operacao Comercial em Leitura de 30 segundos</h2>
            <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedClass}`}>
              Menos blocos, linguagem simples e foco no que faz o time vender mais hoje.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <QuickAction href="/preview/plataforma" label="Abrir atendimento" description="Assumir conversas sem dono" />
              <QuickAction href="/preview/crm" label="Revisar pipeline" description="Priorizar propostas em atraso" />
              <QuickAction href="/preview/plataforma" label="Ajustar IA" description="Refinar respostas e handoffs" />
              <QuickAction href="/preview/plataforma" label="Ver financeiro" description="Recebimentos e pendencias" />
            </div>
          </article>

          <article className={`rounded-3xl border p-5 ${surfaceClass}`}>
            <p className={`text-xs uppercase tracking-[0.18em] ${mutedClass}`}>Alertas principais</p>
            <div className="mt-3 space-y-2">
              <Signal label="SLA em risco" value="3 conversas" tone="danger" />
              <Signal label="Sem responsavel" value="2 conversas" tone="warning" />
              <Signal label="IA em atividade" value="Normal" tone="success" />
            </div>
          </article>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => (
            <Link key={item.label} href={item.href} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${surfaceClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.16em] ${mutedClass}`}>{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>{item.trend}</p>
                </div>
                <span className="rounded-xl border border-[#EB5002]/30 bg-[#EB5002]/10 p-2 text-[#EB5002]">
                  <item.icon className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </section>

        {viewMode === "detalhado" ? (
          <section className="grid gap-4 xl:grid-cols-2">
            <article className={`rounded-3xl border p-5 ${surfaceClass}`}>
              <p className={`text-xs uppercase tracking-[0.18em] ${mutedClass}`}>Atividades recentes</p>
              <div className="mt-3 space-y-2">
                {[
                  "Lead Savio foi movido para Proposta",
                  "Follow-up executado para Studio Prime",
                  "IA sugeriu handoff para atendimento humano",
                ].map((line) => (
                  <div key={line} className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-black/10 bg-black/[0.02]"}`}>
                    <p className="text-sm">{line}</p>
                    <p className={`mt-1 inline-flex items-center gap-1 text-[11px] ${mutedClass}`}>
                      <Clock3 className="h-3 w-3" />
                      Hoje
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className={`rounded-3xl border p-5 ${surfaceClass}`}>
              <p className={`text-xs uppercase tracking-[0.18em] ${mutedClass}`}>Performance IA e Operacao</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <MiniMetric label="IA respondeu" value="38" icon={Bot} />
                <MiniMetric label="Conversao" value="22%" icon={ChartColumn} />
                <MiniMetric label="Tempo 1a resposta" value="11 min" icon={Clock3} />
                <MiniMetric label="Handoffs" value="6" icon={ArrowRight} />
              </div>
            </article>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function QuickAction({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-[#EB5002]/25 bg-[#EB5002]/10 px-3 py-3 transition hover:bg-[#EB5002]/15">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#EB5002]">{label}</p>
        <ArrowRight className="h-4 w-4 text-[#EB5002] transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-1 text-xs text-[#EB5002]/80">{description}</p>
    </Link>
  );
}

function Signal({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
      : tone === "warning"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-400"
      : "border-rose-500/25 bg-rose-500/10 text-rose-400";

  return (
    <div className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-xl border border-[#EB5002]/25 bg-[#EB5002]/10 p-3">
      <div className="inline-flex rounded-lg border border-[#EB5002]/30 p-1.5 text-[#EB5002]">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[#EB5002]/80">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#EB5002]">{value}</p>
    </div>
  );
}
