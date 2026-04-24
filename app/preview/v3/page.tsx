"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  MoonStar,
  Search,
  SunMedium,
  UsersRound,
} from "lucide-react";

type ThemeMode = "dark" | "light";
type ModuleId = "visao-geral" | "inbox" | "crm" | "pipeline" | "agenda";

type ModuleItem = {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  subtitle: string;
};

type Conversation = {
  id: string;
  nome: string;
  canal: string;
  espera: string;
  ultima: string;
};

type Lead = {
  id: string;
  nome: string;
  empresa: string;
  etapa: string;
  owner: string;
  valor: string;
  proxima: string;
};

const MODULES: ModuleItem[] = [
  { id: "visao-geral", label: "Visao geral", icon: LayoutDashboard, subtitle: "Resumo diario e prioridades." },
  { id: "inbox", label: "Inbox", icon: Inbox, subtitle: "Atendimento e resposta rapida." },
  { id: "crm", label: "CRM", icon: UsersRound, subtitle: "Leads e oportunidades." },
  { id: "pipeline", label: "Pipeline", icon: KanbanSquare, subtitle: "Etapas e ritmo comercial." },
  { id: "agenda", label: "Agenda", icon: CalendarDays, subtitle: "Compromissos do time." },
];

const PRIORIDADES: Record<ModuleId, string[]> = {
  "visao-geral": [
    "Resolver 5 convites pendentes",
    "Revisar 3 alertas de sincronizacao",
    "Finalizar resumo executivo das 17h",
  ],
  inbox: [
    "Assumir 2 conversas sem owner",
    "Responder 4 leads quentes em ate 10 min",
    "Padronizar respostas de follow-up",
  ],
  crm: [
    "Atualizar etapa de 6 leads estagnados",
    "Executar contato com 2 propostas acima de R$20k",
    "Revisar score de leads novos",
  ],
  pipeline: [
    "Limpar gargalo em Proposta",
    "Mover oportunidades com proximo passo definido",
    "Revisar tempo medio por etapa",
  ],
  agenda: [
    "Confirmar reunioes da tarde",
    "Remarcar 2 calls sem retorno",
    "Enviar pauta para reuniao comercial",
  ],
};

const CONVERSAS: Conversation[] = [
  { id: "c1", nome: "Savio Cipriano", canal: "WhatsApp", espera: "2 min", ultima: "Preciso da proposta final" },
  { id: "c2", nome: "Studio Prime", canal: "WhatsApp", espera: "7 min", ultima: "Qual prazo de implantacao?" },
  { id: "c3", nome: "Atlas Med", canal: "Instagram", espera: "11 min", ultima: "Consegue ligar as 16h?" },
  { id: "c4", nome: "Lucilene Campos", canal: "WhatsApp", espera: "15 min", ultima: "Pode reenviar resumo?" },
];

const MENSAGENS: Record<string, Array<{ from: "cliente" | "time"; texto: string; hora: string }>> = {
  c1: [
    { from: "cliente", texto: "Oi, preciso da proposta final ainda hoje.", hora: "10:02" },
    { from: "time", texto: "Perfeito. Te envio em formato curto em 3 minutos.", hora: "10:03" },
    { from: "cliente", texto: "Fechando hoje, me manda com condicoes.", hora: "10:05" },
  ],
  c2: [
    { from: "cliente", texto: "Qual prazo de implantacao?", hora: "09:40" },
    { from: "time", texto: "Comecamos em ate 5 dias uteis.", hora: "09:41" },
  ],
  c3: [
    { from: "cliente", texto: "Consegue me ligar as 16h?", hora: "09:19" },
    { from: "time", texto: "Consigo sim, confirmo em seguida.", hora: "09:20" },
  ],
  c4: [
    { from: "cliente", texto: "Pode reenviar resumo comercial?", hora: "08:57" },
    { from: "time", texto: "Reenvio agora com os proximos passos.", hora: "08:59" },
  ],
};

