import Link from "next/link";
import { SiteShell } from "@/components/public/site-shell";
import {
  ArrowRight,
  BrainCircuit,
  Clock3,
  Gauge,
  MessageSquare,
  Rocket,
  Target,
  Workflow,
} from "lucide-react";

type ProgrammaticLandingProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  benefits: [string, string, string];
  problems: [string, string, string];
  steps: [string, string, string, string];
  delivery7Days: [string, string, string, string, string, string, string];
  faqs: Array<{ q: string; a: string }>;
  ctaHref?: string;
};

const benefitIcons = [Gauge, BrainCircuit, MessageSquare] as const;
const problemIcons = [Clock3, Target, Workflow] as const;

export default function ProgrammaticLanding({
  eyebrow,
  title,
  subtitle,
  benefits,
  problems,
  steps,
  delivery7Days,
  faqs,
  ctaHref = "/",
}: ProgrammaticLandingProps) {
  return (
    <SiteShell>
      <div className="text-[#292a2d]">
        <section className="relative overflow-hidden px-6 pb-16 pt-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.22),transparent_40%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="mx-auto max-w-6xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#292a2d]">
              {eyebrow}
            </p>
            <h1 className="mb-5 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
              {title}
            </h1>
            <p className="mb-8 max-w-3xl text-lg leading-8 text-slate-600">
              {subtitle}
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              {benefits.map((benefit, index) => {
                const Icon = benefitIcons[index % benefitIcons.length];
                return (
                  <article
                    key={benefit}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <Icon className="mb-3 text-[#292a2d]" size={22} />
                    <p className="font-medium text-slate-600">{benefit}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-3xl font-bold">Problemas comuns</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {problems.map((problem, index) => {
                const Icon = problemIcons[index % problemIcons.length];
                return (
                  <article
                    key={problem}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <Icon className="mb-3 text-[#292a2d]" size={20} />
                    <p className="text-slate-600">{problem}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-3xl font-bold">Como resolvemos</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {steps.map((step, index) => (
                <article
                  key={step}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#292a2d]">
                    Passo {index + 1}
                  </p>
                  <p className="text-slate-600">{step}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-3xl font-bold">
              O que pode entrar na configuração inicial
            </h2>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
              {delivery7Days.map((item, index) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#292a2d] text-xs font-bold text-[#292a2d]">
                    {index + 1}
                  </span>
                  <p className="text-slate-600">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-3xl font-bold">FAQ</h2>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group rounded-xl border border-slate-200 bg-white p-5"
                >
                  <summary className="cursor-pointer list-none pr-8 font-semibold text-slate-600">
                    {faq.q}
                  </summary>
                  <p className="mt-3 text-slate-600">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-24 pt-8">
          <div className="mx-auto max-w-6xl rounded-3xl border border-[#ed782f]/35 bg-[#ed782f]/10 p-8 md:p-10">
            <h2 className="mb-3 text-3xl font-bold">
              Quer aplicar esse modelo na sua operacao?
            </h2>
            <p className="mb-6 max-w-3xl text-slate-600">
              Estruturamos IA, automacao, WhatsApp e paginas de conversao com
              foco em leads qualificados e previsibilidade comercial.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-full bg-[#292a2d] px-6 py-3 text-sm font-semibold text-[#292a2d] hover:bg-[#3B82F6]"
              >
                Agendar diagnóstico <ArrowRight size={15} />
              </Link>
              <Link
                href="/solucoes"
                className="rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 hover:border-white"
              >
                Ver solucoes
              </Link>
            </div>
          </div>
        </section>

        <div className="pointer-events-none fixed bottom-6 right-6 z-40 hidden lg:block">
          <Link
            href={ctaHref}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[#ed782f]/60 bg-[#292a2d] px-6 py-3 text-sm font-semibold text-[#292a2d] shadow-[0_10px_35px_-10px_rgba(37,99,235,0.7)] hover:bg-[#3B82F6]"
          >
            <Rocket size={16} />
            Agendar diagnóstico
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
