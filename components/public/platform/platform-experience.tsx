"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  MessageCircleMore,
  Smartphone,
  Sparkles,
  Workflow,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type PlatformPlan = {
  name: string;
  price: string;
  period: string;
  description: string;
  bullets: readonly string[];
  featured: boolean;
};

type PlatformFaq = {
  question: string;
  answer: string;
};

const navItems = [
  ["Visão geral", "#visao-geral"],
  ["Produto", "#produto"],
  ["Vídeo", "#video"],
  ["Planos", "#planos"],
  ["FAQ", "#faq"],
] as const;

const platformImages = {
  hero: "/images/platform/marketing/platform-hero-ecosystem.png",
  dashboard: "/images/platform/marketing/platform-dashboard.png",
  conversations: "/images/platform/marketing/platform-conversations.png",
  crm: "/images/platform/marketing/platform-crm-pipeline.png",
  ai: "/images/platform/marketing/platform-ai-assistant.png",
  mobile: "/images/platform/marketing/platform-mobile.png",
} as const;

const heroPoints = [
  "Conversas em uma fila",
  "CRM com contexto",
  "Agenda com continuidade",
  "IA sem camada técnica",
] as const;

const heroStats = [
  {
    value: "3",
    label: "WhatsApps conectados",
    description: "Sem perder contexto entre equipe e canal.",
  },
  {
    value: "46",
    label: "Oportunidades ativas",
    description: "Pipeline visível com etapa, valor e responsável.",
  },
  {
    value: "17",
    label: "Follow-ups hoje",
    description: "Agenda ligada à próxima ação do comercial.",
  },
] as const;

const carouselSlides = [
  {
    title: "Visão geral da operação",
    subtitle: "Leitura rápida do que precisa de ação hoje.",
    image: platformImages.dashboard,
  },
  {
    title: "Conversas com contexto",
    subtitle: "Fila única para WhatsApp, Instagram e leads do site.",
    image: platformImages.conversations,
  },
  {
    title: "CRM que faz a venda andar",
    subtitle: "Oportunidades, proposta, etapa e próxima ação no mesmo fluxo.",
    image: platformImages.crm,
  },
  {
    title: "Assistente Altum",
    subtitle: "IA para priorizar, resumir e orientar a operação.",
    image: platformImages.ai,
  },
] as const;

const productTabs = [
  {
    id: "conversas",
    label: "Conversas",
    icon: MessageCircleMore,
    title: "Toda conversa entra com origem, histórico e próximo passo.",
    description:
      "O time responde melhor porque entende de onde o lead veio, o que já aconteceu e qual ação faz sentido agora.",
    bullets: [
      "Fila única para diferentes canais e números",
      "Histórico sem repetir perguntas",
      "Leitura comercial ao lado do atendimento",
    ],
    image: platformImages.conversations,
    alt: "Tela de conversas da Altum",
  },
  {
    id: "crm",
    label: "CRM",
    icon: Workflow,
    title: "A oportunidade não fica parada em cadastro. Ela ganha direção.",
    description:
      "O pipeline mostra onde está o dinheiro, quem precisa de retorno e quais negociações merecem mais atenção.",
    bullets: [
      "Etapa, valor e responsável em cada oportunidade",
      "Proposta e follow-up conectados à venda",
      "Mais clareza para o time e para o gestor",
    ],
    image: platformImages.crm,
    alt: "Tela de CRM da Altum",
  },
  {
    id: "ia",
    label: "Assistente IA",
    icon: Sparkles,
    title: "A IA não entra para enfeitar o painel. Ela entra para ajudar a vender.",
    description:
      "A assistente encontra risco, conversa quente e próxima melhor ação antes do gargalo virar perda.",
    bullets: [
      "Sugestões de resposta com contexto",
      "Alertas de risco e prioridade",
      "Resumo da operação para decisão mais rápida",
    ],
    image: platformImages.ai,
    alt: "Tela do Assistente Altum",
  },
] as const;

