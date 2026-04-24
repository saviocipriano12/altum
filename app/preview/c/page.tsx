"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import {
  ChevronRight,
  Inbox,
  Layers2,
  LayoutDashboard,
  MoonStar,
  Search,
  SunMedium,
  UsersRound,
} from "lucide-react";

type ThemeMode = "dark" | "light";

const KPIS = [
  { label: "Leads ativos", value: "47", detail: "+6 na semana" },
  { label: "Inbox pendente", value: "18", detail: "4 sem owner" },
  { label: "Propostas abertas", value: "24", detail: "7 sem retorno" },
];

const FOCUS = [
  "Assumir conversas sem owner no inbox",
  "Atualizar etapa de oportunidades em proposta",
  "Executar follow-up de alto ticket",
];

const TABS = [
  { icon: LayoutDashboard, label: "Visao geral" },
  { icon: Inbox, label: "Inbox" },
  { icon: UsersRound, label: "CRM" },
];

function varsFor(theme: ThemeMode) {
  const dark = theme === "dark";
  return {
    "--bg": dark ? "#0B0F17" : "#F4F6FA",
    "--surface": dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.92)",
    "--surface-2": dark ? "rgba(255,255,255,0.08)" : "rgba(245,247,252,0.95)",
    "--border": dark ? "rgba(148,163,184,0.25)" : "rgba(15,23,42,0.14)",
    "--text": dark ? "#F8FAFF" : "#111827",
    "--text-soft": dark ? "rgba(248,250,255,0.72)" : "rgba(17,24,39,0.68)",
    "--accent": dark ? "#75E8FF" : "#0C89A7",
    "--accent-soft": dark ? "rgba(117,232,255,0.18)" : "rgba(12,137,167,0.12)",
  } as CSSProperties;
}

export default function PreviewC() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [showExtra, setShowExtra] = useState(false);

  return (
    <main
      style={varsFor(theme)}
      className="[font-family:'Satoshi','General_Sans','Manrope',sans-serif] min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]"
    >
      <div className="mx-auto max-w-[1680px] px-4 py-6">
        <header className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-soft)]">Modelo C</p>
              <h1 className="mt-1 text-2xl font-semibold">Hibrido ALTUM</h1>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">Visual moderno com estrutura operacional tradicional e simples.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text-soft)]">
                <Search className="h-4 w-4" />
                <input className="w-44 bg-transparent outline-none" placeholder="Buscar..." />
              </label>
              <button
                type="button"
                onClick={() => setShowExtra((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text-soft)]"
              >
                <Layers2 className="h-4 w-4 text-[color:var(--accent)]" />
                {showExtra ? "Ocultar contexto" : "Mostrar contexto"}
              </button>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text-soft)]"
              >
                {theme === "dark" ? <SunMedium className="h-4 w-4 text-[color:var(--accent)]" /> : <MoonStar className="h-4 w-4 text-[color:var(--accent)]" />}
                {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </button>
              <Link href="/preview/modelos" className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text-soft)]">
                Modelos
              </Link>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {TABS.map(({ icon: Icon, label }, index) => (
              <button
                key={label}
                className={index === 0 ? "inline-flex items-center gap-2 rounded-xl border border-[color:var(--accent)] bg-[color:var(--accent-soft)] px-3 py-2 text-sm" : "inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text-soft)]"}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </header>

        <section className={showExtra ? "mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" : "mt-4"}>
          <div className="space-y-4">
            <section className="grid gap-3 md:grid-cols-3">
              {KPIS.map((item) => (
                <article key={item.label} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                  <p className="text-xs text-[color:var(--text-soft)]">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                  <p className="text-xs text-[color:var(--text-soft)]">{item.detail}</p>
                </article>
              ))}
            </section>

            <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Plano de execucao</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {FOCUS.map((item) => (
                  <button key={item} className="inline-flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2.5 text-left text-sm text-[color:var(--text-soft)]">
                    <span>{item}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />
                  </button>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
              <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[color:var(--surface-2)] text-[color:var(--text-soft)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Lead</th>
                      <th className="px-3 py-2 font-medium">Etapa</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">Proxima acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Savio Cipriano", "Proposta", "Maria", "Enviar proposta curta"],
                      ["Roberta Silva", "Fechamento", "Carlos", "Ligar decisor"],
                      ["Studio Prime", "Qualificacao", "Diego", "Confirmar prazo"],
                    ].map((row) => (
                      <tr key={row[0]} className="border-t border-[color:var(--border)]">
                        <td className="px-3 py-2.5">{row[0]}</td>
                        <td className="px-3 py-2.5 text-[color:var(--text-soft)]">{row[1]}</td>
                        <td className="px-3 py-2.5 text-[color:var(--text-soft)]">{row[2]}</td>
                        <td className="px-3 py-2.5 text-[color:var(--text-soft)]">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          {showExtra ? (
            <aside className="space-y-4">
              <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Contexto IA</p>
                <div className="mt-3 space-y-2 text-sm text-[color:var(--text-soft)]">
                  <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2">3 conversas sem responsavel no inbox.</p>
                  <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2">2 propostas sem retorno acima de 48h.</p>
                  <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2">5 convites de usuario com falha de envio.</p>
                </div>
              </article>

              <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Acoes de plataforma</p>
                <div className="mt-3 space-y-2">
                  {["Ajustar fluxo de login", "Corrigir convite por e-mail", "Padronizar perfil + logout"].map((item) => (
                    <button key={item} className="inline-flex w-full items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text-soft)]">
                      <span>{item}</span>
                      <ChevronRight className="h-4 w-4 text-[color:var(--accent)]" />
                    </button>
                  ))}
                </div>
              </article>
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}

