"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  Headphones,
  LayoutGrid,
  List,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  Search,
  Send,
  Settings,
  Package,
  TrendingUp,
  Smile,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "../public-site.module.css";

export type ProductView =
  | "dashboard"
  | "conversations"
  | "pipeline"
  | "agenda"
  | "assistant"
  | "ai-control";
const titles: Record<ProductView, string> = {
  dashboard: "Início",
  conversations: "Conversas",
  pipeline: "Clientes & Oportunidades",
  agenda: "Agenda",
  assistant: "Perguntar à Altum",
  "ai-control": "Assistente Altum",
};
// Public fixtures only. Layouts reference the inspected client UI; no tenant data or APIs.
const people = [
  {
    initials: "MC",
    name: "Marina Costa",
    company: "Studio Aurora",
    stage: "Proposta",
    value: "R$ 4.800",
    message: "Podemos conversar sobre a proposta?",
  },
  {
    initials: "RL",
    name: "Rafael Lima",
    company: "Horizonte Design",
    stage: "Qualificação",
    value: "R$ 3.200",
    message: "Perfeito! Pode confirmar a reunião.",
  },
  {
    initials: "BS",
    name: "Beatriz Santos",
    company: "Casa Verde",
    stage: "Captado",
    value: "R$ 2.600",
    message: "Gostaria de conhecer as opções.",
  },
];
const scenes = [
  "Uma conversa precisa de resposta",
  "A equipe dá continuidade ao atendimento",
  "A oportunidade avança para proposta",
  "O próximo compromisso entra na agenda",
];
const nav: Array<{
  icon: LucideIcon;
  label: string;
  view?: ProductView;
  group?: string;
}> = [
  {
    icon: LayoutGrid,
    label: "Início",
    view: "dashboard",
    group: "Operação diária",
  },
  { icon: MessageSquare, label: "Conversas", view: "conversations" },
  { icon: Users, label: "Clientes & Oportunidades", view: "pipeline" },
  { icon: CalendarDays, label: "Agenda", view: "agenda" },
  { icon: Package, label: "Produtos & Serviços" },
  { icon: TrendingUp, label: "Campanhas", group: "Crescimento" },
  { icon: List, label: "Relatórios" },
  {
    icon: Sparkles,
    label: "Perguntar à Altum",
    view: "assistant",
    group: "Inteligência",
  },
  { icon: Bot, label: "Assistente Altum", view: "ai-control" },
  { icon: Settings, label: "Configurações", group: "Conta" },
];
function Avatar({ initials }: { initials: string }) {
  return <span className={styles.faithfulAvatar}>{initials}</span>;
}
function DemoAction({ children }: { children: React.ReactNode }) {
  return <span className={styles.faithfulAction}>{children}</span>;
}
function Metrics({
  items,
}: {
  items: Array<[string, string, LucideIcon, string]>;
}) {
  return (
    <div className={styles.faithfulMetrics}>
      {items.map(([label, value, Icon, tone]) => (
        <div key={label} data-tone={tone}>
          <span>
            {label}
            <Icon size={17} />
          </span>
          <strong>{value}</strong>
          <small>Dados de demonstração</small>
        </div>
      ))}
    </div>
  );
}

