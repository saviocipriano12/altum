"use client";

import React from "react";
import Image from "next/image";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { ArrowRight } from "lucide-react";

/* ============================== Tipos & Dados ============================== */

type CaseItem = {
  title: string;
  subtitle: string;
  image: string;
  url: string;
  kpi: string;
  tags: string[];
  bullets: string[];
};

const cases: CaseItem[] = [
  {
    title: "Pedraum — Marketplace B2B de Britagem",
    subtitle: "Conectando mineração e tecnologia.",
    image: "/cases/pedraum-1600.jpg",
    url: "https://pedraum.com.br",
    kpi: "+34% ofertas aceitas",
    tags: ["Next.js", "Firebase", "UX Premium", "CRO"],
    bullets: [
      "Aumento de conversão e velocidade de resposta.",
      "Integrações WhatsApp/CRM em tempo real.",
      "Resultados sólidos em 30–60 dias de otimização.",
    ],
  },
  {
    title: "Clube Farm — E-commerce Coleção Fazenda",
    subtitle: "Estilo, autenticidade e performance.",
    image: "/cases/clubefarm-1600.jpg",
    url: "https://clubefarm.com.br",
    kpi: "ROAS 6x sem queda",
    tags: ["Shopify", "LP de Lançamento", "Analytics", "WhatsApp"],
    bullets: [
      "LP otimizada com storytelling visual e identidade forte.",
      "Conexão entre loja e WhatsApp transacional.",
      "Escala estável e aumento contínuo de ROAS.",
    ],
  },
  {
    title: "Vitta Prime — LP de Alta Conversão",
    subtitle: "Saúde e bem-estar com copy estratégica e design leve.",
    image: "/cases/vittaprime-1600.jpg",
    url: "/cases/vitta",
    kpi: "+82% leads qualificados",
    tags: ["Landing Page", "Copywriting", "Conversão", "Figma"],
    bullets: [
      "LP criada para capturar leads com gatilhos e design emocional.",
      "Testes A/B otimizados para performance e retenção.",
      "Arquitetura visual voltada para saúde e bem-estar.",
    ],
  },
  {
    title: "AJ Painting and Cleaning — Serviços Residenciais nos EUA",
    subtitle: "Pintura, limpeza e renovação com padrão profissional americano.",
    image: "/cases/ajpainting-1600.jpg",
    url: "https://ajpaintingandcleaning.com",
    kpi: "+120% aumento em solicitações de orçamento",
    tags: ["WordPress", "SEO Local", "Identidade Visual", "Conversão"],
    bullets: [
      "Site bilíngue otimizado para captação de leads nos EUA.",
      "Estratégia de SEO local com foco em Manchester, NH.",
      "Design premium com seções de serviços, depoimentos e galeria real.",
    ],
  },
];

/* ============================== Componente raiz ============================== */

export default function CasesShowcaseCinematic() {
  return (
    <section id="cases" className="relative overflow-hidden bg-[#0B1220] py-24 text-white">
      {/* partículas / luz de fundo */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(201,164,92,.12)_0%,transparent_60%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,.05)_0%,transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Cases Reais</h2>
          <p className="mt-2 text-lg text-white/70">Projetos que unem estética, performance e escala.</p>
        </div>

        <CasesCinematicCarousel items={cases} />
      </div>
    </section>
  );
}

/* ===================== Carrossel Cinemático (premium) ===================== */

