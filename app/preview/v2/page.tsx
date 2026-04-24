"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Command,
  Filter,
  Funnel,
  Inbox,
  LayoutDashboard,
  Layers,
  ListChecks,
  Megaphone,
  MoonStar,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Send,
  Settings2,
  Sparkles,
  SunMedium,
  Target,
  UsersRound,
  Zap,
} from "lucide-react";

type ThemeMode = "dark" | "light";
type ExperienceMode = "essencial" | "completo";
type PaletteMode = "aurora" | "graphite" | "ember";
type CrmMode = "panorama" | "mesa";

type ModuleId =
  | "visao-geral"
  | "inbox"
  | "crm"
  | "followups"
  | "agenda"
  | "pipeline"
  | "comercial"
  | "campanhas"
  | "captacao";

type Module = {
  id: ModuleId;
  label: string;
  group: "Operacao" | "Vendas" | "Crescimento";
  icon: LucideIcon;
  summary: string;
};

type Kpi = {
  label: string;
  value: string;
  note: string;
};

type Conversation = {
  id: string;
  name: string;
  queue: string;
  waiting: string;
  owner: string;
  preview: string;
  status: "aguardando" | "em_andamento" | "sem_dono" | "prioridade";
};

type Lead = {
  id: string;
  name: string;
  company: string;
  stage: string;
  owner: string;
  value: string;
  next: string;
  risk: string;
};

const MODULES: Module[] = [
  { id: "visao-geral", label: "Visao geral", group: "Operacao", icon: LayoutDashboard, summary: "Status diario em 30 segundos." },
  { id: "inbox", label: "Inbox", group: "Operacao", icon: Inbox, summary: "Conversas com foco em proxima resposta." },
  { id: "crm", label: "CRM", group: "Vendas", icon: UsersRound, summary: "Leads, contexto e proxima acao." },
  { id: "followups", label: "Follow-ups", group: "Vendas", icon: ListChecks, summary: "Cadencia diaria sem atraso." },
  { id: "agenda", label: "Agenda", group: "Vendas", icon: CalendarDays, summary: "Compromissos com dono e status." },
  { id: "pipeline", label: "Pipeline", group: "Vendas", icon: Funnel, summary: "Etapas, gargalos e ritmo comercial." },
  { id: "comercial", label: "Comercial", group: "Vendas", icon: CircleDollarSign, summary: "Propostas e receita no mesmo fluxo." },
  { id: "campanhas", label: "Campanhas", group: "Crescimento", icon: Megaphone, summary: "Outbound com operacao previsivel." },
  { id: "captacao", label: "Captacao", group: "Crescimento", icon: Target, summary: "Entrada de lead com qualidade real." },
];

const KPI_BY_MODULE: Record<ModuleId, Kpi[]> = {
  "visao-geral": [
    { label: "Leads ativos", value: "47", note: "+6 na semana" },
    { label: "Conversas abertas", value: "18", note: "4 sem owner" },
    { label: "SLA medio", value: "11 min", note: "meta ate 15 min" },
    { label: "Receita prevista", value: "R$ 142 mil", note: "janela 30 dias" },
  ],
  inbox: [
    { label: "Fila ativa", value: "18", note: "7 alta prioridade" },
    { label: "Sem dono", value: "4", note: "acao imediata" },
    { label: "Resolvidos hoje", value: "26", note: "+18% vs ontem" },
    { label: "Tempo resposta", value: "11 min", note: "estavel" },
  ],
  crm: [
    { label: "Leads no funil", value: "47", note: "+5 no mes" },
    { label: "Sem retorno", value: "9", note: "acima ideal" },
    { label: "Taxa conversao", value: "22%", note: "+3pp" },
    { label: "Ticket medio", value: "R$ 8.4k", note: "estavel" },
  ],
  followups: [
    { label: "Pendentes hoje", value: "14", note: "5 criticos" },
    { label: "Concluidos", value: "9", note: "64% da meta" },
    { label: "Atrasados", value: "3", note: "-1 vs ontem" },
    { label: "Taxa resposta", value: "41%", note: "+6pp" },
  ],
  agenda: [
    { label: "Reunioes hoje", value: "7", note: "2 sem confirmar" },
    { label: "Comparecimento", value: "81%", note: "+4pp" },
    { label: "Slots livres", value: "6", note: "bom para prospeccao" },
    { label: "Remarcacoes", value: "2", note: "baixo" },
  ],
  pipeline: [
    { label: "Oportunidades", value: "47", note: "39 abertas" },
    { label: "Valor aberto", value: "R$ 621 mil", note: "total do funil" },
    { label: "Gargalo atual", value: "Proposta", note: "media 9 dias" },
    { label: "Win rate", value: "22%", note: "+3pp" },
  ],
  comercial: [
    { label: "Propostas", value: "24", note: "7 sem retorno" },
    { label: "Aprovadas", value: "9", note: "R$ 219 mil" },
    { label: "Receita paga", value: "R$ 88 mil", note: "+14% no mes" },
    { label: "Receita pendente", value: "R$ 131 mil", note: "acao necessaria" },
  ],
  campanhas: [
    { label: "Campanhas", value: "8", note: "3 ativas" },
    { label: "Envios hoje", value: "412", note: "96% sucesso" },
    { label: "Respostas", value: "129", note: "31% taxa" },
    { label: "Leads gerados", value: "37", note: "19 quentes" },
  ],
  captacao: [
    { label: "Formularios", value: "6", note: "4 ativos" },
    { label: "Leads hoje", value: "23", note: "12 qualificados" },
    { label: "Top origem", value: "Meta Ads", note: "44%" },
    { label: "Conversao LP", value: "8.6%", note: "+1.2pp" },
  ],
};

const CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    name: "Savio Cipriano",
    queue: "Comercial",
    waiting: "2 min",
    owner: "Maria",
    preview: "Preciso do valor final para fechar hoje",
    status: "aguardando",
  },
  {
    id: "c2",
    name: "Studio Prime",
    queue: "Qualificacao",
    waiting: "7 min",
    owner: "Carlos",
    preview: "Qual o prazo de implantacao?",
    status: "em_andamento",
  },
  {
    id: "c3",
    name: "Atlas Med",
    queue: "Follow-up",
    waiting: "12 min",
    owner: "Sem dono",
    preview: "Consegue me ligar as 16h?",
    status: "sem_dono",
  },
  {
    id: "c4",
    name: "Lucilene Campos",
    queue: "Pos proposta",
    waiting: "18 min",
    owner: "Diego",
    preview: "Pode reenviar o resumo por aqui?",
    status: "prioridade",
  },
];

const CHAT_MESSAGES: Record<string, Array<{ from: "cliente" | "time"; text: string; time: string }>> = {
  c1: [
    { from: "cliente", text: "Oi, queria entender os planos e prazos.", time: "10:02" },
    { from: "time", text: "Perfeito. Te explico em 2 minutos de forma objetiva.", time: "10:03" },
    { from: "cliente", text: "Tenho pressa, consigo iniciar hoje?", time: "10:05" },
    { from: "time", text: "Sim. Te envio proposta curta e ja marcamos o proximo passo.", time: "10:06" },
  ],
  c2: [
    { from: "cliente", text: "Qual o prazo de implantacao do projeto?", time: "09:41" },
    { from: "time", text: "Implantacao inicial em ate 5 dias uteis.", time: "09:44" },
  ],
  c3: [
    { from: "cliente", text: "Consegue me ligar hoje as 16h?", time: "09:15" },
    { from: "time", text: "Consigo sim. Posso confirmar seu melhor telefone?", time: "09:19" },
  ],
  c4: [
    { from: "cliente", text: "Pode reenviar aquele resumo comercial?", time: "08:57" },
    { from: "time", text: "Claro. Te envio em formato enxuto agora.", time: "09:01" },
  ],
};

const LEADS: Lead[] = [
  {
    id: "l1",
    name: "Savio Cipriano",
    company: "Savio Marketing",
    stage: "Qualificacao",
    owner: "Maria",
    value: "R$ 7.800",
    next: "Enviar proposta curta hoje",
    risk: "medio",
  },
  {
    id: "l2",
    name: "Roberta Silva",
    company: "Clinica Viva",
    stage: "Proposta",
    owner: "Carlos",
    value: "R$ 21.800",
    next: "Ligar para decisor amanha 10h",
    risk: "alto",
  },
  {
    id: "l3",
    name: "Ulucas Jr",
    company: "UJ Solucoes",
    stage: "Contato",
    owner: "Maria",
    value: "R$ 6.400",
    next: "Atualizar dados da empresa",
    risk: "baixo",
  },
  {
    id: "l4",
    name: "Lucilene Campos",
    company: "LC Estetica",
    stage: "Fechamento",
    owner: "Diego",
    value: "R$ 18.200",
    next: "Confirmar condicoes finais",
    risk: "medio",
  },
];

const PIPELINE = [
  { stage: "Novo", count: 11, value: "R$ 89 mil", speed: "rapido" },
  { stage: "Qualificacao", count: 14, value: "R$ 204 mil", speed: "normal" },
  { stage: "Proposta", count: 12, value: "R$ 228 mil", speed: "lento" },
  { stage: "Fechamento", count: 10, value: "R$ 100 mil", speed: "normal" },
];

const PALETTES: Record<
  PaletteMode,
  {
    accent: string;
    accent2: string;
    softDark: string;
    softLight: string;
    glowDark: string;
    glowLight: string;
  }