export function ProductPreview({
  view = "dashboard",
  animated = true,
}: {
  view?: ProductView;
  animated?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const visible = useInView(root, { amount: 0.2 });
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [scene, setScene] = useState(0);
  useEffect(() => {
    if (!visible || !playing || !animated || reduced) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setScene((current) => (current + 1) % 4);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [visible, playing, animated, reduced]);
  const stage = scene >= 2 ? "Proposta" : "Qualificação";
  return (
    <div ref={root} className={styles.faithfulDemo}>
      <div
        className={styles.preview}
        data-product-view={view}
        role="img"
        aria-label={`Demonstração ilustrativa: ${titles[view]}, baseada na interface da Altum, com dados fictícios`}
      >
        <div className={styles.faithfulShell}>
          <aside className={styles.faithfulSidebar} aria-hidden="true">
            <div className={styles.faithfulBrand}>
              <span>A</span>
              <div>
                <strong>Altum</strong>
                <small>Operação comercial com IA</small>
              </div>
              <ChevronLeft size={14} />
            </div>
            <div className={styles.faithfulAccount}>
              <div>
                <small>Conta</small>
                <strong>Clínica Aurora Prime</strong>
              </div>
              <i>A</i>
            </div>
            <nav>
              {nav.map(({ icon: Icon, label, view: itemView, group }) => (
                <div key={label}>
                  {group && (
                    <small className={styles.faithfulGroup}>{group}</small>
                  )}
                  <div
                    className={styles.faithfulNavItem}
                    data-active={view === itemView}
                    data-tone={itemView}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </div>
                </div>
              ))}
            </nav>
            <div className={styles.faithfulSupport}>
              <Headphones size={22} />
              <strong>Entrar em contato com a Altum</strong>
              <p>Suporte para ajudar na sua operação.</p>
              <span>Falar no WhatsApp</span>
            </div>
          </aside>
          <div className={styles.faithfulMain}>
            <div className={styles.faithfulTop}>
              <strong>{titles[view]}</strong>
              <span>
                <Search size={14} /> Buscar cliente, conversa, pedido ou
                proposta <kbd>⌘ /</kbd>
              </span>
              <Bell size={15} />
              <Settings size={15} />
              <Avatar initials="DE" />
            </div>
            <div className={styles.faithfulBody}>
              {view === "dashboard" && (
                <>
                  <div className={styles.faithfulOverview}>
                    <div className={styles.faithfulSpotlight}>
                      <span>
                        Visão da empresa{" "}
                        <small>Atualizado agora · exemplo</small>
                      </span>
                      <h3>Clínica Aurora Prime</h3>
                      <p>
                        Resultados dos últimos 30 dias e prioridades atuais da
                        operação.
                      </p>
                      <div className={styles.faithfulHeroNumbers}>
                        {[
                          ["Investido · 30 dias", "R$ 5.950"],
                          ["Recebido · 30 dias", "R$ 9.800"],
                          ["Vendas · 30 dias", "6"],
                          ["Conversas", "44"],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <small>{label}</small>
                            <strong
                              key={value}
                              className={styles.faithfulChanged}
                            >
                              {value}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.faithfulPriority}>
                      <span>
                        Próxima ação <i>agir</i>
                      </span>
                      <h4>
                        {scene === 0
                          ? "Responder conversas pendentes"
                          : scene === 1
                            ? "Dar continuidade à negociação"
                            : scene === 2
                              ? "Acompanhar proposta enviada"
                              : "Preparar o próximo compromisso"}
                      </h4>
                      <p>
                        {scene === 0
                          ? "Marina aguarda retorno sobre a proposta."
                          : scene === 1
                            ? "Confira o contexto e registre o próximo passo."
                            : scene === 2
                              ? "A negociação com Marina está em Proposta."
                              : "Reunião com Marina amanhã, às 14h."}
                      </p>
                      <DemoAction>
                        Resolver agora <ArrowRight size={13} />
                      </DemoAction>
                    </div>
                  </div>
                  <Metrics
                    items={[
                      [
                        "Investido em anúncios · 30 dias",
                        "R$ 5.950",
                        TrendingUp,
                        "blue",
                      ],
                      [
                        "Receita recebida · 30 dias",
                        "R$ 9.800",
                        Target,
                        "green",
                      ],
                      ["Conversas ativas", "44", MessageSquare, "green"],
                      ["IA trabalhando", "0", Bot, "purple"],
                    ]}
                  />
                  <div className={styles.faithfulPanel}>
                    <h4>
                      Decisões prioritárias <span>Atualizar</span>
                    </h4>
                    <div className={styles.faithfulNext}>
                      <Avatar initials="MC" />
                      <div>
                        <strong>
                          {scene < 2
                            ? "Retornar proposta de Marina Costa"
                            : scene === 2
                              ? "Acompanhar oportunidade em Proposta"
                              : "Preparar reunião com Marina Costa"}
                        </strong>
                        <small>{scenes[scene]}</small>
                      </div>
                      <span>
                        Hoje <ArrowRight size={13} />
                      </span>
                    </div>
                  </div>
                  <div className={styles.faithfulSummary}>
                    {[
                      ["Conversas", "Marina Costa", "Aguardando resposta"],
                      ["Oportunidades", "Studio Aurora", stage],
                      [
                        "Agenda",
                        scene === 3
                          ? "Reunião com Marina"
                          : "Retorno comercial",
                        scene === 3 ? "Amanhã · 14:00" : "Hoje · 10:30",
                      ],
                    ].map(([title, name, detail]) => (
                      <div key={title}>
                        <h4>
                          {title}
                          <ArrowRight size={12} />
                        </h4>
                        <strong>{name}</strong>
                        <small>{detail}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {view === "conversations" && (
                <>
                  <div className={styles.faithfulConversationIntro}>
                    <h3>Operação de conversas</h3>
                    <p>
                      Acompanhe canais, responsáveis, prazos e onde a equipe
                      precisa de ajuda.
                    </p>
                  </div>
                  <div className={styles.faithfulInbox}>
                    <div className={styles.faithfulQueue}>
                      <h4>
                        Conversas <MoreHorizontal size={15} />
                      </h4>
                      <small>3 conversas · Minha fila</small>
                      <div className={styles.faithfulSearch}>
                        <Search size={12} /> Buscar conversa
                      </div>
                      <div className={styles.faithfulPills}>
                        <b>Todas</b>
                        <span>Não lidas</span>
                        <span>Minhas</span>
                      </div>
                      {people.map((person, index) => (
                        <div
                          key={person.name}
                          className={styles.faithfulContact}
                          data-selected={index === 0}
                        >
                          <Avatar initials={person.initials} />
                          <div>
                            <strong>{person.name}</strong>
                            <small>{person.message}</small>
                          </div>
                          <small>10:24</small>
                        </div>
                      ))}
                    </div>
                    <div className={styles.faithfulChat}>
                      <header>
                        <Avatar initials="MC" />
                        <div>
                          <strong>Marina Costa</strong>
                          <small>
                            WhatsApp ·{" "}
                            {scene === 0
                              ? "Precisa resposta"
                              : "Em atendimento"}
                          </small>
                        </div>
                        <span>{stage}</span>
                        <MoreHorizontal size={16} />
                      </header>
                      <div className={styles.faithfulCommercialContext}>
                        <div>
                          <small>Origem</small>
                          <strong>LP de avaliação</strong>
                          <span>Formulário</span>
                        </div>
                        <div>
                          <small>Próxima ação</small>
                          <strong>Validar objetivo e melhor horário</strong>
                          <span>Contexto comercial</span>
                        </div>
                        <div>
                          <small>Oferta provável</small>
                          <strong>Acompanhamento completo</strong>
                          <span>Oferta cadastrada</span>
                        </div>
                      </div>
                      <div className={styles.faithfulMessages}>
                        <small>HOJE · CONVERSA FICTÍCIA</small>
                        <p>
                          Olá! Gostei da proposta e queria entender os próximos
                          passos.<time>10:24</time>
                        </p>
                        {scene >= 1 && (
                          <p data-own>
                            Olá, Marina! Podemos conversar amanhã para alinhar
                            os detalhes?
                            <time>
                              10:25 <Check size={10} />
                            </time>
                          </p>
                        )}
                        {scene >= 2 && (
                          <p>
                            Amanhã às 14h funciona para mim!<time>10:26</time>
                          </p>
                        )}
                        {scene === 3 && (
                          <div className={styles.faithfulEvent}>
                            <CalendarDays size={14} /> Próximo passo: reunião
                            amanhã, às 14h.
                          </div>
                        )}
                      </div>
                      <footer>
                        <Smile size={16} />
                        <Paperclip size={15} />
                        <span>Digite uma mensagem</span>
                        <Send size={16} />
                      </footer>
                    </div>
                  </div>
                </>
              )}
              {view === "pipeline" && (
                <>
                  <div className={styles.faithfulWorkspaceHero}>
                    <span>Lista · Operação comercial</span>
                    <h3>Clientes, oportunidades e próxima ação.</h3>
                    <p>
                      Lista, funil e resposta comercial em uma rotina simples
                      para usar no celular.
                    </p>
                    <div className={styles.faithfulAssistantStrip}>
                      <Bot size={16} />
                      <strong>Prioridade comercial</strong> Quem merece atenção
                      agora
                    </div>
                    <div className={styles.faithfulPills}>
                      <b>Lista</b>
                      <span>Funil</span>
                      <span>Propostas</span>
                      <span>Agenda</span>
                    </div>
                  </div>
                  <Metrics
                    items={[
                      ["Clientes na visão atual", "18", Users, "blue"],
                      ["Valor em carteira", "R$ 42.600", Target, "green"],
                      ["Precisam resposta", "3", MessageSquare, "green"],
                      ["Sem responsável", "1", Users, "amber"],
                    ]}
                  />
                  <div className={styles.faithfulCrmGrid}>
                    <div className={styles.faithfulPanel}>
                      <h4>
                        Lista de clientes e oportunidades{" "}
                        <DemoAction>+ Novo cliente</DemoAction>
                      </h4>
                      <div className={styles.faithfulFilters}>
                        <Search size={12} />
                        <span>Todas etapas</span>
                        <span>Temperatura</span>
                        <span>Todos vendedores</span>
                      </div>
                      <div className={styles.faithfulTable}>
                        <div>
                          <span>Contato</span>
                          <span>Etapa</span>
                          <span>Temperatura</span>
                          <span>Valor</span>
                        </div>
                        {people.map((person, index) => (
                          <div key={person.name} data-selected={index === 0}>
                            <span>
                              <strong>{person.name}</strong>
                              <small>{person.company}</small>
                            </span>
                            <span>
                              <b>{index === 0 ? stage : person.stage}</b>
                            </span>
                            <span>{index === 0 ? "Quente" : "Morno"}</span>
                            <span>{person.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.faithfulPanel}>
                      <h4>Detalhes e ações</h4>
                      <Avatar initials="MC" />
                      <h4>Marina Costa</h4>
                      <p>Studio Aurora</p>
                      <div className={styles.faithfulDetail}>
                        <small>Etapa</small>
                        <strong>{stage}</strong>
                        <small>Próxima ação</small>
                        <strong>
                          {scene === 3
                            ? "Reunião amanhã · 14h"
                            : "Retornar proposta"}
                        </strong>
                      </div>
                      <DemoAction>Abrir conversa</DemoAction>
                    </div>
                  </div>
                </>
              )}
              {view === "agenda" && (
                <>
                  <div className={styles.faithfulWorkspaceHero}>
                    <span>Agenda · Operação comercial</span>
                    <h3>Agenda que protege vendas e próximos passos.</h3>
                    <p>
                      Compromissos, confirmações e retornos conectados aos
                      clientes.
                    </p>
                    <div className={styles.faithfulAssistantStrip}>
                      <Bot size={16} />
                      <strong>Preparação comercial</strong> Antes da conversa
                    </div>
                    <div className={styles.faithfulPills}>
                      <span>Lista</span>
                      <span>Funil</span>
                      <span>Propostas</span>
                      <b>Agenda</b>
                    </div>
                  </div>
                  <Metrics
                    items={[
                      ["Hoje", "4", CalendarDays, "blue"],
                      [
                        "Próximos",
                        scene === 3 ? "6" : "5",
                        CalendarDays,
                        "amber",
                      ],
                      ["Concluídos", "12", Check, "green"],
                      ["Atrasados", "1", CalendarDays, "amber"],
                    ]}
                  />
                  <div className={styles.faithfulPanel}>
                    <h4>Comando da agenda</h4>
                    <p>
                      O que precisa acontecer para reuniões e retornos virarem
                      avanço comercial.
                    </p>
                    <div className={styles.faithfulNext}>
                      <CalendarDays size={22} />
                      <div>
                        <small>PRÓXIMO COMPROMISSO</small>
                        <strong>Reunião de apresentação · Rafael Lima</strong>
                        <small>Hoje, 14h · Confirmado</small>
                      </div>
                    </div>
                  </div>
                  <div className={styles.faithfulPanel}>
                    <h4>
                      Compromissos <DemoAction>+ Novo compromisso</DemoAction>
                    </h4>
                    {[
                      "Retorno comercial · Beatriz Santos",
                      "Reunião de apresentação · Rafael Lima",
                      ...(scene === 3
                        ? ["Reunião sobre proposta · Marina Costa"]
                        : []),
                    ].map((title, index) => (
                      <div key={title} className={styles.faithfulAppointment}>
                        <CalendarDays size={18} />
                        <div>
                          <strong>{title}</strong>
                          <small>
                            {index === 2
                              ? "Amanhã · 14h"
                              : "Hoje · " + (index === 0 ? "10h30" : "14h")}
                          </small>
                        </div>
                        <span>{index === 2 ? "Marcado" : "Confirmado"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {view === "assistant" && (
                <>
                  <div
                    className={`${styles.faithfulWorkspaceHero} ${styles.faithfulAiHero}`}
                  >
                    <span>Perguntar à Altum · Tráfego, venda e retenção</span>
                    <h3>Converse com a operação e saia com uma ação.</h3>
                    <p>
                      Entenda prioridades, gargalos, campanhas e oportunidades
                      que merecem atenção agora.
                    </p>
                  </div>
                  <div className={styles.faithfulCommands}>
                    {[
                      ["Abrir o dia", CalendarDays],
                      ["Encontrar dinheiro", Target],
                      ["Ler campanhas", List],
                      ["Recuperar base", Users],
                    ].map(([label, Icon]) => {
                      const CommandIcon = Icon as LucideIcon;
                      return (
                        <div key={String(label)}>
                          <CommandIcon size={18} />
                          <strong>{String(label)}</strong>
                          <small>executar</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.faithfulAskGrid}>
                    <div className={styles.faithfulPanel}>
                      <h4>
                        <Bot size={18} /> Altum{" "}
                        <span>Analista comercial da sua operação</span>
                      </h4>
                      <p>
                        Pergunte sobre tráfego, conversas, clientes, campanhas,
                        agenda e vendas.
                      </p>
                      {scene >= 1 && (
                        <div className={styles.faithfulQuestion}>
                          O que preciso fazer hoje?
                        </div>
                      )}
                      {scene >= 2 && (
                        <div className={styles.faithfulAnswer}>
                          <strong>Comece pelos próximos passos.</strong>
                          <p>
                            Neste cenário fictício, Marina aguarda retorno sobre
                            a proposta e Rafael tem uma reunião hoje às 14h.
                          </p>
                          <small>Clientes · Conversas · Agenda</small>
                        </div>
                      )}
                      <div className={styles.faithfulAskComposer}>
                        Pergunte sobre sua operação <Send size={16} />
                      </div>
                    </div>
                    <div className={styles.faithfulPanel}>
                      <h4>Perguntas prontas</h4>
                      {[
                        "O que preciso fazer hoje?",
                        "Onde estou perdendo vendas?",
                        "Quais conversas precisam de resposta?",
                      ].map((question) => (
                        <p
                          className={styles.faithfulReadyQuestion}
                          key={question}
                        >
                          {question}
                        </p>
                      ))}
                      <h4>Dados usados</h4>
                      <p>Clientes · Conversas · Base e ofertas · Assistente</p>
                    </div>
                  </div>
                </>
              )}
              {view === "ai-control" && (
                <>
                  <div className={styles.faithfulPanel}>
                    <h4>
                      Assistente Altum <span>Assistente ativo</span>
                    </h4>
                    <div className={styles.faithfulSetupSteps}>
                      {[
                        ["Papel", "Vendedor"],
                        ["Comportamento", "Contexto definido"],
                        ["Conhecimento", "14 fontes"],
                        ["Canais e voz", "Voz opcional"],
                        ["Teste", "Validar antes de publicar"],
                      ].map(([title, detail]) => (
                        <div key={title}>
                          <Check size={15} />
                          <span>
                            <strong>{title}</strong>
                            <small>{detail}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.faithfulPanel}>
                    <h4>
                      <Sparkles size={16} /> Decisões preparadas pela IA
                    </h4>
                    <div className={styles.faithfulPills}>
                      <span>0 aguardando</span>
                      <span>0 aprovadas</span>
                      <span>0 recusadas</span>
                    </div>
                    <p>
                      Nenhuma decisão pendente. A operação está sob controle.
                    </p>
                  </div>
                  <div
                    className={`${styles.faithfulWorkspaceHero} ${styles.faithfulAiHero}`}
                  >
                    <span>Assistente comercial</span>
                    <h3>
                      A IA atendendo, qualificando e preparando venda com
                      contexto.
                    </h3>
                    <p>
                      Conhecimento, ofertas e regras para saber quando responder
                      e quando chamar uma pessoa.
                    </p>
                    <div className={styles.faithfulPills}>
                      <b>Ajustar assistente</b>
                      <span>Ajustar áudio</span>
                      <span>Ensinar ofertas</span>
                    </div>
                  </div>
                  <Metrics
                    items={[
                      ["Prontidão", "80%", Check, "purple"],
                      ["Base", "14", List, "blue"],
                      ["Áudio", "Pausado", Pause, "amber"],
                      ["Humano", "Definido", Users, "green"],
                    ]}
                  />
                  <div className={styles.faithfulPanel}>
                    <h4>Cérebro comercial</h4>
                    <p>
                      Campanhas e origem, oferta ensinada, qualificação e humano
                      certo.
                    </p>
                    <div className={styles.faithfulSetupSteps}>
                      {[
                        ["Ofertas", "Produtos, serviços e materiais"],
                        ["Regras", "Limites e perguntas frequentes"],
                        ["Escaladas", "Quando chamar a equipe"],
                      ].map(([title, detail]) => (
                        <div key={title}>
                          <Bot size={15} />
                          <span>
                            <strong>{title}</strong>
                            <small>{detail}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className={styles.faithfulDisclaimer}>
              REPRODUÇÃO DA INTERFACE · DADOS E SEQUÊNCIA FICTÍCIOS
            </div>
          </div>
        </div>
      </div>
      <div className={styles.faithfulMotionBar}>
        <span>
          <i data-playing={playing && animated && !reduced && visible} />
          {scenes[scene]} <small>· exemplo ilustrativo</small>
        </span>
        <button
          type="button"
          onClick={() => setScene((current) => (current + 1) % 4)}
          aria-label="Ver próxima etapa da simulação"
        >
          <ArrowRight size={13} />
          Próxima etapa
        </button>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={
              playing
                ? "Pausar animação da interface"
                : "Reproduzir animação da interface"
            }
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}{" "}
            {playing ? "Pausar" : "Reproduzir"}
          </button>
        )}
      </div>
    </div>
  );
}
