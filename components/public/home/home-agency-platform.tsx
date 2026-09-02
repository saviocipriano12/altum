import { CheckCircle2 } from "lucide-react";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { CtaButton } from "@/components/public/shared/cta-button";
import {
  homeAgencyItems,
  homePlatformItems,
} from "@/lib/public-site/home-content";

export function HomeAgencyPlatform() {
  return (
    <section className="relative border-b border-white/10 bg-[#101010] px-5 py-24 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(245,110,15,0.12),transparent_24%)]" />
      <div className="mx-auto max-w-7xl">
        <AnimatedSection className="max-w-4xl">
          <p className="altum-display text-xs font-bold uppercase tracking-[0.28em] text-[#f8a25d]">
            Duas frentes, uma estrutura
          </p>
          <h2 className="altum-display mt-4 text-[clamp(2.35rem,6vw,5.4rem)] font-semibold leading-[0.94] tracking-[-0.07em] text-white">
            Agencia quando sua empresa precisa de estrategia e execucao.
            Plataforma quando precisa de controle e escala.
          </h2>
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/62 md:text-lg">
            A Altum atua em duas frentes que podem funcionar separadas, mas
            entregam muito mais valor quando trabalham juntas: a agencia
            estrutura e executa; a plataforma organiza e acompanha.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.04}>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
            Estrutura, controle e escala
          </div>
        </AnimatedSection>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <AnimatedSection delay={0.06}>
            <article className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f8a25d]">
                Altum Agencia
              </p>
              <h3 className="altum-display mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">
                Estrategia, implantacao e execucao para empresas que precisam
                melhorar presenca digital, gerar demanda e organizar o comercial.
              </h3>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {homeAgencyItems.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/14 px-4 py-3 text-sm leading-6 text-white/66">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f8a25d]" />
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </AnimatedSection>

          <AnimatedSection delay={0.12}>
            <article className="rounded-[34px] border border-[#f56e0f]/20 bg-[radial-gradient(circle_at_top_left,rgba(245,110,15,0.22),transparent_28%),rgba(245,110,15,0.10)] p-6 shadow-[0_28px_90px_rgba(245,110,15,0.10)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f8a25d]">
                Altum Plataforma
              </p>
              <h3 className="altum-display mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">
                Organizacao, visibilidade e inteligencia para centralizar o que
                normalmente fica espalhado na operacao.
              </h3>

              <div className="mt-8 flex flex-wrap gap-2">
                {homePlatformItems.map((item, index) => (
                  <span
                    key={item}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                      index < 3
                        ? "border-[#f56e0f]/28 bg-black/20 text-white"
                        : "border-white/10 bg-black/20 text-white/74"
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </article>
          </AnimatedSection>
        </div>

        <AnimatedSection delay={0.16}>
          <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] px-6 py-5 lg:flex-row lg:items-center">
            <p className="max-w-3xl text-base leading-8 text-white/70">
              Separadas, resolvem problemas especificos. Juntas, formam uma
              estrutura de crescimento digital e comercial.
            </p>
            <CtaButton
              href="/diagnostico?entry=agency_platform"
              label="Descobrir qual caminho faz sentido"
            />
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
