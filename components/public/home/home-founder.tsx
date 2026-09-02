import Image from "next/image";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { CtaButton } from "@/components/public/shared/cta-button";
import { founderHighlights } from "@/lib/public-site/home-content";

export function HomeFounder() {
  return (
    <section id="sobre" className="relative border-b border-white/10 bg-[#f5f1eb] px-5 py-24 text-[#111111] lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <AnimatedSection className="relative mx-auto w-full max-w-[410px]">
          <div className="absolute -inset-6 rounded-[46px] bg-[#f56e0f]/12 blur-3xl" />
          <div className="relative overflow-hidden rounded-[38px] bg-[#111111] shadow-[0_34px_120px_rgba(0,0,0,0.20)]">
            <div className="relative aspect-[4/5]">
              <Image
                src="/images/founder/savio.jpg"
                alt="Savio Cipriano, fundador da Altum"
                fill
                sizes="(min-width: 1024px) 410px, 90vw"
                className="object-cover grayscale"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-7">
                <p className="altum-display text-3xl font-semibold tracking-[-0.06em] text-white">
                  Savio Cipriano
                </p>
                <p className="mt-1 text-sm font-semibold text-[#f8a25d]">
                  Fundador e estrategista da Altum
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.08}>
          <p className="altum-display text-xs font-bold uppercase tracking-[0.28em] text-[#f56e0f]">
            Sobre a Altum
          </p>
          <h2 className="altum-display mt-4 text-[clamp(2.45rem,6.4vw,5.6rem)] font-semibold leading-[0.94] tracking-[-0.07em]">
            A Altum nao vende so uma pagina. Ela constroi a estrutura para o negocio vender melhor.
          </h2>

          <div className="mt-8 grid gap-5 text-base leading-8 text-black/62 md:text-lg">
            <p>
              O mercado esta cheio de empresas que entregam uma peca isolada:
              um site, um anuncio, uma automacao, um CRM ou uma promessa de IA.
            </p>
            <p>
              A Altum existe para conectar essas pecas em uma operacao real:
              presenca, aquisicao, atendimento, comercial, dados e acompanhamento.
            </p>
          </div>

          <div className="mt-9 grid gap-3">
            {founderHighlights.map((item, index) => (
              <AnimatedSection key={item} delay={0.12 + index * 0.04}>
                <div className="rounded-[24px] border border-black/10 bg-white p-5 shadow-[0_20px_70px_rgba(0,0,0,0.06)]">
                  <p className="text-sm leading-7 text-black/62">{item}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <CtaButton
            href="/diagnostico?entry=founder_section"
            label="Pedir diagnostico gratuito"
            className="mt-9"
          />
        </AnimatedSection>
      </div>
    </section>
  );
}
