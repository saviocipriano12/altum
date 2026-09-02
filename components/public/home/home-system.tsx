import {
  BarChart3,
  Bot,
  Globe2,
  LayoutDashboard,
  MessageCircleMore,
  Target,
} from "lucide-react";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { SectionHeader } from "@/components/public/shared/section-header";
import { homeSystemPillars } from "@/lib/public-site/home-content";

const pillarIcons = [
  Globe2,
  Target,
  MessageCircleMore,
  BarChart3,
  Bot,
  LayoutDashboard,
];

export function HomeSystem() {
  return (
    <section id="como-funciona" className="relative border-b border-white/10 bg-[#070707] px-5 py-24 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_14%,rgba(245,110,15,0.12),transparent_24%)]" />
      <div className="mx-auto max-w-7xl">
        <AnimatedSection>
          <SectionHeader
            eyebrow="A virada"
            title="A Altum conecta as partes que fazem o crescimento acontecer."
            description="Nos olhamos para a operacao digital e comercial como um sistema. Presenca, demanda, atendimento, processo, inteligencia e acompanhamento precisam trabalhar juntos."
          />
        </AnimatedSection>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {homeSystemPillars.map((item, index) => (
            <AnimatedSection key={item.title} delay={index * 0.05}>
              <article className="group rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#f56e0f]/25 hover:bg-white/[0.055]">
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#f56e0f]/20 bg-[#f56e0f]/10 text-[#f8a25d]">
                    {(() => {
                      const Icon = pillarIcons[index];
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/28 transition group-hover:text-[#f8a25d]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="altum-display mt-6 text-2xl font-semibold tracking-[-0.05em] text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/58">
                  {item.description}
                </p>
              </article>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection delay={0.22}>
          <div className="mt-8 rounded-[32px] border border-[#f56e0f]/20 bg-[radial-gradient(circle_at_left,rgba(245,110,15,0.18),transparent_24%),rgba(245,110,15,0.08)] px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <p className="text-base leading-8 text-white/74">
                Quando essas partes se conectam, o digital deixa de ser improviso
                e passa a funcionar como uma estrutura de crescimento.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {["Oferta", "Processo", "Operacao"].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-black/18 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-white/68"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
