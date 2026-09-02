import Image from "next/image";
import { BrainCircuit, LayoutDashboard, LayoutTemplate, Megaphone, MessageCircleMore, KanbanSquare, Search } from "lucide-react";
import { AnimatedSection } from "@/components/public/shared/animated-section";
import { homeServices } from "@/lib/public-site/home-content";

const serviceIcons = [
  LayoutTemplate,
  Megaphone,
  Search,
  MessageCircleMore,
  KanbanSquare,
  BrainCircuit,
  LayoutDashboard,
];

const featuredServiceMedia = [
  "/portfolio/vittaprime-1600.jpg",
  "/portfolio/clubefarm-1600.jpg",
];

export function HomeServices() {
  const featuredServices = homeServices.slice(0, 2);
  const remainingServices = homeServices.slice(2);

  return (
    <section
      id="o-que-fazemos"
      className="relative border-b border-black/8 bg-[#f5f1eb] px-5 py-24 text-[#111111] lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.3] [background-image:radial-gradient(circle_at_1px_1px,rgba(17,17,17,0.08)_1px,transparent_0)] [background-size:26px_26px]" />
      <div className="mx-auto max-w-7xl">
        <div className="relative grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <AnimatedSection>
            <div>
              <p className="altum-display text-xs font-bold uppercase tracking-[0.28em] text-[#f56e0f]">
                O que fazemos
              </p>
              <h2 className="altum-display mt-4 max-w-4xl text-[clamp(2.45rem,6.5vw,5.6rem)] font-semibold leading-[0.94] tracking-[-0.07em]">
                Da presenca digital a operacao comercial.
              </h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.08}>
            <p className="max-w-[62ch] text-lg leading-8 text-black/58">
              A Altum pode construir, melhorar ou integrar as principais pecas
              que fazem sua empresa atrair, converter, vender e operar melhor.
            </p>
          </AnimatedSection>
        </div>

        <div className="mt-14 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {featuredServices.map((item, index) => {
              const Icon = serviceIcons[index] || LayoutTemplate;
              const media = featuredServiceMedia[index];

              return (
                <AnimatedSection key={item.title} delay={index * 0.08}>
                  <article className="group overflow-hidden rounded-[34px] border border-black/10 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_38px_120px_rgba(0,0,0,0.12)]">
                    <div className="relative aspect-[1.08/0.9] overflow-hidden">
                      <Image
                        src={media}
                        alt={item.title}
                        fill
                        sizes="(min-width: 1280px) 26vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transition duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/18 to-transparent" />
                      <div className="absolute left-5 top-5 inline-flex rounded-2xl bg-white/14 p-3 text-white backdrop-blur-md">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="absolute bottom-5 left-5 right-5">
                        <h3 className="altum-display text-[clamp(2rem,2.5vw,2.7rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-white">
                          {item.title}
                        </h3>
                      </div>
                    </div>

                    <div className="p-6">
                      <p className="text-sm leading-7 text-black/58">
                        {item.description}
                      </p>
                    </div>
                  </article>
                </AnimatedSection>
              );
            })}
          </div>

          <AnimatedSection delay={0.12}>
            <div className="flex h-full flex-col justify-between rounded-[34px] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.92))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.06)]">
              <div>
                <p className="altum-display text-xs font-bold uppercase tracking-[0.24em] text-[#f56e0f]">
                  Estrutura, nao peca solta
                </p>
                <h3 className="altum-display mt-4 text-[clamp(2rem,2.7vw,3rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-[#111111]">
                  A Altum organiza o que o cliente ve, o que ele clica e o que acontece depois.
                </h3>
                <p className="mt-4 text-sm leading-7 text-black/58">
                  Em vez de vender entregas desconectadas, a Altum conecta
                  presenca, captacao, atendimento, comercial e operacao em uma
                  mesma linha de crescimento.
                </p>
              </div>

              <div className="mt-8 grid gap-3">
                {["Oferta", "Captacao", "Atendimento", "CRM", "IA", "Acompanhamento"].map((item, index) => (
                  <div
                    key={item}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                      index === 1 || index === 4
                        ? "border-[#f56e0f]/24 bg-[#f56e0f]/10 text-[#111111]"
                        : "border-black/10 bg-white/72 text-black/64"
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {remainingServices.map((item, index) => {
            const Icon = serviceIcons[index + 2] || LayoutTemplate;

            return (
              <AnimatedSection key={item.title} delay={index * 0.04}>
                <article className="group h-full rounded-[28px] border border-black/10 bg-white/84 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.05)] transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_28px_100px_rgba(0,0,0,0.08)]">
                  <div className="inline-flex rounded-2xl bg-[#111111] p-3 text-[#f8a25d]">
                    <Icon className="h-5 w-5" />
                  </div>

                  <h3 className="altum-display mt-5 text-[1.55rem] font-semibold tracking-[-0.05em] leading-[1.02]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-black/58">
                    {item.description}
                  </p>
                </article>
              </AnimatedSection>
            );
          })}
        </div>

        <AnimatedSection delay={0.2}>
          <p className="mt-10 max-w-4xl text-base leading-8 text-black/58">
            O cliente nao compra apenas um site, uma campanha ou um sistema. Ele
            compra uma estrutura mais inteligente para vender e crescer.
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
