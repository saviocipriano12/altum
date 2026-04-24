"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Funnel,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
  Megaphone,
  MoonStar,
  Plus,
  Search,
  Sparkles,
  SunMedium,
  Target,
  Users,
} from "lucide-react";

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

type ModuleConfig = {
  id: ModuleId;
  label: string;
  group: "Operacao" | "Vendas" | "Crescimento";
  icon: LucideIcon;
  objective: string;
  subtitle: string;
  primaryAction: string;
  kpis: Array<{ label: string; value: string; trend: string }>;
  highlights: string[];
  tableTitle: string;
  tableColumns: string[];
  tableRows: string[][];
  sideCards: Array<{ title: string; items: string[] }>;
};

const MODULES: ModuleConfig[] = [
  {
    id: "visao-geral",
    label: "Visao geral",
    group: "Operacao",
    icon: LayoutDashboard,
    objective: "Resumo diario da operacao com foco em prioridades e riscos.",
    subtitle: "O gestor entra e entende em menos de 30 segundos o que precisa de atencao.",
    primaryAction: "Revisar prioridades de hoje",
    kpis: [
      { label: "Leads ativos", value: "34", trend: "+4 hoje" },
      { label: "Conversas abertas", value: "11", trend: "-2 vs ontem" },
      { label: "Tarefas pendentes", value: "15", trend: "5 com prazo hoje" },
      { label: "Receita prevista", value: "R$ 142 mil", trend: "+12% no mes" },
    ],
    highlights: [
      "Priorizar 3 leads em etapa de proposta com alto potencial.",
      "Reforcar follow-up de leads sem resposta ha mais de 48h.",
      "Validar gargalo de atendimento no periodo da tarde.",
    ],
    tableTitle: "Fila de prioridades",
    tableColumns: ["Item", "Responsavel", "Status", "Prazo"],
    tableRows: [
      ["Lead Atlas Med", "Maria", "Aguardando retorno", "Hoje 14:00"],
      ["Proposta Rota Sul", "Carlos", "Pronto para enviar", "Hoje 16:00"],
      ["Reuniao Studio Prime", "Diego", "Confirmar agenda", "Amanha 09:30"],
    ],
    sideCards: [
      {
        title: "Alertas operacionais",
        items: [
          "2 tarefas com prazo estourado.",
          "1 convite de usuario falhou no envio.",
          "Canal WhatsApp com pico de fila.",
        ],
      },
      {
        title: "Sugestoes da IA",
        items: [
          "Mover Savio Cipriano para proposta.",
          "Criar follow-up para Lucilene Campos.",
          "Revisar score de Mariana Telles.",
        ],
      },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    group: "Operacao",
    icon: Inbox,
    objective: "Central de conversas com triagem simples e resposta rapida.",
    subtitle: "Fila unica com filtros claros para reduzir tempo de resposta.",
    primaryAction: "Atender proximas conversas",
    kpis: [
      { label: "Fila ativa", value: "18", trend: "7 em alta prioridade" },
      { label: "Sem responsavel", value: "3", trend: "acao imediata" },
      { label: "SLA medio", value: "11 min", trend: "meta: ate 15 min" },
      { label: "Resolvidos hoje", value: "26", trend: "+18% vs ontem" },
    ],
    highlights: [
      "Deixar no topo apenas conversas sem dono e com cliente aguardando.",
      "Exibir acao rapida de assumir conversa em 1 clique.",
      "Resumo de contexto no lado direito para evitar leitura longa.",
    ],
    tableTitle: "Conversas em andamento",
    tableColumns: ["Contato", "Canal", "Ultima mensagem", "Fila"],
    tableRows: [
      ["Savio Cipriano", "WhatsApp", "Preciso do valor final", "Comercial"],
      ["Ulucas Jr", "Site chat", "Consegue hoje as 16h?", "Agendamentos"],
      ["Clinica Viva", "WhatsApp", "Quais planos voces tem?", "Qualificacao"],
    ],
    sideCards: [
      {
        title: "Acoes rapidas",
        items: [
          "Assumir conversa",
          "Encaminhar para vendedor",
          "Criar tarefa de follow-up",
        ],
      },
      {
        title: "Padrao de linguagem",
        items: [
          "Responder curto e direto.",
          "Evitar termos tecnicos desnecessarios.",
          "Fechar toda resposta com proximo passo.",
        ],
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    group: "Vendas",
    icon: Users,
    objective: "Gerenciar leads com visao de funil e painel lateral de contexto.",
    subtitle: "Kanban + tabela + detalhes no mesmo padrao visual da plataforma.",
    primaryAction: "Atualizar etapas do funil",
    kpis: [
      { label: "Leads no funil", value: "47", trend: "+5 esta semana" },
      { label: "Taxa de conversao", value: "22%", trend: "+3pp no mes" },
      { label: "Ticket medio", value: "R$ 8.400", trend: "estavel" },
      { label: "Sem retorno", value: "9", trend: "acima do ideal" },
    ],
    highlights: [
      "Mostrar sempre a proxima acao recomendada por lead.",
      "Diminuir campos visiveis por padrao para foco.",
      "Detalhes completos apenas no painel lateral.",
    ],
    tableTitle: "Leads selecionados",
    tableColumns: ["Lead", "Etapa", "Responsavel", "Valor"],
    tableRows: [
      ["Savio Cipriano", "Qualificacao", "Maria", "R$ 7.800"],
      ["Roberta Silva", "Fechamento", "Carlos", "R$ 21.800"],
      ["Mariana Telles", "Novo", "Carlos", "R$ 6.800"],
    ],
    sideCards: [
      {
        title: "Proxima acao",
        items: [
          "Enviar proposta resumida para Savio.",
          "Agendar reuniao com Studio Prime.",
          "Atualizar contato de Lucilene.",
        ],
      },
      {
        title: "Qualidade do cadastro",
        items: [
          "6 leads sem email",
          "4 leads sem origem definida",
          "2 leads sem responsavel",
        ],
      },
    ],
  },
  {
    id: "followups",
    label: "Follow-ups",
    group: "Vendas",
    icon: ListTodo,
    objective: "Organizar lembretes e cadencias com clareza de prazo e dono.",
    subtitle: "Tudo que precisa ser retomado com cliente em um lugar unico.",
    primaryAction: "Executar follow-ups pendentes",
    kpis: [
      { label: "Pendentes hoje", value: "14", trend: "5 criticos" },
      { label: "Concluidos", value: "9", trend: "64% da meta" },
      { label: "Atrasados", value: "3", trend: "-1 vs ontem" },
      { label: "Taxa de resposta", value: "41%", trend: "+6pp no mes" },
    ],
    highlights: [
      "Priorizar por urgencia e potencial de receita.",
      "Mostrar template sugerido com linguagem simples.",
      "Permitir remarcar em 1 clique.",
    ],
    tableTitle: "Lista de follow-ups",
    tableColumns: ["Lead", "Modelo", "Agendado para", "Status"],
    tableRows: [
      ["Savio Cipriano", "Proposta curta", "Hoje 15:00", "Pendente"],
      ["Atlas Med", "Lembrete de reuniao", "Hoje 17:00", "Pendente"],
      ["Clinica Viva", "Retomada leve", "Amanha 09:15", "Agendado"],
    ],
    sideCards: [
      {
        title: "Regras de cadencia",
        items: [
          "Dia 1: contato inicial",
          "Dia 3: lembrete objetivo",
          "Dia 7: encerramento respeitoso",
        ],
      },
      {
        title: "Indicadores",
        items: [
          "Melhor horario: 10h - 12h",
          "Canal com maior resposta: WhatsApp",
          "Template mais efetivo: proposta curta",
        ],
      },
    ],
  },
  {
    id: "agenda",
    label: "Agenda",
    group: "Vendas",
    icon: CalendarDays,
    objective: "Consolidar compromissos comerciais e evitar conflito de horarios.",
    subtitle: "Visao semanal para planejamento do time de vendas.",
    primaryAction: "Organizar agenda da semana",
    kpis: [
      { label: "Reunioes hoje", value: "7", trend: "2 confirmacao pendente" },
      { label: "Taxa de comparecimento", value: "81%", trend: "+4pp" },
      { label: "Remarcacoes", value: "2", trend: "baixo" },
      { label: "Slots livres", value: "6", trend: "bom para prospeccao" },
    ],
    highlights: [
      "Mostrar status da reuniao: confirmado, pendente, remarcado.",
      "Criar tarefa automaticamente apos reuniao.",
      "Integrar com calendario externo sem poluir tela.",
    ],
    tableTitle: "Compromissos",
    tableColumns: ["Compromisso", "Responsavel", "Data", "Origem"],
    tableRows: [
      ["Reuniao Savio", "Maria", "Hoje 16:00", "CRM"],
      ["Diagnostico Atlas Med", "Carlos", "Amanha 10:30", "Inbox"],
      ["Apresentacao Argo", "Diego", "Amanha 14:00", "Campanha"],
    ],
    sideCards: [
      {
        title: "Checklist pre-reuniao",
        items: [
          "Resumo do lead revisado",
          "Objetivo da reuniao definido",
          "Proxima acao preparada",
        ],
      },
      {
        title: "Automacoes",
        items: [
          "Criar nota pos-reuniao",
          "Agendar follow-up automatico",
          "Atualizar etapa no pipeline",
        ],
      },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    group: "Vendas",
    icon: Funnel,
    objective: "Medir saude do funil por etapa e conversao.",
    subtitle: "Visao executiva para decisao de curto prazo.",
    primaryAction: "Analisar gargalos do funil",
    kpis: [
      { label: "Valor total", value: "R$ 386 mil", trend: "+8% no mes" },
      { label: "Novo > Qualificacao", value: "59%", trend: "bom" },
      { label: "Qualificacao > Proposta", value: "38%", trend: "ponto de atencao" },
      { label: "Proposta > Fechamento", value: "31%", trend: "+5pp" },
    ],
    highlights: [
      "Destacar etapas com queda de conversao em vermelho.",
      "Permitir drill-down por responsavel.",
      "Conectar com causas de perda para ajuste rapido.",
    ],
    tableTitle: "Resumo por etapa",
    tableColumns: ["Etapa", "Leads", "Valor", "Conversao"],
    tableRows: [
      ["Novo", "18", "R$ 92 mil", "100%"],
      ["Qualificacao", "14", "R$ 117 mil", "59%"],
      ["Proposta", "9", "R$ 101 mil", "38%"],
    ],
    sideCards: [
      {
        title: "Gargalos",
        items: [
          "Queda em qualificacao na ultima semana.",
          "Tempo medio alto na etapa proposta.",
          "Baixa evolucao em leads sem owner fixo.",
        ],
      },
      {
        title: "Acoes sugeridas",
        items: [
          "Revisar script de qualificacao.",
          "Reduzir ciclo de proposta para 48h.",
          "Redistribuir carteira por capacidade.",
        ],
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    group: "Vendas",
    icon: DollarSign,
    objective: "Painel de oportunidades e previsao de receita.",
    subtitle: "Decisao financeira comercial com dados claros e comparaveis.",
    primaryAction: "Revisar oportunidades de alto valor",
    kpis: [
      { label: "Oportunidades abertas", value: "21", trend: "+2" },
      { label: "Forecast 30 dias", value: "R$ 198 mil", trend: "+11%" },
      { label: "Win rate", value: "29%", trend: "+2pp" },
      { label: "Ciclo medio", value: "17 dias", trend: "-1 dia" },
    ],
    highlights: [
      "Padrao de filtros por valor, probabilidade e owner.",
      "Tabela com ordenacao por impacto financeiro.",
      "Historico de ajustes de forecast transparente.",
    ],
    tableTitle: "Oportunidades",
    tableColumns: ["Oportunidade", "Owner", "Probabilidade", "Valor"],
    tableRows: [
      ["Studio Prime - Expansao", "Diego", "70%", "R$ 42 mil"],
      ["Rota Sul - Implantacao", "Carlos", "85%", "R$ 21,8 mil"],
      ["Argo - Pacote anual", "Maria", "45%", "R$ 31 mil"],
    ],
    sideCards: [
      {
        title: "Risco de receita",
        items: [
          "3 oportunidades sem contato ha 5 dias.",
          "2 propostas sem retorno.",
          "1 deal acima de 30 dias no mesmo estagio.",
        ],
      },
      {
        title: "Acoes de recuperacao",
        items: [
          "Reforcar decisor principal",
          "Revisar escopo comercial",
          "Oferecer reuniao de fechamento",
        ],
      },
    ],
  },
  {
    id: "campanhas",
    label: "Campanhas",
    group: "Crescimento",
    icon: Megaphone,
    objective: "Acompanhar performance de canais pagos e organicos em um painel unico.",
    subtitle: "Marketing e vendas alinhados na mesma leitura de resultado.",
    primaryAction: "Otimizar campanhas com menor desempenho",
    kpis: [
      { label: "Investimento mes", value: "R$ 28 mil", trend: "+9%" },
      { label: "Leads gerados", value: "186", trend: "+14%" },
      { label: "CPL medio", value: "R$ 150", trend: "-8%" },
      { label: "Leads qualificados", value: "63", trend: "+11%" },
    ],
    highlights: [
      "Exibir impacto por campanha e origem.",
      "Conectar qualidade do lead com performance de vendas.",
      "Sugerir realocacao de verba com base em resultado real.",
    ],
    tableTitle: "Campanhas ativas",
    tableColumns: ["Campanha", "Canal", "Investimento", "Resultado"],
    tableRows: [
      ["Oferta Comercial Q2", "Meta Ads", "R$ 9.200", "34 leads qualificados"],
      ["Diagnostico B2B", "Google Ads", "R$ 6.500", "21 leads qualificados"],
      ["Retargeting Conversao", "Meta Ads", "R$ 3.800", "11 reunioes"],
    ],
    sideCards: [
      {
        title: "Oportunidades de melhoria",
        items: [
          "Criativo de Meta com queda de CTR.",
          "Landing com alta taxa de abandono.",
          "Campanha Google com bom custo e baixa qualidade.",
        ],
      },
      {
        title: "Recomendacoes",
        items: [
          "Testar nova copy na oferta principal.",
          "Ajustar formulario para reduzir ruido.",
          "Aumentar verba de campanha com melhor SQL.",
        ],
      },
    ],
  },
  {
    id: "captacao",
    label: "Captacao",
    group: "Crescimento",
    icon: Target,
    objective: "Controlar entrada de novos leads com padrao de qualidade.",
    subtitle: "Fonte unica para formularios, canais e importacoes.",
    primaryAction: "Validar qualidade dos novos leads",
    kpis: [
      { label: "Leads novos hoje", value: "23", trend: "+5" },
      { label: "Taxa de validacao", value: "88%", trend: "bom" },
      { label: "Duplicados", value: "2", trend: "baixo" },
      { label: "Sem contato", value: "4", trend: "corrigir formulario" },
    ],
    highlights: [
      "Regra clara de lead valido antes de entrar no CRM.",
      "Deteccao de duplicidade no momento da entrada.",
      "Mapeamento automatico de origem e campanha.",
    ],
    tableTitle: "Fontes de captacao",
    tableColumns: ["Origem", "Leads", "Custo por lead", "Qualidade"],
    tableRows: [
      ["Landing principal", "11", "R$ 98", "Alta"],
      ["WhatsApp direto", "7", "R$ 0", "Media"],
      ["Meta Ads - Form", "5", "R$ 162", "Alta"],
    ],
    sideCards: [
      {
        title: "Checklist de entrada",
        items: [
          "Nome e contato obrigatorios",
          "Origem registrada",
          "Responsavel inicial definido",
        ],
      },
      {
        title: "Ajustes sugeridos",
        items: [
          "Reduzir campos opcionais do formulario.",
          "Melhorar pergunta de qualificacao inicial.",
          "Criar regra para rejeitar spam automaticamente.",
        ],
      },
    ],
  },
];

type PreviewTheme = "light" | "dark";

function buildThemeStyle(theme: PreviewTheme): CSSProperties {
  if (theme === "dark") {
    return {
      "--p-bg": "#070707",
      "--p-bg-soft": "#101010",
      "--p-text": "#F9F9F9",
      "--p-text-soft": "#D1D1D1",
      "--p-text-muted": "#A7A7A7",
      "--p-border": "rgba(249, 249, 249, 0.12)",
      "--p-border-strong": "rgba(232, 80, 2, 0.4)",
      "--p-panel": "rgba(20, 20, 20, 0.74)",
      "--p-panel-solid": "#171717",
      "--p-sidebar": "rgba(12, 12, 12, 0.82)",
      "--p-accent": "#E85002",
      "--p-accent-soft": "rgba(232, 80, 2, 0.18)",
      "--p-accent-glow": "rgba(232, 80, 2, 0.2)",
      "--p-stripe": "rgba(232, 80, 2, 0.16)",
      "--p-shadow": "0 26px 70px rgba(0, 0, 0, 0.46)",
      "--p-focus": "rgba(193, 8, 1, 0.35)",
    } as CSSProperties;
  }

  return {
    "--p-bg": "#F9F9F9",
    "--p-bg-soft": "#F3F3F3",
    "--p-text": "#000000",
    "--p-text-soft": "#333333",
    "--p-text-muted": "#646464",
    "--p-border": "rgba(51, 51, 51, 0.18)",
    "--p-border-strong": "rgba(232, 80, 2, 0.34)",
    "--p-panel": "rgba(255, 255, 255, 0.76)",
    "--p-panel-solid": "#FFFFFF",
    "--p-sidebar": "rgba(249, 249, 249, 0.82)",
    "--p-accent": "#E85002",
    "--p-accent-soft": "rgba(232, 80, 2, 0.12)",
    "--p-accent-glow": "rgba(232, 80, 2, 0.14)",
    "--p-stripe": "rgba(232, 80, 2, 0.08)",
    "--p-shadow": "0 22px 56px rgba(0, 0, 0, 0.1)",
    "--p-focus": "rgba(193, 8, 1, 0.26)",
  } as CSSProperties;
}

export default function PlataformaPreviewPage() {
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [activeId, setActiveId] = useState<ModuleId>("visao-geral");
  const activeModule = MODULES.find((item) => item.id === activeId) || MODULES[0];
  const themeStyle = useMemo(() => buildThemeStyle(theme), [theme]);

  const groups = useMemo(() => {
    const order: Array<ModuleConfig["group"]> = ["Operacao", "Vendas", "Crescimento"];
    return order.map((group) => ({
      group,
      items: MODULES.filter((item) => item.group === group),
    }));
  }, []);

  return (
    <div
      style={themeStyle}
      className="relative min-h-screen bg-[var(--p-bg)] text-[var(--p-text)] [font-family:var(--font-sans)]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--p-accent-glow),transparent_55%)]" />
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg,var(--p-stripe)_0px,var(--p-stripe)_1px,transparent_1px,transparent_8px)",
          }}
        />
      </div>

      <header className="sticky top-0 z-20 border-b border-[var(--p-border)] bg-[var(--p-panel)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--p-text-muted)]">ALTUM Platform Preview</p>
            <p className="text-lg font-semibold">Padrao visual unificado</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--p-accent)]" />
              <input
                type="search"
                placeholder="Buscar modulo ou acao"
                className="h-10 w-64 rounded-lg border border-[var(--p-border)] bg-[var(--p-panel-solid)]/90 pl-9 pr-3 text-sm text-[var(--p-text)] outline-none focus:border-[var(--p-border-strong)] focus:ring-2 focus:ring-[var(--p-focus)]"
              />
            </label>

            <button
              type="button"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-panel-solid)]/90 px-3 text-sm font-medium text-[var(--p-text-soft)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-text)]"
            >
              {theme === "light" ? <MoonStar className="h-4 w-4 text-[var(--p-accent)]" /> : <SunMedium className="h-4 w-4 text-[var(--p-accent)]" />}
              {theme === "light" ? "Modo dark" : "Modo claro"}
            </button>

            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-panel-solid)]/90 px-3 text-sm font-medium text-[var(--p-text-soft)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-text)]"
            >
              <Mail className="h-4 w-4 text-[var(--p-accent)]" />
              Convidar usuario
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--p-border-strong)] bg-[var(--p-accent)] px-3 text-sm font-medium text-white hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Acao principal
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1380px] gap-4 px-4 pb-8 pt-4 lg:grid-cols-[248px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-xl border border-[var(--p-border)] bg-[var(--p-sidebar)] p-3 shadow-[var(--p-shadow)] backdrop-blur-xl">
          <div className="mb-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-panel)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--p-text-muted)]">Conta</p>
            <p className="mt-1 text-sm font-semibold">Savio Cipriano</p>
            <p className="text-xs text-[var(--p-text-soft)]">Gestor comercial</p>
          </div>

          {groups.map((group) => (
            <div key={group.group} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--p-text-muted)]">{group.group}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeModule.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm ${
                        active
                          ? "border-[var(--p-border-strong)] bg-[var(--p-accent-soft)] text-[var(--p-text)]"
                          : "border-transparent text-[var(--p-text-soft)] hover:border-[var(--p-border)] hover:bg-[var(--p-panel)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4 text-[var(--p-accent)]" />
                        {item.label}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-70" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <Link
            href="/preview/crm"
            className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--p-border)] bg-[var(--p-panel)] px-3 py-2 text-sm font-medium text-[var(--p-text-soft)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-text)]"
          >
            Abrir preview CRM
          </Link>
          <Link
            href="/preview/conceitos"
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-[var(--p-border)] bg-[var(--p-panel)] px-3 py-2 text-sm font-medium text-[var(--p-text-soft)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-text)]"
          >
            Abrir Concept Lab (3 visoes)
          </Link>
        </aside>

        <main className="space-y-4">
          <section className="rounded-xl border border-[var(--p-border)] bg-[var(--p-panel)] p-4 shadow-[var(--p-shadow)] backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--p-text-muted)]">Modulo selecionado</p>
                <h1 className="mt-1 text-2xl font-semibold">{activeModule.label}</h1>
                <p className="mt-1 text-sm text-[var(--p-text-soft)]">{activeModule.objective}</p>
                <p className="mt-1 text-sm text-[var(--p-text-muted)]">{activeModule.subtitle}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--p-border-strong)] bg-[var(--p-accent)] px-3 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                {activeModule.primaryAction}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activeModule.kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-[var(--p-border)] bg-[var(--p-panel)] p-4 shadow-[var(--p-shadow)] backdrop-blur-xl">
                <p className="text-xs uppercase tracking-wide text-[var(--p-text-muted)]">{kpi.label}</p>
                <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
                <p className="mt-1 text-xs text-[var(--p-text-soft)]">{kpi.trend}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--p-border)] bg-[var(--p-panel)] p-4 shadow-[var(--p-shadow)] backdrop-blur-xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--p-border-strong)] bg-[var(--p-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--p-accent)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--p-accent)]" />
                  Padrao de experiencia ALTUM
                </div>
                <div className="space-y-2">
                  {activeModule.highlights.map((highlight) => (
                    <p key={highlight} className="inline-flex items-start gap-2 text-sm text-[var(--p-text-soft)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--p-accent)]" />
                      {highlight}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--p-border)] bg-[var(--p-panel)] shadow-[var(--p-shadow)] backdrop-blur-xl">
                <div className="border-b border-[var(--p-border)] px-4 py-3">
                  <h2 className="text-sm font-semibold">{activeModule.tableTitle}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--p-bg-soft)]/70 text-left text-xs uppercase tracking-wide text-[var(--p-text-muted)]">
                      <tr>
                        {activeModule.tableColumns.map((column) => (
                          <th key={column} className="px-4 py-3">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeModule.tableRows.map((row, rowIndex) => (
                        <tr
                          key={`${activeModule.id}_${rowIndex}`}
                          className="border-t border-[var(--p-border)]/70 hover:bg-[var(--p-accent-soft)]"
                        >
                          {row.map((cell, cellIndex) => (
                            <td key={`${activeModule.id}_${rowIndex}_${cellIndex}`} className="px-4 py-3 text-[var(--p-text-soft)]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              {activeModule.sideCards.map((card) => (
                <div key={card.title} className="rounded-xl border border-[var(--p-border)] bg-[var(--p-panel)] p-4 shadow-[var(--p-shadow)] backdrop-blur-xl">
                  <h3 className="text-sm font-semibold">{card.title}</h3>
                  <div className="mt-2 space-y-1.5">
                    {card.items.map((item) => (
                      <p key={item} className="text-sm text-[var(--p-text-soft)]">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-[var(--p-border)] bg-[var(--p-panel)] p-4 shadow-[var(--p-shadow)] backdrop-blur-xl">
                <h3 className="text-sm font-semibold">Padrao de linguagem</h3>
                <div className="mt-2 space-y-1.5 text-sm text-[var(--p-text-soft)]">
                  <p>Antes: Critical notifications</p>
                  <p className="text-[var(--p-accent)]">Depois: Avisos importantes</p>
                  <p>Antes: Execute qualification workflow</p>
                  <p className="text-[var(--p-accent)]">Depois: Validar dados do lead</p>
                </div>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
