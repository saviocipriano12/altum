import Image from "next/image";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { SectionHeader } from "@/components/public/shared/section-header";
import { homeCases } from "@/lib/public-site/home-content";

export function HomeCases() {
  return (
    <section
      id="cases"
      className="relative border-b border-white/10 bg-[#101010] px-5 py-24 lg:px-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(245,110,15,0.12),transparent_22%)]" />
      <div className="mx-auto max-w-7xl">
        <AnimatedSection>
          <SectionHeader
            eyebrow="Projetos"
            title="Paginas e estruturas que aumentam percepcao de valor."
            description="Design bonito nao e suficiente. O visual precisa deixar sua oferta mais clara, confiavel e facil de comprar."
          />
        </AnimatedSection>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {homeCases.map((item, index) => (
            <AnimatedSection key={item.title} delay={index * 0.08}>
              <article
                className={`group overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.035] ${
                  index === 0 ? "lg:mt-10" : ""
                } ${index === 1 ? "lg:-mt-4" : ""} ${
                  index === 2 ? "lg:mt-16" : ""
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/14 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f8a25d]">
                      {item.tag}
                    </p>
                    <h3 className="altum-display mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">
                      {item.title}
                    </h3>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-sm leading-7 text-white/60">
                    {item.description}
                  </p>
                </div>
              </article>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
