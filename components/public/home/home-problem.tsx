import { AnimatedSection } from "@/components/public/shared/animated-section";
import { SectionHeader } from "@/components/public/shared/section-header";
import { homeProblems } from "@/lib/public-site/home-content";

export function HomeProblem() {
  return (
    <section className="border-y border-white/10 bg-[#0d0d0d] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <AnimatedSection>
          <SectionHeader
            eyebrow="O problema"
            title="O problema nao e estar na internet. E operar o digital de forma desconectada."
            description="Muitas empresas ja anunciam, recebem contatos, usam WhatsApp, tem redes sociais, site ou ate CRM. Mas quando cada peca funciona separada, o negocio perde eficiencia, previsibilidade, autoridade e vendas no caminho."
          />
        </AnimatedSection>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {homeProblems.map((item, index) => (
            <AnimatedSection key={item.title} delay={index * 0.06}>
              <article className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#f56e0f]/25 hover:bg-white/[0.055]">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#f8a25d]">
                  Gargalo {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="altum-display mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/58">
                  {item.description}
                </p>
              </article>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