const LEADS: Lead[] = [
  { id: "l1", nome: "Roberta Silva", empresa: "Clinica Viva", etapa: "Proposta", owner: "Carlos", valor: "R$ 21.800", proxima: "Ligar decisor" },
  { id: "l2", nome: "Ulucas Jr", empresa: "UJ Solucoes", etapa: "Contato", owner: "Maria", valor: "R$ 6.400", proxima: "Atualizar dados" },
  { id: "l3", nome: "Lucilene Campos", empresa: "LC Estetica", etapa: "Fechamento", owner: "Diego", valor: "R$ 18.200", proxima: "Confirmar condicoes" },
  { id: "l4", nome: "Savio Cipriano", empresa: "Savio Marketing", etapa: "Qualificacao", owner: "Maria", valor: "R$ 7.800", proxima: "Enviar proposta curta" },
];

const PIPELINE_DATA = [
  { etapa: "Novo", qtd: 11, valor: "R$ 89 mil" },
  { etapa: "Qualificacao", qtd: 14, valor: "R$ 204 mil" },
  { etapa: "Proposta", qtd: 12, valor: "R$ 228 mil" },
  { etapa: "Fechamento", qtd: 10, valor: "R$ 100 mil" },
];

function varsFor(theme: ThemeMode): CSSProperties {
  const dark = theme === "dark";
  return {
    "--bg": dark ? "#0E1116" : "#F3F5F8",
    "--surface": dark ? "#141923" : "#FFFFFF",
    "--surface-2": dark ? "#1B2331" : "#F8FAFC",
    "--border": dark ? "#2A3345" : "#D6DEE9",
    "--text": dark ? "#F4F7FC" : "#111827",
    "--text-soft": dark ? "#A8B3C7" : "#5B667A",
    "--accent": dark ? "#73E4FF" : "#0F87A8",
    "--accent-soft": dark ? "rgba(115,228,255,0.18)" : "rgba(15,135,168,0.14)",
    "--danger": dark ? "#FF7C7C" : "#B42318",
  } as CSSProperties;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]", className)}>{children}</section>;
}

