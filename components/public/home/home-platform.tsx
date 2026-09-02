import { LayoutDashboard } from "lucide-react";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { SectionHeader } from "@/components/public/shared/section-header";
import { PlatformMockup } from "@/components/public/shared/platform-mockup";
import { homePlatformModules } from "@/lib/public-site/home-content";

export function HomePlatform() {
  return (
    <section
      id="plataforma"
      className="relative border-b border-white/10 bg-[#070707] px-5 py-24 lg:px-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(245,110,15,0.10),transparent_26%)]" />
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
        <div>
          <AnimatedSection>
            <SectionHeader
              eyebrow="Plataforma Altum"
              title="Uma plataforma para acompanhar o que esta acontecendo na operacao."
              description="Enquanto a Altum executa ou orienta, o cliente acompanha campanhas, leads, conversas, pipeline, entregas e proximos passos em um ambiente proprio."
            />
          </AnimatedSection>

          <AnimatedSection delay={0.06}>
            <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Conversas", "com contexto"],
                  ["Pipeline", "com proxima acao"],
                  ["IA", "apoiando a operacao"],
                ].map(([title, subtitle]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-black/16 px-4 py-4">
                    <p className="altum-display text-base font-semibold text-white">{title}</p>
                    <p className="mt-1 text-sm text-white/48">{subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          <div className="mt-8 grid gap-3">
            {homePlatformModules.map((item, index) => (
              <AnimatedSection key={item.title} delay={index * 0.05}>
                <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 transition hover:border-[#f56e0f]/25 hover:bg-white/[0.05]">
                  <div className="flex gap-4">
                    <div className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[#f8a25d] ${
                      index % 3 === 0
                        ? "border-[#f56e0f]/20 bg-[#f56e0f]/10"
                        : "border-white/10 bg-white/[0.035]"
                    }`}>
                      <LayoutDashboard className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="altum-display text-base font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-white/54">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>

        <AnimatedSection delay={0.12}>
          <PlatformMockup />
        </AnimatedSection>
      </div>
    </section>
  );
}
