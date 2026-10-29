"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Check,
  MessageCircleMore,
  Sparkles,
  Target,
  Pause,
  Play,
  CalendarDays,
  Bot,
} from "lucide-react";
import { ProductPreview, type ProductView } from "./product-preview";
import { PublicSectionHeading } from "../shared/public-sections";
import styles from "../public-site.module.css";

const views = [
  {
    label: "Visão da operação",
    icon: BarChart3,
    title: "Comece o dia sabendo onde agir.",
    text: "Conversas, oportunidades e próximos passos em uma visão que ajuda sua equipe a encontrar o que precisa de atenção.",
    preview: "dashboard",
    bullets: [
      "Prioridades do atendimento",
      "Oportunidades em andamento",
      "Agenda e acompanhamento",
    ],
    href: "/plataforma",
  },
  {
    label: "Conversas",
    icon: MessageCircleMore,
    title: "Cada conversa já começa com contexto.",
    text: "WhatsApp, Instagram e entradas do site se aproximam do histórico comercial. Responda, acompanhe e passe o atendimento para uma pessoa quando necessário.",
    preview: "conversations",
    bullets: [
      "Histórico junto da conversa",
      "Equipe e IA trabalhando juntas",
      "Continuidade entre os atendimentos",
    ],
    href: "/inbox",
  },
  {
    label: "Clientes e oportunidades",
    icon: Target,
    title: "Uma venda com caminho. E próximo passo.",
    text: "Cliente, etapa, responsável e próxima ação ficam conectados. O time sabe onde a negociação está e o que fazer para avançar.",
    preview: "pipeline",
    bullets: [
      "Pipeline visual",
      "Propostas no contexto da venda",
      "Agenda e follow-up",
    ],
    href: "/crm",
  },
  {
    label: "Perguntar à Altum",
    icon: Sparkles,
    title: "Converse com a operação e saia com uma ação.",
    text: "Pergunte sobre clientes, campanhas, conversas e vendas. Consulte prioridades, métricas e fontes em uma conversa com a Altum.",
    preview: "assistant",
    bullets: [
      "Perguntas prontas para começar",
      "Métricas e dados usados na resposta",
      "Próximos passos da operação",
    ],
    href: "/ia-para-vendas",
  },
  {
    label: "Agenda",
    icon: CalendarDays,
    title: "Cada compromisso com o contexto do cliente.",
    text: "Acompanhe compromissos, confirmações e retornos. A agenda mantém a preparação da conversa e o próximo passo ligados à operação comercial.",
    preview: "agenda",
    bullets: [
      "Compromissos e retornos",
      "Confirmações e pendências",
      "Histórico ligado ao cliente",
    ],
    href: "/plataforma",
  },
  {
    label: "Assistente Altum",
    icon: Bot,
    title: "Conhecimento e regras para a IA atender melhor.",
    text: "Acompanhe a prontidão do assistente, organize ofertas e conhecimento e defina quando a equipe precisa assumir a conversa.",
    preview: "ai-control",
    bullets: [
      "Papel e comportamento",
      "Ofertas e base de conhecimento",
      "Escaladas para a equipe",
    ],
    href: "/ia-para-vendas",
  },
] as const;

export function AltumLiveDemo() {
  const [active, setActive] = useState(0);
  const id = useId();
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const visible = useInView(section, { amount: 0.25 });
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!visible || !playing || reduced) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive((value) => (value + 1) % views.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [active, visible, playing, reduced]);
  const view = views[active];
  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % views.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + views.length - 1) % views.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? views.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setPlaying(false);
    setActive(next);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next]?.focus();
  };
  return (
    <section ref={section} id="produto" className={styles.section}>
      <div className={styles.container}>
        <PublicSectionHeading
          eyebrow="Conheça por dentro"
          title={
            <>
              Tudo o que sua equipe precisa.
              <br />
              No mesmo lugar.
            </>
          }
          description="Menos tempo procurando informações. Mais contexto para atender, vender e acompanhar cada oportunidade."
        />
        <div
          className={styles.tabList}
          role="tablist"
          aria-label="Conhecer a plataforma"
        >
          {views.map((item, index) => (
            <button
              key={item.label}
              id={`${id}-tab-${index}`}
              role="tab"
              type="button"
              aria-selected={active === index}
              aria-controls={`${id}-panel`}
              tabIndex={active === index ? 0 : -1}
              onClick={() => {
                setActive(index);
                setPlaying(false);
              }}
              onFocus={() => setPlaying(false)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {active === index && (
                <motion.span
                  className={styles.tabIndicator}
                  layoutId={`${id}-indicator`}
                  transition={{
                    duration: reduced ? 0 : 0.35,
                    ease: "easeInOut",
                  }}
                />
              )}
              <span className={styles.tabLabel}>{item.label}</span>
              {active === index && playing && !reduced && (
                <span
                  key={`${active}-${visible}`}
                  aria-hidden
                  className={styles.tabProgress}
                  data-paused={!visible}
                />
              )}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${active}`}
          tabIndex={0}
          onFocusCapture={() => setPlaying(false)}
        >
          <motion.div
            key={view.label}
            initial={false}
            animate={{ opacity: [0.4, 1], y: reduced ? 0 : [8, 0] }}
            transition={{ duration: reduced ? 0 : 0.3 }}
            className={styles.demoShowcase}
          >
            <div className={styles.demoHeader}>
              <div>
                <span className={styles.iconBadge}>
                  <view.icon size={22} />
                </span>
                <h3>{view.title}</h3>
                <p>{view.text}</p>
              </div>
              <div>
                <ul className={styles.checkList}>
                  {view.bullets.map((item) => (
                    <li key={item}>
                      <Check size={15} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link className={styles.textLink} href={view.href}>
                  Explorar este recurso <ArrowRight size={17} />
                </Link>
              </div>
            </div>
            <div className={styles.demoWide}>
              <ProductPreview view={view.preview as ProductView} />
            </div>
          </motion.div>
        </div>
        <div className={styles.demoToolbar}>
          <span>Explore a operação, uma visão de cada vez.</span>
          {!reduced && (
            <button
              type="button"
              className={styles.motionToggle}
              aria-label={
                playing
                  ? "Pausar demonstração automática"
                  : "Reproduzir demonstração automática"
              }
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? "Pausar" : "Reproduzir"}
            </button>
          )}
        </div>
        <small className={styles.demoCaption}>
          Visualizações ilustrativas. Recursos e integrações dependem do plano e
          da configuração.
        </small>
      </div>
    </section>
  );
}