> = {
  aurora: {
    accent: "#54E7FF",
    accent2: "#7B61FF",
    softDark: "rgba(84,231,255,0.18)",
    softLight: "rgba(84,231,255,0.14)",
    glowDark:
      "radial-gradient(circle at 8% 9%, rgba(84,231,255,0.3), transparent 32%), radial-gradient(circle at 88% 11%, rgba(123,97,255,0.22), transparent 29%)",
    glowLight:
      "radial-gradient(circle at 8% 9%, rgba(84,231,255,0.19), transparent 36%), radial-gradient(circle at 88% 11%, rgba(123,97,255,0.14), transparent 33%)",
  },
  graphite: {
    accent: "#7FFFCF",
    accent2: "#9AA8C0",
    softDark: "rgba(127,255,207,0.16)",
    softLight: "rgba(12,122,97,0.13)",
    glowDark:
      "radial-gradient(circle at 12% 8%, rgba(127,255,207,0.26), transparent 31%), radial-gradient(circle at 87% 13%, rgba(154,168,192,0.2), transparent 28%)",
    glowLight:
      "radial-gradient(circle at 12% 8%, rgba(12,122,97,0.18), transparent 35%), radial-gradient(circle at 87% 13%, rgba(45,59,77,0.14), transparent 32%)",
  },
  ember: {
    accent: "#FF6A2B",
    accent2: "#FFC2A7",
    softDark: "rgba(255,106,43,0.18)",
    softLight: "rgba(255,106,43,0.15)",
    glowDark:
      "radial-gradient(circle at 10% 8%, rgba(255,106,43,0.28), transparent 32%), radial-gradient(circle at 87% 14%, rgba(255,194,167,0.18), transparent 30%)",
    glowLight:
      "radial-gradient(circle at 10% 8%, rgba(255,106,43,0.2), transparent 35%), radial-gradient(circle at 87% 14%, rgba(23,23,23,0.1), transparent 31%)",
  },
};

function varsFor(theme: ThemeMode, palette: PaletteMode): CSSProperties {
  const p = PALETTES[palette];
  const dark = theme === "dark";
  return {
    "--nx-bg": dark ? "#05060A" : "#EEF1F5",
    "--nx-surface": dark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.86)",
    "--nx-surface-2": dark ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.96)",
    "--nx-border": dark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
    "--nx-border-strong": dark ? "rgba(84,231,255,0.56)" : "rgba(0,115,157,0.36)",
    "--nx-text": dark ? "#F7FAFF" : "#171B22",
    "--nx-text-soft": dark ? "rgba(247,250,255,0.75)" : "rgba(23,27,34,0.72)",
    "--nx-text-muted": dark ? "rgba(247,250,255,0.54)" : "rgba(23,27,34,0.5)",
    "--nx-accent": p.accent,
    "--nx-accent-2": p.accent2,
    "--nx-accent-soft": dark ? p.softDark : p.softLight,
    "--nx-shadow": dark ? "0 24px 70px rgba(0,0,0,0.46)" : "0 16px 46px rgba(15,23,42,0.11)",
    "--nx-glow": dark ? p.glowDark : p.glowLight,
    "--nx-grid":
      "linear-gradient(to right, rgba(140,150,170,0.11) 1px, transparent 1px), linear-gradient(to bottom, rgba(140,150,170,0.11) 1px, transparent 1px)",
  } as CSSProperties;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Glass({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface)] shadow-[var(--nx-shadow)] backdrop-blur-2xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--nx-accent)]/60 to-transparent" />
      {children}
    </section>
  );
}

function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  const classes =
    tone === "accent"
      ? "border-[color:var(--nx-border-strong)] bg-[color:var(--nx-accent-soft)] text-[color:var(--nx-accent)]"
      : tone === "success"
      ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-200"
      : tone === "warning"
      ? "border-amber-300/35 bg-amber-500/12 text-amber-100"
      : "border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] text-[color:var(--nx-text-soft)]";
  return <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", classes)}>{label}</span>;
}