function CasesCinematicCarousel({ items }: { items: CaseItem[] }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const [hover, setHover] = React.useState(false);

  const GAP = 24; // gap-6
  const STEP = 1;

  // autoplay com pausa no hover e fora de viewport
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let t: ReturnType<typeof setInterval> | undefined;
    const total = items.length;

    const start = () => {
      clearInterval(t);
      t = setInterval(() => {
        if (!hover) setIndex((i) => (i + STEP) % total);
      }, 4200);
    };

    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? start() : clearInterval(t)),
      { threshold: 0.25 }
    );

    io.observe(el);
    start();

    return () => {
      clearInterval(t);
      io.disconnect();
    };
  }, [hover, items.length]);

  // scroll suave ao mudar índice
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const cardW = card ? card.offsetWidth : 560;
    el.scrollTo({ left: (cardW + GAP) * index, behavior: "smooth" });
  }, [index]);

  const prev = () => setIndex((i) => (i - STEP + items.length) % items.length);
  const next = () => setIndex((i) => (i + STEP) % items.length);

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {/* setas */}
      <button
        aria-label="Anterior"
        onClick={prev}
        className="absolute -left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/15 bg-white/10 p-2 backdrop-blur hover:bg-white/20 md:inline-flex"
      >
        ‹
      </button>
      <button
        aria-label="Próximo"
        onClick={next}
        className="absolute -right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/15 bg-white/10 p-2 backdrop-blur hover:bg-white/20 md:inline-flex"
      >
        ›
      </button>

      {/* gradientes laterais */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0B1220] to-transparent md:block" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0B1220] to-transparent md:block" />

      {/* faixa rolável */}
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ scrollBehavior: "smooth" }}
      >
        <style>{`.snap-mandatory::-webkit-scrollbar{display:none}`}</style>

        {items.map((item, i) => (
          <div key={i} className="snap-start" style={{ flex: "0 0 auto" }}>
            {/* 1 card no mobile; 2 no desktop; largura elegante no lg */}
            <div
              data-card
              className="w-[92vw] min-w-[92vw] md:w-[calc((100vw-5rem)/2)] md:min-w-[calc((100vw-5rem)/2)] lg:w-[560px] lg:min-w-[560px]"
            >
              <CaseCard item={item} index={i} />
            </div>
          </div>
        ))}
      </div>

      {/* dots */}
      <div className="mt-5 flex justify-center gap-2">
        {items.map((_, i) => {
          const active = i === index % items.length;
          return (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Ir para slide ${i + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                active ? "w-7 bg-[color:var(--gold)]" : "w-2.5 bg-white/25 hover:bg-white/40"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ============================== Card Cinemático ============================== */

function CaseCard({ item }: { item: CaseItem; index: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // tilt sutil
  const rotateX = useSpring(useTransform(y, [-100, 100, 0], [8, -8, 0]), { damping: 15 });
  const rotateY = useSpring(useTransform(x, [-100, 100, 0], [-10, 10, 0]), { damping: 15 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - (rect.left + rect.width / 2);
    const offsetY = e.clientY - (rect.top + rect.height / 2);
    x.set(offsetX);
    y.set(offsetY);
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.article
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className="
        group relative overflow-hidden rounded-[32px]
        bg-[#10182A]/60 backdrop-blur-md
        shadow-[0_12px_40px_rgba(0,0,0,0.4)]
        transition-transform duration-500 hover:-translate-y-1
      "
    >
      {/* background: imagem + overlays */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={item.image}
          alt={item.title}
          fill
          sizes="(max-width: 768px) 92vw, 560px"
          className="object-cover opacity-70 transition-all duration-700 group-hover:opacity-90"
          priority={false}
        />
        {/* overlay escuro aprimorado */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220]/98 via-[#0B1220]/85 to-[#0B1220]/40" />
        {/* reflexo diagonal dourado sutil */}
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(201,164,92,.25)_0%,transparent_40%,transparent_60%,rgba(201,164,92,.15)_100%)] mix-blend-overlay animate-[shine_6s_linear_infinite]" />
      </div>

      {/* conteúdo */}
      <div className="relative z-10 p-8 lg:p-10">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-sm text-white/80 backdrop-blur-sm">
            {item.kpi}
          </span>
        </div>

        <h3 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{item.title}</h3>
        <p className="mt-1 text-white/70">{item.subtitle}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/80"
            >
              {t}
            </span>
          ))}
        </div>

        <ul className="mt-6 space-y-2 text-sm text-white/85">
          {item.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[color:var(--gold)]">•</span> {b}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--gold)] px-5 py-2 text-sm font-semibold text-[#0B1220] transition hover:brightness-110"
          >
            Visitar site <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#contato"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2 text-sm text-white hover:bg-white/10 transition"
          >
            Quero um projeto assim
          </a>
        </div>
      </div>

      {/* reflexo animado em primeiro plano */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
        <motion.div
          className="absolute -top-1/2 left-[-60%] h-[200%] w-[200%] rotate-45 bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.2)] to-transparent opacity-10"
          animate={{ x: ["-40%", "120%"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <style>{`
        @keyframes shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @media (prefers-reduced-motion: reduce) {
          article[style] { transform: none !important; }
        }
      `}</style>
    </motion.article>
  );
}