export default function PreviewV3Page() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [moduleId, setModuleId] = useState<ModuleId>("visao-geral");
  const [chatId, setChatId] = useState<string>(CONVERSAS[0].id);

  const activeModule = useMemo(() => MODULES.find((item) => item.id === moduleId) || MODULES[0], [moduleId]);
  const mensagens = MENSAGENS[chatId] || MENSAGENS.c1;

  return (
    <div
      style={varsFor(theme)}
      className="[font-family:'Manrope','Plus_Jakarta_Sans','Sora',sans-serif] min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]"
    >
      <main className="mx-auto max-w-[1700px] p-4 lg:p-6">
        <Panel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">ALTUM / OPTION D</p>
              <h1 className="mt-1 text-2xl font-semibold">Flowline Workspace</h1>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">Conceito totalmente novo: estrutura tradicional, limpa e objetiva.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text-soft)]">
                <Search className="h-4 w-4" />
                <input className="w-44 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]" placeholder="Buscar..." />
              </label>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text-soft)]"
              >
                {theme === "dark" ? <SunMedium className="h-4 w-4 text-[color:var(--accent)]" /> : <MoonStar className="h-4 w-4 text-[color:var(--accent)]" />}
                {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {MODULES.map((item) => {
              const Icon = item.icon;
              const active = item.id === moduleId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setModuleId(item.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                    active
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--text)]"
                      : "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--text-soft)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </Panel>

        <section className="mt-4 grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_320px]">
          <Panel className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Fila prioritaria</p>
            <p className="mt-1 text-sm text-[color:var(--text-soft)]">{activeModule.subtitle}</p>

            <div className="mt-3 space-y-2">
              {PRIORIDADES[moduleId].map((item) => (
                <div key={item} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text-soft)]">
                  {item}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Area de trabalho</p>
              <h2 className="mt-1 text-xl font-semibold">{activeModule.label}</h2>
            </div>

            <div className="p-4">
              {moduleId === "visao-geral" ? (
                <div className="space-y-3">
                  {["Operacao", "Comercial", "Experiencia do cliente"].map((bloco) => (
                    <div key={bloco} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                      <p className="text-sm font-medium">{bloco}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">1 acao principal definida para hoje.</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {moduleId === "inbox" ? (
                <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    {CONVERSAS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setChatId(item.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2 text-left",
                          chatId === item.id
                            ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                            : "border-[color:var(--border)] bg-[color:var(--surface-2)]"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{item.nome}</p>
                          <span className="text-xs text-[color:var(--text-soft)]">{item.espera}</span>
                        </div>
                        <p className="mt-1 text-xs text-[color:var(--text-soft)]">{item.canal}</p>
                        <p className="mt-1 text-sm text-[color:var(--text-soft)]">{item.ultima}</p>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                    <div className="space-y-2">
                      {mensagens.map((msg, index) => (
                        <div key={`${msg.hora}-${index}`} className={cn("flex", msg.from === "time" ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[85%] rounded-xl border px-3 py-2 text-sm", msg.from === "time" ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]" : "border-[color:var(--border)] bg-[color:var(--surface)]")}>
                            <p>{msg.texto}</p>
                            <p className="mt-1 text-right text-[11px] text-[color:var(--text-soft)]">{msg.hora}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {moduleId === "crm" ? (
                <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[color:var(--surface-2)] text-[color:var(--text-soft)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Lead</th>
                        <th className="px-3 py-2 font-medium">Etapa</th>
                        <th className="px-3 py-2 font-medium">Owner</th>
                        <th className="px-3 py-2 font-medium">Valor</th>
                        <th className="px-3 py-2 font-medium">Proxima acao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LEADS.map((lead) => (
                        <tr key={lead.id} className="border-t border-[color:var(--border)]">
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{lead.nome}</p>
                            <p className="text-xs text-[color:var(--text-soft)]">{lead.empresa}</p>
                          </td>
                          <td className="px-3 py-2.5">{lead.etapa}</td>
                          <td className="px-3 py-2.5 text-[color:var(--text-soft)]">{lead.owner}</td>
                          <td className="px-3 py-2.5">{lead.valor}</td>
                          <td className="px-3 py-2.5 text-[color:var(--text-soft)]">{lead.proxima}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {moduleId === "pipeline" ? (
                <div className="grid gap-3 lg:grid-cols-4">
                  {PIPELINE_DATA.map((item) => (
                    <div key={item.etapa} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                      <p className="text-sm font-medium">{item.etapa}</p>
                      <p className="mt-1 text-xl font-semibold">{item.qtd}</p>
                      <p className="text-xs text-[color:var(--text-soft)]">{item.valor}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {moduleId === "agenda" ? (
                <div className="space-y-2">
                  {[
                    "09:00 / Reuniao de alinhamento com comercial",
                    "11:30 / Call de proposta com Savio Cipriano",
                    "15:00 / Revisao de pipeline da semana",
                    "17:00 / Fechamento operacional do dia",
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2.5 text-sm text-[color:var(--text-soft)]">
                      {item}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Proxima decisao</p>
            <div className="mt-3 space-y-2">
              {["Definir owner", "Registrar proximo passo", "Confirmar prazo com cliente"].map((step) => (
                <div key={step} className="flex items-start gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-[color:var(--accent)]" />
                  <p className="text-sm text-[color:var(--text-soft)]">{step}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-soft)]">Alertas</p>
              <p className="mt-2 text-sm text-[color:var(--danger)]">Convites por e-mail com falha em lote.</p>
              <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs text-[color:var(--text-soft)]">
                Abrir diagnostico
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[color:var(--accent)]" />
                <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-soft)]">SLA atual</p>
              </div>
              <p className="mt-1 text-lg font-semibold">11 min</p>
              <p className="text-xs text-[color:var(--text-soft)]">Meta: abaixo de 15 min</p>
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}
