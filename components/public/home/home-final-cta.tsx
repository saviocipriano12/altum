import { AnimatedSection } from "@/components/public/shared/animated-section";
import { CtaButton } from "@/components/public/shared/cta-button";

export function HomeFinalCta() {
  return (
    <section className="relative bg-[#070707] px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[42px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,110,15,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-6 py-12 shadow-[0_40px_140px_rgba(0,0,0,0.45)] md:px-10 md:py-16">
        <AnimatedSection className="relative">
          <p className="altum-display text-xs font-bold uppercase tracking-[0.28em] text-[#f8a25d]">
            Proximo passo
          </p>

          <h2 className="altum-display mt-4 max-w-4xl text-[clamp(2.45rem,6.2vw,5.6rem)] font-semibold leading-[0.94] tracking-[-0.07em] text-white">
            Receba um diagnostico gratuito da estrutura digital da sua empresa.
          </h2>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/62">
            A Altum entende seu momento e indica se o melhor caminho e
            presenca digital, trafego, plataforma, automacao ou uma estrutura
            completa.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <CtaButton
              href="/diagnostico?entry=home_final"
              label="Comecar diagnostico gratuito"
            />
            <CtaButton
              href="/plataforma"
              label="Conhecer plataforma"
              variant="secondary"
            />
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
