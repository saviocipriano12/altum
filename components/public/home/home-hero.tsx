import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
} from "lucide-react";

import { AnimatedSection } from "@/components/public/shared/animated-section";
import { heroSupportItems } from "@/lib/public-site/home-content";

const ecosystem = [
  "Sites",
  "Tráfego pago",
  "WhatsApp",
  "CRM",
  "Automações",
  "Inteligência artificial",
  "Plataforma própria",
];

export function HomeHero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-[#090909] text-white">
      {/* Ruído visual */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 opacity-[0.035] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='.8'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Faixa lateral */}
      <div className="absolute bottom-0 left-0 top-0 z-20 hidden w-[72px] border-r border-white/10 bg-[#090909] lg:flex lg:flex-col lg:items-center lg:justify-between lg:py-8">
        <span className="altum-display text-sm font-semibold tracking-[-0.03em]">
          A.
        </span>

        <div className="flex -rotate-90 items-center gap-4 whitespace-nowrap">
          <span className="text-[9px] font-semibold uppercase tracking-[0.32em] text-white/35">
            Estrutura digital
          </span>
          <span className="h-px w-10 bg-[#f56e0f]" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.32em] text-white/35">
            Crescimento
          </span>
        </div>

        <a
          href="#como-funciona"
          aria-label="Ir para a próxima seção"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/55 transition hover:border-[#f56e0f] hover:text-[#f56e0f]"
        >
          <ArrowDown className="h-4 w-4" />
        </a>
      </div>

      <div className="relative min-h-[100svh] lg:pl-[72px]">
        {/* Bloco laranja principal */}
        <div className="absolute right-0 top-0 h-[46%] w-[68%] bg-[#f56e0f] sm:h-[48%] lg:h-full lg:w-[37%]" />

        {/* Palavra gigante de fundo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-3vw] left-[2vw] z-0 select-none overflow-hidden"
        >
          <span className="altum-display block text-[clamp(8rem,23vw,25rem)] font-semibold leading-none tracking-[-0.11em] text-white/[0.025]">
            ALTUM
          </span>
        </div>

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1600px] flex-col px-5 pb-8 pt-28 sm:px-8 sm:pt-32 lg:px-12 lg:pb-10 lg:pt-24 xl:px-16">
          {/* Cabeçalho interno */}
          <AnimatedSection>
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-3">
                <Asterisk className="h-4 w-4 text-[#f56e0f]" />
                <span className="max-w-[260px] text-[10px] font-semibold uppercase leading-5 tracking-[0.26em] text-white/45">
                  Estrutura digital e comercial para empresas em crescimento
                </span>
              </div>

              <div className="hidden text-right lg:block">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.25em] text-black/45">
                  Altum Digital
                </span>
                <span className="mt-1 block text-[9px] uppercase tracking-[0.25em] text-black/35">
                  Marketing · vendas · operação
                </span>
              </div>
            </div>
          </AnimatedSection>

          {/* Título */}
          <AnimatedSection
            delay={0.08}
            className="relative mt-16 sm:mt-20 lg:mt-auto lg:pb-12"
          >
            <div className="relative max-w-[1320px]">
              <h1 className="altum-display text-[clamp(3.5rem,8.3vw,9rem)] font-medium leading-[0.82] tracking-[-0.085em]">
                <span className="block max-w-[9.8ch]">
                  Sua empresa não precisa de mais peças soltas.
                </span>

                <span className="mt-[0.14em] block max-w-[11.5ch] lg:ml-[18%]">
                  Precisa de uma estrutura digital
                </span>

                <span className="mt-[0.14em] block max-w-[12ch] text-[#f56e0f] lg:ml-[31%] lg:text-white">
                  que atraia, organize e venda melhor.
                </span>
              </h1>

              {/* Marcador editorial */}
              <div className="absolute -left-1 top-[8%] hidden h-20 w-px bg-[#f56e0f] sm:block" />
            </div>
          </AnimatedSection>

          {/* Rodapé do Hero */}
          <div className="mt-14 grid gap-10 border-t border-white/12 pt-7 lg:mt-0 lg:grid-cols-[1.05fr_0.8fr_0.75fr] lg:items-end lg:gap-12">
            <AnimatedSection delay={0.14}>
              <p className="max-w-[62ch] text-base leading-7 text-white/55 sm:text-lg sm:leading-8">
                A Altum conecta sites, tráfego pago, WhatsApp, CRM, automações,
                IA e plataforma própria para transformar marketing, vendas e
                operação digital em uma estrutura integrada de crescimento.
              </p>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              <div className="flex flex-col gap-3">
                <Link
                  href="/diagnostico?entry=home_hero"
                  className="group flex min-h-[62px] items-center justify-between bg-white px-5 text-sm font-semibold text-black transition duration-300 hover:bg-[#f56e0f] hover:text-white"
                >
                  Fazer diagnóstico gratuito

                  <span className="flex h-10 w-10 items-center justify-center border border-black/15 transition duration-300 group-hover:rotate-45 group-hover:border-white/30">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="#como-funciona"
                  className="group flex min-h-[58px] items-center justify-between border border-white/15 px-5 text-sm font-semibold text-white/75 transition duration-300 hover:border-white/35 hover:text-white"
                >
                  Entender como funciona
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.26}>
              <div className="lg:text-right">
                <p className="text-sm leading-6 text-white/35">
                  Em poucos minutos, entendemos seu cenário e indicamos onde sua
                  empresa pode estar perdendo oportunidades no digital.
                </p>

                <div className="mt-6 flex items-center gap-3 lg:justify-end">
                  <span className="h-2 w-2 bg-[#f56e0f]" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35">
                    Diagnóstico sem compromisso
                  </span>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </div>

      {/* Faixa de ecossistema */}
      <div className="relative z-20 overflow-hidden border-y border-white/10 bg-[#0e0e0e] py-4 lg:ml-[72px]">
        <div className="flex min-w-max animate-[altumMarquee_24s_linear_infinite] items-center">
          {[...ecosystem, ...ecosystem].map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="flex items-center gap-8 px-5 sm:px-8"
            >
              <span className="altum-display text-sm font-medium uppercase tracking-[0.12em] text-white/45">
                {item}
              </span>
              <Asterisk className="h-3 w-3 text-[#f56e0f]" />
            </div>
          ))}
        </div>
      </div>

      {/* Manifestos em vez de cards */}
      <div className="relative z-20 bg-[#f1eee8] text-[#111] lg:ml-[72px]">
        <div className="mx-auto max-w-[1600px]">
          {heroSupportItems.map((item, index) => (
            <AnimatedSection key={item.title} delay={index * 0.06}>
              <div className="group grid min-h-[180px] border-b border-black/12 px-5 py-8 transition duration-500 hover:bg-[#f56e0f] sm:px-8 lg:grid-cols-[120px_0.8fr_1fr_80px] lg:items-center lg:px-12 xl:px-16">
                <span className="text-xs font-semibold tracking-[0.22em] text-black/35 transition group-hover:text-black/55">
                  0{index + 1}
                </span>

                <h2 className="altum-display mt-5 text-[clamp(2rem,4vw,4.8rem)] font-medium leading-none tracking-[-0.065em] lg:mt-0">
                  {item.title}
                </h2>

                <p className="mt-5 max-w-[48ch] text-sm leading-6 text-black/55 transition group-hover:text-black/70 lg:mt-0 lg:px-10">
                  {item.description}
                </p>

                <div className="mt-7 flex justify-start lg:mt-0 lg:justify-end">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-black/15 transition duration-500 group-hover:rotate-45 group-hover:bg-black group-hover:text-white">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes altumMarquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-[altumMarquee_24s_linear_infinite] {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