function MetricTile({ item }: { item: Kpi }) {
  return (
    <Glass className="p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--nx-text-muted)]">{item.label}</p>
      <p className="mt-2 text-lg font-semibold text-[color:var(--nx-text)]">{item.value}</p>
      <p className="mt-1 text-xs text-[color:var(--nx-text-soft)]">{item.note}</p>
    </Glass>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--nx-text)]">{title}</h3>
        <p className="mt-1 text-sm text-[color:var(--nx-text-soft)]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export default function PreviewV2Page() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [palette, setPalette] = useState<PaletteMode>("aurora");
  const [experience, setExperience] = useState<ExperienceMode>("essencial");
  const [surfaceMode, setSurfaceMode] = useState<"foco" | "imersivo">("foco");
  const [moduleId, setModuleId] = useState<ModuleId>("visao-geral");
  const [crmMode, setCrmMode] = useState<CrmMode>("panorama");
  const [chatId, setChatId] = useState(CONVERSATIONS[0].id);
  const [leadId, setLeadId] = useState(LEADS[0].id);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const activeModule = MODULES.find((m) => m.id === moduleId) || MODULES[0];
  const activeChat = CONVERSATIONS.find((c) => c.id === chatId) || CONVERSATIONS[0];
  const activeLead = LEADS.find((l) => l.id === leadId) || LEADS[0];
  const messages = CHAT_MESSAGES[chatId] || CHAT_MESSAGES.c1;
  const activeKpis = KPI_BY_MODULE[moduleId];

  return (
    <div
      style={varsFor(theme, palette)}
      className="[font-family:'Clash_Display','Space_Grotesk','Sora',sans-serif] min-h-screen bg-[color:var(--nx-bg)] text-[color:var(--nx-text)]"
    >
      <div className="relative min-h-screen overflow-hidden bg-[image:var(--nx-glow)]">
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            surfaceMode === "imersivo" ? "opacity-35" : "opacity-15"
          )}
          style={{ backgroundImage: "var(--nx-grid)", backgroundSize: surfaceMode === "imersivo" ? "44px 44px" : "72px 72px" }}
        />
        <div className="pointer-events-none absolute -left-28 top-8 h-80 w-80 rounded-full bg-[color:var(--nx-accent)]/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-20 h-80 w-80 rounded-full bg-[color:var(--nx-accent-2)]/22 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-[color:var(--nx-accent)]/10 blur-3xl" />

        <main className="relative mx-auto max-w-[1660px] p-3 lg:p-4">
          <section className="grid gap-3 xl:grid-cols-[76px_minmax(0,1fr)]">
            <Glass className="sticky top-3 hidden h-[calc(100vh-1.5rem)] flex-col p-2 xl:flex">
              <div className="mb-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-2 py-2 text-center">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-[color:var(--nx-text-soft)]">ALTUM</p>
              </div>

              <div className="space-y-1.5 overflow-y-auto">
                {MODULES.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === moduleId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setModuleId(item.id)}
                      className={cn(
                        "group relative inline-flex w-full items-center justify-center rounded-xl border p-2.5 transition",
                        active
                          ? "border-[color:var(--nx-border-strong)] bg-[color:var(--nx-accent-soft)]"
                          : "border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] hover:border-[color:var(--nx-border-strong)]"
                      )}
                      title={item.label}
                    >
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5",
                          active
                            ? "text-[color:var(--nx-accent)]"
                            : "text-[color:var(--nx-text-soft)] group-hover:text-[color:var(--nx-accent)]"
                        )}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto space-y-1.5">
                <button
                  type="button"
                  onClick={() => setTheme((c) => (c === "dark" ? "light" : "dark"))}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-2.5"
                  title={theme === "dark" ? "Modo claro" : "Modo escuro"}
                >
                  {theme === "dark" ? (
                    <SunMedium className="h-4 w-4 text-[color:var(--nx-accent)]" />
                  ) : (
                    <MoonStar className="h-4 w-4 text-[color:var(--nx-accent)]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode((current) => (current === "imersivo" ? "foco" : "imersivo"))}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-2.5"
                  title="Alternar densidade visual"
                >
                  <Layers className="h-4 w-4 text-[color:var(--nx-text-soft)]" />
                </button>
              </div>
            </Glass>

            <div className="space-y-3">
              <Glass className="rounded-3xl p-4 lg:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[260px] flex-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--nx-text-muted)]">
                      ALTUM NEXUS / MODO LIMPO
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold leading-tight lg:text-[2rem]">
                      Menos informacao na tela, mais clareza para decidir
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-[color:var(--nx-text-soft)]">
                      O essencial fica visivel. O restante abre por demanda. Esse e o padrao que vamos levar para toda a plataforma.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-1">
                      {(["aurora", "graphite", "ember"] as PaletteMode[]).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPalette(item)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs capitalize",
                            palette === item
                              ? "bg-[color:var(--nx-accent-soft)] text-[color:var(--nx-accent)]"
                              : "text-[color:var(--nx-text-soft)]"
                          )}
                        >
                          {item}
                        </button>
                      ))}
                    </div>

                    <div className="inline-flex rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-1">
                      {(["essencial", "completo"] as ExperienceMode[]).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setExperience(item)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs",
                            experience === item
                              ? "bg-[color:var(--nx-accent-soft)] text-[color:var(--nx-accent)]"
                              : "text-[color:var(--nx-text-soft)]"
                          )}
                        >
                          {item === "essencial" ? "Essencial" : "Completo"}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setInsightsOpen((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-xs text-[color:var(--nx-text-soft)]"
                    >
                      <Sparkles className="h-4 w-4 text-[color:var(--nx-accent)]" />
                      {insightsOpen ? "Fechar insights" : "Abrir insights"}
                    </button>
                  </div>
                </div>
              </Glass>

              <Glass className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
                    <Search className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
                    <input
                      placeholder="Buscar modulo, lead, conversa, proposta..."
                      className="w-full bg-transparent outline-none placeholder:text-[color:var(--nx-text-muted)]"
                    />
                  </label>

                  <button className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-xs text-[color:var(--nx-text-soft)]">
                    <Command className="h-4 w-4 text-[color:var(--nx-accent)]" />
                    Comandos
                  </button>
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
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
                            ? "border-[color:var(--nx-border-strong)] bg-[color:var(--nx-accent-soft)]"
                            : "border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] text-[color:var(--nx-text-soft)]"
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-[color:var(--nx-accent)]" : "text-[color:var(--nx-text-muted)]")} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </Glass>

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(experience === "essencial" ? activeKpis.slice(0, 2) : activeKpis.slice(0, 3)).map((item) => (
                  <MetricTile key={item.label} item={item} />
                ))}
              </section>

              {moduleId === "inbox" ? (
                <InboxLayout
                  experience={experience}
                  assistantOpen={assistantOpen}
                  setAssistantOpen={setAssistantOpen}
                  activeChat={activeChat}
                  chatId={chatId}
                  setChatId={setChatId}
                  messages={messages}
                />
              ) : moduleId === "crm" ? (
                <CrmLayout
                  experience={experience}
                  mode={crmMode}
                  setMode={setCrmMode}
                  leadId={leadId}
                  setLeadId={setLeadId}
                  activeLead={activeLead}
                />
              ) : moduleId === "visao-geral" ? (
                <OverviewLayout />
              ) : (
                <OtherLayout module={activeModule} experience={experience} />
              )}

              <Glass className="sticky bottom-3 z-20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-[color:var(--nx-text-muted)]">
                    Acoes rapidas
                  </span>
                  {["Novo lead", "Novo convite", "Nova proposta"].map((item) => (
                    <button
                      key={item}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-1.5 text-xs text-[color:var(--nx-text-soft)]"
                    >
                      <Zap className="h-3.5 w-3.5 text-[color:var(--nx-accent)]" />
                      {item}
                    </button>
                  ))}
                </div>
              </Glass>
            </div>
          </section>

          {insightsOpen ? (
            <section className="mt-3 grid gap-3 xl:grid-cols-2">
              <Glass className="p-4">
                <SectionTitle
                  title="Pulse AI"
                  subtitle="Resumo executivo aberto sob demanda."
                  action={<Chip label="sob demanda" tone="accent" />}
                />
                <div className="mt-3 space-y-2">
                  {[
                    "5 convites de usuario aguardando envio.",
                    "3 conversas do inbox sem owner definido.",
                    "2 oportunidades em proposta sem retorno ha 48h.",
                  ].map((line) => (
                    <div
                      key={line}
                      className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </Glass>

              <Glass className="p-4">
                <SectionTitle title="Acoes de plataforma" subtitle="Login, convites e perfil." />
                <div className="mt-3 grid gap-2">
                  {[
                    "Corrigir convite por e-mail com status visual.",
                    "Padronizar login com feedback mais claro.",
                    "Exibir perfil do usuario e botao de logout.",
                  ].map((item) => (
                    <button
                      key={item}
                      className="inline-flex items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-left text-sm text-[color:var(--nx-text-soft)]"
                    >
                      <span>{item}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--nx-accent)]" />
                    </button>
                  ))}
                </div>
              </Glass>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function OverviewLayout() {
  return (
    <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <Glass className="p-4">
        <SectionTitle
          title="Radar do dia"
          subtitle="Foco no que move resultado. Sem texto excessivo."
          action={<Chip label="3 pontos criticos" tone="warning" />}
        />
        <div className="mt-4 space-y-2">
          {[
            "Responder 4 conversas sem owner no inbox.",
            "Enviar proposta final para Savio Cipriano.",
            "Agendar call de fechamento com LC Estetica.",
            "Resolver convites de usuario pendentes.",
          ].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2">
              <p className="text-sm text-[color:var(--nx-text-soft)]">{item}</p>
              <ChevronRight className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
            </div>
          ))}
        </div>
      </Glass>

      <div className="space-y-3">
        <Glass className="p-4">
          <SectionTitle title="Pulso operacional" subtitle="Leitura executiva da saude da operacao." />
          <div className="mt-3 space-y-2">
            {[
              "Inbox com 4 conversas sem dono.",
              "CRM com 9 leads sem retorno > 48h.",
              "Comercial com R$ 131 mil pendentes.",
            ].map((line) => (
              <div key={line} className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2.5 text-sm text-[color:var(--nx-text-soft)]">
                {line}
              </div>
            ))}
          </div>
        </Glass>
        <Glass className="p-4">
          <SectionTitle title="Atalhos de decisao" subtitle="Entradas diretas para o dia a dia." />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {["Abrir inbox", "Abrir CRM", "Criar proposta", "Ir para agenda"].map((item) => (
              <button key={item} className="inline-flex items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
                <span>{item}</span>
                <ArrowRight className="h-4 w-4 text-[color:var(--nx-accent)]" />
              </button>
            ))}
          </div>
        </Glass>
      </div>
    </section>
  );
}

function InboxLayout({
  experience,
  assistantOpen,
  setAssistantOpen,
  activeChat,
  chatId,
  setChatId,
  messages,
}: {
  experience: ExperienceMode;
  assistantOpen: boolean;
  setAssistantOpen: (value: boolean) => void;
  activeChat: Conversation;
  chatId: string;
  setChatId: (id: string) => void;
  messages: Array<{ from: "cliente" | "time"; text: string; time: string }>;
}) {
  const showAssistant = experience === "completo" && assistantOpen;

  return (
    <section
      className={cn(
        "grid min-h-[72vh] gap-3",
        showAssistant
          ? "xl:grid-cols-[320px_minmax(0,1fr)_340px]"
          : "xl:grid-cols-[320px_minmax(0,1fr)]"
      )}
    >
      <Glass className="flex min-h-0 flex-col p-4">
        <SectionTitle title="Fila inteligente" subtitle="Ordenacao por urgencia e contexto." />
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
            <Search className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
            <input placeholder="Buscar conversa" className="w-full bg-transparent outline-none placeholder:text-[color:var(--nx-text-muted)]" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="todas" tone="accent" />
            <Chip label="sem dono" tone="warning" />
            <Chip label="SLA estourado" tone="warning" />
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {CONVERSATIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChatId(item.id)}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition",
                item.id === chatId
                  ? "border-[color:var(--nx-border-strong)] bg-[color:var(--nx-accent-soft)]"
                  : "border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] hover:border-[color:var(--nx-border-strong)]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.name}</p>
                <span className="text-xs text-[color:var(--nx-text-muted)]">{item.waiting}</span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--nx-text-muted)]">{item.queue} / {item.owner}</p>
              <p className="mt-2 text-sm text-[color:var(--nx-text-soft)]">{item.preview}</p>
              <div className="mt-2">
                <Chip
                  label={
                    item.status === "aguardando"
                      ? "Aguardando voce"
                      : item.status === "em_andamento"
                      ? "Em andamento"
                      : item.status === "sem_dono"
                      ? "Sem dono"
                      : "Prioridade alta"
                  }
                  tone={item.status === "sem_dono" || item.status === "prioridade" ? "warning" : "neutral"}
                />
              </div>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="flex min-h-0 flex-col p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--nx-border)] pb-3">
          <div>
            <h4 className="text-base font-semibold">{activeChat.name}</h4>
            <p className="text-sm text-[color:var(--nx-text-soft)]">Fila {activeChat.queue} / WhatsApp</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip label="IA ativa" tone="success" />
            <button className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-1.5 text-xs text-[color:var(--nx-text-soft)]">
              Assumir conversa
            </button>
            {experience === "completo" ? (
              <button
                type="button"
                onClick={() => setAssistantOpen(!assistantOpen)}
                className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-2.5 py-1.5 text-xs text-[color:var(--nx-text-soft)]"
              >
                {assistantOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
          {messages.map((msg, idx) => (
            <div key={`${msg.time}_${idx}`} className={cn("flex", msg.from === "time" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[82%] rounded-2xl border px-3 py-2",
                  msg.from === "time"
                    ? "border-[color:var(--nx-border-strong)] bg-[color:var(--nx-accent-soft)]"
                    : "border-[color:var(--nx-border)] bg-[color:var(--nx-surface)]"
                )}
              >
                <p className="text-sm text-[color:var(--nx-text-soft)]">{msg.text}</p>
                <p className="mt-1 text-right text-[11px] text-[color:var(--nx-text-muted)]">{msg.time}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {["Resposta curta", "Pedir telefone", "Agendar call 16h", "Enviar proposta"].map((quick) => (
            <button key={quick} className="rounded-full border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-1.5 text-xs text-[color:var(--nx-text-soft)]">
              {quick}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            placeholder="Responder com clareza e proximo passo..."
            className="h-10 w-full rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 text-sm outline-none placeholder:text-[color:var(--nx-text-muted)]"
          />
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--nx-accent)] px-4 text-sm font-medium text-black">
            <Send className="h-4 w-4" />
            Enviar
          </button>
        </div>
      </Glass>

      {showAssistant ? (
        <Glass className="space-y-3 p-4">
          <SectionTitle title="Matriz de decisao" subtitle="Contexto para agir sem trocar de tela." />
          <div className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--nx-text-muted)]">Lead conectado</p>
            <p className="mt-2 text-sm font-medium">Savio Cipriano / Savio Marketing</p>
            <p className="mt-1 text-sm text-[color:var(--nx-text-soft)]">Etapa: Qualificacao / Owner: Maria</p>
          </div>
          <div className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--nx-text-muted)]">Proxima acao recomendada</p>
            <p className="mt-2 text-sm text-[color:var(--nx-text-soft)]">Enviar proposta curta e marcar call para 16h.</p>
          </div>
          <div className="space-y-2">
            {[
              "Criar tarefa de follow-up",
              "Mover etapa para proposta",
              "Registrar nota comercial",
              "Gerar proposta rapida",
            ].map((item) => (
              <button key={item} className="inline-flex w-full items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
                <span>{item}</span>
                <ChevronRight className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
              </button>
            ))}
          </div>
        </Glass>
      ) : null}
    </section>
  );
}

function CrmLayout({
  experience,
  mode,
  setMode,
  leadId,
  setLeadId,
  activeLead,
}: {
  experience: ExperienceMode;
  mode: CrmMode;
  setMode: (mode: CrmMode) => void;
  leadId: string;
  setLeadId: (id: string) => void;
  activeLead: Lead;
}) {
  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_350px]">
      <Glass className="space-y-3 p-4">
        <SectionTitle
          title="CRM Nexus"
          subtitle="Visual novo para vender com menos cansaco mental."
          action={
            <div className="inline-flex rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-1">
              <button
                type="button"
                onClick={() => setMode("panorama")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs",
                  mode === "panorama" ? "bg-[color:var(--nx-accent-soft)] text-[color:var(--nx-accent)]" : "text-[color:var(--nx-text-soft)]"
                )}
              >
                Panorama
              </button>
              <button
                type="button"
                onClick={() => setMode("mesa")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs",
                  mode === "mesa" ? "bg-[color:var(--nx-accent-soft)] text-[color:var(--nx-accent)]" : "text-[color:var(--nx-text-soft)]"
                )}
              >
                Mesa de leads
              </button>
            </div>
          }
        />

        <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <label className="flex items-center gap-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
            <Search className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
            <input placeholder="Buscar lead, empresa, telefone" className="w-full bg-transparent outline-none placeholder:text-[color:var(--nx-text-muted)]" />
          </label>
          <select className="h-10 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 text-sm text-[color:var(--nx-text-soft)]">
            <option>Todas etapas</option>
            <option>Qualificacao</option>
            <option>Proposta</option>
            <option>Fechamento</option>
          </select>
          <select className="h-10 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 text-sm text-[color:var(--nx-text-soft)]">
            <option>Todos owners</option>
            <option>Maria</option>
            <option>Carlos</option>
            <option>Diego</option>
          </select>
        </div>

        {mode === "panorama" ? (
          <div className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-4">
              {PIPELINE.map((col) => (
                <div key={col.stage} className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{col.stage}</p>
                    <Chip label={`${col.count}`} tone="accent" />
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--nx-text-muted)]">{col.value}</p>
                  <div className="mt-3 h-2 rounded-full bg-[color:var(--nx-surface)]">
                    <div
                      className={cn(
                        "h-2 rounded-full",
                        col.speed === "lento"
                          ? "w-9/12 bg-amber-400"
                          : col.speed === "rapido"
                          ? "w-4/12 bg-emerald-400"
                          : "w-6/12 bg-[color:var(--nx-accent)]"
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {LEADS.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setLeadId(lead.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left",
                    lead.id === leadId
                      ? "border-[color:var(--nx-border-strong)] bg-[color:var(--nx-accent-soft)]"
                      : "border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{lead.name}</p>
                    <Chip label={lead.stage} />
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--nx-text-muted)]">{lead.company}</p>
                  <p className="mt-2 text-sm text-[color:var(--nx-text-soft)]">{lead.next}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[color:var(--nx-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[color:var(--nx-surface-2)] text-[color:var(--nx-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  {experience === "completo" ? <th className="px-3 py-2 font-medium">Proxima acao</th> : null}
                  <th className="px-3 py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {LEADS.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setLeadId(lead.id)}
                    className={cn(
                      "cursor-pointer border-t border-[color:var(--nx-border)] bg-[color:var(--nx-surface)] hover:bg-[color:var(--nx-surface-2)]",
                      lead.id === leadId ? "bg-[color:var(--nx-accent-soft)]" : undefined
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-xs text-[color:var(--nx-text-muted)]">{lead.company}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[color:var(--nx-text-soft)]">{lead.stage}</td>
                    <td className="px-3 py-2.5 text-[color:var(--nx-text-soft)]">{lead.owner}</td>
                    {experience === "completo" ? (
                      <td className="px-3 py-2.5 text-[color:var(--nx-text-soft)]">{lead.next}</td>
                    ) : null}
                    <td className="px-3 py-2.5 font-medium text-[color:var(--nx-text-soft)]">{lead.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Glass>

      <Glass className="space-y-3 p-4">
        <SectionTitle title="Dossie do lead" subtitle="Contexto direto para acelerar decisao." action={<Chip label={activeLead.stage} tone="accent" />} />
        <div className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
          <p className="text-base font-semibold">{activeLead.name}</p>
          <p className="mt-1 text-sm text-[color:var(--nx-text-soft)]">{activeLead.company}</p>
          <p className="mt-2 text-sm text-[color:var(--nx-text-soft)]">Owner: {activeLead.owner}</p>
          <p className="mt-1 text-sm text-[color:var(--nx-text-soft)]">Potencial: {activeLead.value}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--nx-text-muted)]">Proxima acao</p>
          <p className="mt-2 text-sm text-[color:var(--nx-text-soft)]">{activeLead.next}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--nx-text-muted)]">Risco atual</p>
          <p className="mt-2 text-sm text-[color:var(--nx-text-soft)]">
            {activeLead.risk === "alto" ? "Alto: sem resposta do decisor nas ultimas 48h." : activeLead.risk === "medio" ? "Medio: precisa confirmar proximo passo hoje." : "Baixo: fluxo em ritmo saudavel."}
          </p>
        </div>
        {experience === "completo" ? (
          <div className="space-y-2">
            {["Abrir inbox", "Criar follow-up", "Gerar proposta", "Mover etapa"].map((action) => (
              <button key={action} className="inline-flex w-full items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
                <span>{action}</span>
                <ChevronRight className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
              </button>
            ))}
          </div>
        ) : null}
      </Glass>
    </section>
  );
}

function OtherLayout({
  module,
  experience,
}: {
  module: Module;
  experience: ExperienceMode;
}) {
  return (
    <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
      <Glass className="p-4">
        <SectionTitle
          title={`${module.label} / novo canvas`}
          subtitle="Layout desacoplado do modelo antigo, com foco em ritmo e leitura curta."
          action={<Chip label={experience === "essencial" ? "enxuto" : "expandido"} tone="accent" />}
        />
        <div className="mt-4 grid gap-2">
          {[
            "Acoes principais no topo, sem menus confusos.",
            "Resumo em linguagem empresarial clara.",
            "Painel de contexto visivel so quando necessario.",
            "Visual de alto impacto sem perder legibilidade.",
          ].map((line) => (
            <div key={line} className="rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2.5 text-sm text-[color:var(--nx-text-soft)]">
              {line}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {["Nova acao", "Filtrar", "Exportar"].map((item) => (
            <button key={item} className="inline-flex items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
              <span>{item}</span>
              <ArrowRight className="h-4 w-4 text-[color:var(--nx-accent)]" />
            </button>
          ))}
        </div>
      </Glass>

      <div className="space-y-3">
        <Glass className="p-4">
          <SectionTitle title="Diretrizes de UX" subtitle="Base comum para toda plataforma." />
          <div className="mt-3 space-y-2">
            {[
              "Toda tela deve mostrar proximo passo.",
              "Linguagem simples, sem jargao tecnico.",
              "Modo essencial para uso diario e rapido.",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--nx-accent)]" />
                <p className="text-sm text-[color:var(--nx-text-soft)]">{item}</p>
              </div>
            ))}
          </div>
        </Glass>

        {experience === "completo" ? (
          <Glass className="p-4">
            <SectionTitle title="Camada avancada" subtitle="Regras, automacoes e leitura profunda." />
            <div className="mt-3 grid gap-2">
              {[
                { label: "Automacoes do modulo", icon: Sparkles },
                { label: "Metricas detalhadas", icon: Activity },
                { label: "Permissoes e papois", icon: Settings2 },
                { label: "Rastreabilidade", icon: Filter },
              ].map((item) => (
                <button key={item.label} className="inline-flex items-center justify-between rounded-xl border border-[color:var(--nx-border)] bg-[color:var(--nx-surface-2)] px-3 py-2 text-sm text-[color:var(--nx-text-soft)]">
                  <span>{item.label}</span>
                  <item.icon className="h-4 w-4 text-[color:var(--nx-text-muted)]" />
                </button>
              ))}
            </div>
          </Glass>
        ) : null}
      </div>
    </section>
  );
}
