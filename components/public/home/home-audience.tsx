import { CheckCircle2 } from "lucide-react";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { homeAudienceProfiles } from "@/lib/public-site/home-content";

export function HomeAudience() {
  return (
    <section className="border-b border-white/10 bg-[#f5f1eb] px-5 py-24 text-[#111111] lg:px-8">
      <div className="mx-auto max-w-7xl">
        <AnimatedSection>
          <div className="max-w-4xl">
            <p className="altum-display text-xs font-bold uppercase tracking-[0.28em] text-[#f56e0f]">
              Para quem a Altum e indicada
            </p>
            <h2 className="altum-display mt-4 text-[clamp(2.35rem,6vw,5.4rem)] font-semibold leading-[0.94] tracking-[-0.07em]">
              Empresas em movimento que precisam de mais estrutura para crescer.
            </h2>
            <p className="mt-6 max-w-3xl text-base leading-8 text-black/62 md:text-lg">
              A Altum faz mais sentido para negocios que ja entenderam que
              crescimento digital sem processo costuma gerar retrabalho, perda
              de oportunidade e operacao dispersa.
            </p>
          </div>
        </AnimatedSection>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {homeAudienceProfiles.map((item, index) => (
            <AnimatedSection key={item} delay={index * 0.06}>
              <article className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,0.06)]">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#f56e0f]" />
                  <p className="text-sm leading-7 text-black/62">{item}</p>
                </div>
              </article>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