const mobileBullets = [
  "Resumo do dia no celular",
  "Agenda com contexto comercial",
  "Oportunidades e prioridades ao vivo",
  "IA no bolso sem painel técnico",
] as const;

const comparisonRows = [
  {
    old: "Mensagens espalhadas entre equipe, número e canal.",
    now: "Fila unificada com contexto, dono e histórico.",
  },
  {
    old: "CRM preenchido depois, quando sobra tempo.",
    now: "Pipeline ligado ao que acontece na conversa.",
  },
  {
    old: "Follow-up depende de memória ou planilha.",
    now: "Agenda viva com próxima ação e prazo claro.",
  },
  {
    old: "O gestor descobre o gargalo tarde.",
    now: "A operação mostra risco e prioridade em tempo real.",
  },
] as const;

const platformVideoUrl = process.env.NEXT_PUBLIC_ALTUM_PLATFORM_VIDEO_URL ?? "";

export function PlatformExperience({
  plans,
  faqItems,
}: {
  plans: PlatformPlan[];
  faqItems: PlatformFaq[];
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof productTabs)[number]["id"]>("conversas");

  const currentTab = useMemo(
    () => productTabs.find((tab) => tab.id === activeTab) ?? productTabs[0],
    [activeTab]
  );

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.set("[data-hero-line]", { yPercent: 112, opacity: 0 });
      gsap.to("[data-hero-line]", {
        yPercent: 0,
        opacity: 1,
        duration: 0.95,
        stagger: 0.08,
        ease: "expo.out",
        delay: 0.12,
      });

      gsap.from("[data-hero-fade]", {
        opacity: 0,
        y: 20,
        duration: 0.7,
        ease: "power2.out",
        stagger: 0.06,
        delay: 0.22,
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element, index) => {
        gsap.from(element, {
          opacity: 0,
          y: 30,
          duration: 0.75,
          ease: "power2.out",
          delay: index * 0.02,
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
          },
        });
      });
    }, rootRef);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <div ref={rootRef} className="overflow-x-hidden bg-[#f7f5ef] text-[#11131a]">
      <PlatformStyles />

      <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4 lg:px-6">
        <div className="mx-auto flex h-[70px] max-w-7xl items-center justify-between rounded-[28px] border border-black/[0.08] bg-white/88 px-4 shadow-[0_18px_60px_rgba(15,18,28,0.08)] backdrop-blur-2xl lg:px-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-[#11131a] text-lg font-black text-[#ff6a00]">
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(255,106,0,0.96),transparent_34%)]" />
              <span className="relative">A</span>
            </span>
            <span className="leading-tight">
              <span className="block altum-display text-sm font-black tracking-[0.22em]">ALTUM</span>
              <span className="hidden text-xs font-medium text-black/45 sm:block">
                Plataforma comercial com IA
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-black/56 transition hover:bg-black/[0.04] hover:text-black"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="#planos"
              className="hidden rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-black/72 transition hover:border-black/20 md:inline-flex"
            >
              Ver planos
            </Link>
            <Link
              href="/diagnostico?entry=platform_header"
              className="inline-flex items-center gap-2 rounded-full bg-[#11131a] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-black sm:px-5 sm:text-sm"
            >
              Fazer o quiz
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section id="visao-geral" className="relative overflow-hidden px-4 pb-14 pt-28 lg:px-6 lg:pb-20 lg:pt-36 xl:pt-40">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(245,118,15,0.10),transparent_28%),radial-gradient(circle_at_85%_15%,rgba(17,19,26,0.06),transparent_26%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(17,19,26,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,19,26,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
            <div className="max-w-[41rem] xl:max-w-[39rem]">
              <div
                className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]"
                data-hero-fade
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
                Altum Plataforma
              </div>

              <h1 className="altum-display mt-6 max-w-[11ch] text-[clamp(2.9rem,7.2vw,5.9rem)] font-[700] leading-[0.92] tracking-[-0.07em] text-[#11131a] md:max-w-[12ch] xl:mt-7 xl:max-w-[9.2ch] xl:text-[clamp(4.6rem,6.4vw,6.3rem)]">
                <span className="block overflow-hidden">
                  <span data-hero-line className="block">
                    A central da sua
                  </span>
                </span>
                <span className="block overflow-hidden">
                  <span data-hero-line className="block">
                    operação comercial.
                  </span>
                </span>
                <span className="block overflow-hidden">
                  <span data-hero-line className="block text-[#ff6a00]">
                    Tudo conectado.
                  </span>
                </span>
              </h1>

              <p
                className="mt-5 max-w-[36rem] text-base leading-7 text-black/64 md:text-[1.06rem] md:leading-8 xl:mt-6 xl:max-w-[38rem] xl:text-[1.16rem]"
                data-hero-fade
              >
                WhatsApp, CRM, agenda, campanhas, relatórios e IA em um fluxo mais
                claro para responder, vender e acompanhar sem perder contexto.
              </p>

              <div className="mt-7 grid gap-3 md:mt-8 md:grid-cols-2" data-hero-fade>
                {heroPoints.map((point) => (
                  <div
                    key={point}
                    className="rounded-[1.15rem] border border-black/[0.08] bg-white/78 px-4 py-3 text-sm font-semibold text-black/62 shadow-[0_10px_24px_rgba(15,18,28,0.04)]"
                  >
                    {point}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-col gap-3 md:mt-8 md:flex-row" data-hero-fade>
                <Link
                  href="/diagnostico?entry=platform_hero"
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-[#11131a] px-6 py-4 text-sm font-black text-white transition hover:bg-black md:px-7"
                >
                  Fazer o quiz estratégico
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="#video"
                  className="inline-flex items-center justify-center gap-3 rounded-full border border-black/10 bg-white px-6 py-4 text-sm font-black text-[#11131a] transition hover:border-black/20 md:px-7"
                >
                  <CirclePlay className="h-4 w-4" />
                  Ver por dentro
                </Link>
              </div>
            </div>

            <div className="space-y-4" data-hero-fade>
              <div className="overflow-hidden rounded-[2rem] border border-black/[0.08] bg-white p-3 shadow-[0_28px_80px_rgba(15,18,28,0.08)]">
                <Image
                  src={platformImages.hero}
                  alt="Visão da plataforma Altum"
                  width={1600}
                  height={1080}
                  priority
                  className="rounded-[1.4rem]"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {heroStats.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.35rem] border border-black/[0.08] bg-white p-4 shadow-[0_12px_30px_rgba(15,18,28,0.04)]"
                  >
                    <div className="altum-display text-3xl font-[700] tracking-[-0.06em] text-[#11131a]">
                      {item.value}
                    </div>
                    <div className="mt-2 text-sm font-black text-[#11131a]">{item.label}</div>
                    <p className="mt-1 text-sm leading-6 text-black/56">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative left-1/2 w-screen -translate-x-1/2 py-6" data-reveal>
        <div className="overflow-hidden">
          <div className="platform-carousel-track">
            {[...carouselSlides, ...carouselSlides].map((slide, index) => (
              <article
                key={`${slide.title}-${index}`}
                className="platform-carousel-card mx-3 w-[21rem] flex-none rounded-[1.7rem] border border-black/[0.08] bg-white p-3 shadow-[0_18px_50px_rgba(15,18,28,0.06)] md:w-[25rem] lg:w-[31rem]"
              >
                <div className="overflow-hidden rounded-[1.2rem] border border-black/[0.06]">
                  <Image
                    src={slide.image}
                    alt={slide.title}
                    width={1600}
                    height={1080}
                    className="h-auto w-full"
                  />
                </div>
                <div className="px-2 pb-2 pt-4">
                  <div className="text-base font-black text-[#11131a]">{slide.title}</div>
                  <p className="mt-1 text-sm leading-6 text-black/58">{slide.subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="produto" className="px-4 py-20 lg:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl" data-reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
              Produto em ação
            </div>
            <h2 className="altum-display mt-6 max-w-[13ch] text-[clamp(2.5rem,5vw,4.5rem)] font-[700] leading-[0.94] tracking-[-0.06em] text-[#11131a]">
              Menos tela para explicar. Mais tela para mostrar.
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-black/62 md:text-lg md:leading-8">
              A plataforma precisa comunicar valor rápido. Por isso, aqui a leitura é
              simples: conversas, CRM e IA como três partes do mesmo fluxo.
            </p>
          </div>

          <div className="mt-10 grid gap-8 xl:grid-cols-[0.72fr_1.28fr]" data-reveal>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible">
              {productTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-w-[12rem] items-center gap-3 rounded-[1.3rem] border px-4 py-4 text-left transition lg:w-full ${
                    activeTab === tab.id
                      ? "border-[#11131a] bg-[#11131a] text-white"
                      : "border-black/[0.08] bg-white text-black/60 hover:border-black/16"
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="text-sm font-black">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-black/[0.08] bg-white p-4 shadow-[0_24px_80px_rgba(15,18,28,0.08)]">
              <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr] xl:items-center">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
                    {currentTab.label}
                  </div>
                  <h3 className="altum-display mt-4 max-w-[12ch] text-[clamp(2rem,4vw,3.3rem)] font-[700] leading-[0.96] tracking-[-0.06em] text-[#11131a]">
                    {currentTab.title}
                  </h3>
                  <p className="mt-4 text-base leading-8 text-black/62">{currentTab.description}</p>

                  <div className="mt-6 space-y-3">
                    {currentTab.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="flex items-start gap-3 rounded-[1.1rem] border border-black/[0.08] bg-[#faf8f2] px-4 py-3 text-sm leading-6 text-black/62"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#ff6a00]" />
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.6rem] border border-black/[0.06] bg-[#faf8f2] p-3">
                  <Image
                    key={currentTab.id}
                    src={currentTab.image}
                    alt={currentTab.alt}
                    width={1600}
                    height={1080}
                    className="rounded-[1.2rem]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="video" className="px-4 py-20 lg:px-6">
        <div className="mx-auto max-w-5xl text-center" data-reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
            Ferramenta por dentro
          </div>
          <h2 className="altum-display mt-6 text-[clamp(2.4rem,4.8vw,4rem)] font-[700] leading-[0.96] tracking-[-0.06em] text-[#11131a]">
            Veja a plataforma em uso, no centro da operação.
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-black/62 md:text-lg md:leading-8">
            Essa área foi pensada para o vídeo principal da plataforma no YouTube.
            Quando o vídeo oficial estiver publicado, ele entra aqui sem pesar na página.
          </p>

          <div className="mt-10 overflow-hidden rounded-[2rem] border border-black/[0.08] bg-white p-3 shadow-[0_24px_80px_rgba(15,18,28,0.08)]">
            {getYoutubeEmbedUrl(platformVideoUrl) ? (
              <div className="aspect-video overflow-hidden rounded-[1.4rem] bg-black">
                <iframe
                  className="h-full w-full"
                  src={getYoutubeEmbedUrl(platformVideoUrl) ?? undefined}
                  title="Vídeo da plataforma Altum"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="relative aspect-video overflow-hidden rounded-[1.4rem] border border-black/[0.06] bg-[#faf8f2]">
                <Image
                  src={platformImages.dashboard}
                  alt="Prévia da plataforma Altum"
                  width={1600}
                  height={1080}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,19,26,0.10),rgba(17,19,26,0.38))]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="inline-flex items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-black text-[#11131a] shadow-[0_18px_40px_rgba(15,18,28,0.16)]">
                    <CirclePlay className="h-5 w-5 text-[#ff6a00]" />
                    Pronto para receber o vídeo oficial
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 lg:px-6">
        <div className="mx-auto max-w-6xl" data-reveal>
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
              Antes e depois
            </div>
            <h2 className="altum-display mt-6 max-w-[13ch] text-[clamp(2.3rem,4.4vw,3.7rem)] font-[700] leading-[0.96] tracking-[-0.06em] text-[#11131a]">
              A diferença aparece quando a operação deixa de depender do improviso.
            </h2>
          </div>

          <div className="mt-10 overflow-hidden rounded-[2rem] border border-black/[0.08] bg-white shadow-[0_18px_60px_rgba(15,18,28,0.06)]">
            <div className="grid border-b border-black/[0.06] bg-[#faf8f2] px-5 py-4 text-sm font-black uppercase tracking-[0.18em] md:grid-cols-[1fr_1fr]">
              <div className="text-black/42">Operação antiga</div>
              <div className="mt-2 text-[#ff6a00] md:mt-0">Operação com Altum Plataforma</div>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {comparisonRows.map((row) => (
                <div key={row.old} className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_1fr]">
                  <div className="text-sm leading-7 text-black/54">{row.old}</div>
                  <div className="text-sm font-semibold leading-7 text-[#11131a]">{row.now}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 lg:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
          <div data-reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
              Mobile de verdade
            </div>
            <h2 className="altum-display mt-6 max-w-[12ch] text-[clamp(2.3rem,4.4vw,3.8rem)] font-[700] leading-[0.96] tracking-[-0.06em] text-[#11131a]">
              O gestor e o time acompanham a operação sem depender do desktop.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-black/62 md:text-lg md:leading-8">
              A leitura no celular foi pensada para ser direta: prioridades, agenda,
              oportunidades e IA no mesmo ritmo da rotina comercial.
            </p>

            <div className="mt-7 space-y-3">
              {mobileBullets.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[1.1rem] border border-black/[0.08] bg-white px-4 py-3 text-sm leading-6 text-black/62 shadow-[0_10px_24px_rgba(15,18,28,0.04)]"
                >
                  <Smartphone className="mt-0.5 h-4 w-4 flex-none text-[#ff6a00]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-[30rem]" data-reveal>
            <div className="rounded-[2rem] border border-black/[0.08] bg-white p-3 shadow-[0_22px_70px_rgba(15,18,28,0.08)]">
              <Image
                src={platformImages.mobile}
                alt="Aplicativo da Altum no celular"
                width={900}
                height={1600}
                className="mx-auto w-full max-w-[20rem] rounded-[1.5rem]"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="px-4 py-20 lg:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl" data-reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
              Planos da plataforma
            </div>
            <h2 className="altum-display mt-6 max-w-[13ch] text-[clamp(2.4rem,4.6vw,4rem)] font-[700] leading-[0.96] tracking-[-0.06em] text-[#11131a]">
              Estrutura recorrente para empresas que querem operar com mais clareza.
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-black/62 md:text-lg md:leading-8">
              Os planos entram para organizar o uso da plataforma. O quiz mostra se
              faz sentido entrar sozinho ou com implantação assistida.
            </p>
          </div>

          <div className="mt-10 grid gap-4 xl:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-[2rem] border p-6 shadow-[0_18px_50px_rgba(15,18,28,0.05)] ${
                  plan.featured
                    ? "border-[#ff6a00]/25 bg-[#11131a] text-white"
                    : "border-black/[0.08] bg-white text-[#11131a]"
                }`}
                data-reveal
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black uppercase tracking-[0.18em] opacity-70">
                    {plan.name}
                  </div>
                  {plan.featured && (
                    <span className="rounded-full bg-[#ff6a00] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                      recomendado
                    </span>
                  )}
                </div>

                <div className="altum-display mt-6 text-5xl font-[700] tracking-[-0.07em]">
                  {plan.price}
                  <span className="ml-1 text-xl font-semibold opacity-60">{plan.period}</span>
                </div>

                <p
                  className={`mt-5 text-sm leading-7 ${
                    plan.featured ? "text-white/72" : "text-black/62"
                  }`}
                >
                  {plan.description}
                </p>

                <div className="mt-6 space-y-3">
                  {plan.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-3 text-sm leading-6">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 flex-none ${
                          plan.featured ? "text-[#ff9a4d]" : "text-[#ff6a00]"
                        }`}
                      />
                      <span className={plan.featured ? "text-white/82" : "text-black/68"}>
                        {bullet}
                      </span>
                    </div>
                  ))}
                </div>

                <Link
                  href={`/diagnostico?entry=platform_plan_${slugify(plan.name)}`}
                  className={`mt-8 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black transition ${
                    plan.featured
                      ? "bg-white text-[#11131a] hover:bg-[#fff3ea]"
                      : "bg-[#11131a] text-white hover:bg-black"
                  }`}
                >
                  Avançar por este caminho
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="px-4 py-20 lg:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl" data-reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/15 bg-[#fff3ea] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6a00]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
              FAQ
            </div>
            <h2 className="altum-display mt-6 max-w-[10ch] text-[clamp(2.2rem,4.2vw,3.6rem)] font-[700] leading-[0.96] tracking-[-0.06em] text-[#11131a]">
              Perguntas que aparecem antes da decisão.
            </h2>
          </div>

          <div className="mt-10 space-y-4">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="group rounded-[1.6rem] border border-black/[0.08] bg-white p-5 shadow-[0_10px_26px_rgba(15,18,28,0.04)]"
                data-reveal
              >
                <summary className="flex list-none items-center justify-between gap-4 text-left">
                  <span className="text-lg font-black text-[#11131a]">{item.question}</span>
                  <ChevronRight className="h-5 w-5 text-black/42 transition group-open:rotate-90" />
                </summary>
                <p className="mt-4 max-w-3xl text-base leading-8 text-black/62">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 lg:px-6">
        <div
          className="mx-auto max-w-7xl overflow-hidden rounded-[2.4rem] border border-black/[0.08] bg-[#11131a] px-6 py-10 text-white shadow-[0_28px_80px_rgba(15,18,28,0.14)] lg:px-10 lg:py-12"
          data-reveal
        >
          <div className="grid gap-10 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff9a4d]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
                Próxima etapa
              </div>
              <h2 className="altum-display mt-6 max-w-[11ch] text-[clamp(2.4rem,4.8vw,4.1rem)] font-[700] leading-[0.96] tracking-[-0.06em]">
                Se a sua operação cresceu, ela não pode continuar solta.
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-white/68 md:text-lg md:leading-8">
                A Altum Plataforma existe para transformar atendimento, comercial e leitura
                operacional em um fluxo mais conectado, leve e claro.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
              <Link
                href="/diagnostico?entry=platform_final_cta"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#ff6a00] px-7 py-4 text-sm font-black text-white transition hover:bg-[#ff7d1f]"
              >
                Fazer o quiz estratégico
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/precos"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/5 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10"
              >
                Ver planos da plataforma
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PlatformStyles() {
  return (
    <style jsx global>{`
      .altum-display {
        font-family: var(--font-altum-display), var(--font-altum-body), sans-serif;
      }

      @keyframes platformCarousel {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(-50%);
        }
      }

      .platform-carousel-track {
        display: inline-flex;
        min-width: max-content;
        animation: platformCarousel 36s linear infinite;
      }

      .platform-carousel-track:hover {
        animation-play-state: paused;
      }

      @media (max-width: 767px) {
        .platform-carousel-track {
          animation: none;
          overflow-x: auto;
          padding-inline: 1rem;
          width: 100%;
          scroll-snap-type: x mandatory;
        }

        .platform-carousel-card {
          scroll-snap-align: start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .platform-carousel-track {
          animation: none !important;
        }
      }
    `}</style>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getYoutubeEmbedUrl(value: string) {
  if (!value) return null;

  if (value.includes("/embed/")) return value;

  const watchMatch = value.match(/[?&]v=([^&]+)/);
  if (watchMatch?.[1]) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }

  const shortMatch = value.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }

  return null;
}
