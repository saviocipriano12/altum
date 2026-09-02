import { Sparkles } from "lucide-react";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { CtaButton } from "@/components/public/shared/cta-button";
import { homeDiagnosisSteps } from "@/lib/public-site/home-content";

export function HomeDiagnosis() {
  return (
    <section
      id="diagnostico"
      className="relative border-b border-black/8 bg-[#f5f1eb] px-5 py-20 text-[#111111] lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <AnimatedSection>
          <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div>
              <p className="altum-display text-xs font-bold uppercase tracking-[0.28em] text-[#f56e0f]">
                Diagnostico gratuito
              </p>
              <h2 className="altum-display mt-4 max-w-[12ch] text-[clamp(2.5rem,6vw,5.3rem)] font-semibold leading-[0.94] tracking-[-0.07em] text-[#111111]">
                Antes de vender qualquer solucao, entendemos o que sua empresa realmente precisa.
              </h2>
              <p className="mt-5 max-w-[58ch] text-base leading-8 text-black/62 md:text-lg">
                O diagnostico gratuito existe para identificar gargalos e apontar
                o melhor caminho: presenca digital, trafego, CRM, automacao,
                plataforma ou estrutura completa.
              </p>
            </div>

            <div className="rounded-[30px] border border-black/10 bg-white/78 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.08)] backdrop-blur-xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#f56e0f]" />
                  <p className="max-w-[44ch] text-sm leading-7 text-black/64">
                    No final, voce entende com mais clareza quais acoes podem
                    gerar mais impacto no seu momento atual.
                  </p>
                </div>
                <CtaButton
                  href="/diagnostico?entry=home_diagnosis"
                  label="Quero meu diagnostico gratuito"
                />
              </div>
            </div>
          </div>
        </AnimatedSection>

        <div className="mt-10 grid gap-4 xl:grid-cols-3">
          {homeDiagnosisSteps.map((item, index) => (
            <AnimatedSection key={item.step} delay={index * 0.08}>
              <article className="h-full rounded-[34px] border border-black/10 bg-white p-6 shadow-[0_24px_90px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f56e0f] text-sm font-bold text-white">
                    {item.step}
                  </span>
                  <h3 className="altum-display text-[clamp(1.7rem,2vw,2.2rem)] font-semibold tracking-[-0.05em] text-[#111111]">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-5 text-sm leading-7 text-black/58">
                  {item.description}
                </p>
              </article>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection delay={0.22}>
          <div className="mt-6 rounded-[30px] border border-[#f56e0f]/20 bg-[#f56e0f]/10 px-6 py-5">
            <div className="flex items-start gap-4">
              <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#f56e0f]" />
              <p className="max-w-4xl text-base leading-8 text-black/68">
                No final, voce entende com mais clareza quais acoes podem gerar
                mais impacto no seu momento atual.
              </p>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
