import type { Metadata } from "next";
import Link from "next/link";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Automacao com IA para vendas B2B e high-ticket",
  description:
    "Guia pratico de automacao com IA para reduzir tarefas manuais, qualificar demanda e aumentar previsibilidade comercial.",
  alternates: {
    canonical: `${SITE_URL}/automacao-com-ia`,
  },
  openGraph: {
    type: "article",
    title: "Automacao com IA para vendas B2B e high-ticket",
    description:
      "Como aplicar automacao com IA no funil comercial sem perder qualidade, com exemplos e modelo de execucao.",
    url: `${SITE_URL}/automacao-com-ia`,
  },
};

const faqs = [
  {
    q: "Automacao com IA substitui o time comercial?",
    a: "Nao. A IA executa triagem e tarefas repetitivas. O time comercial atua na negociacao e no fechamento.",
  },
  {
    q: "Qual o primeiro processo para automatizar?",
    a: "Comece pela qualificacao inicial de leads e pelo follow-up padronizado. E onde existe ganho rapido de produtividade.",
  },
  {
    q: "Como medir se a automacao esta funcionando?",
    a: "Acompanhe taxa de lead qualificado, tempo de resposta, conversao por etapa e custo por oportunidade real.",
  },
] as const;

export default function AutomacaoComIaPage() {
  const faqSchema = buildFaqSchema(
    faqs.map((faq) => ({
      question: faq.q,
      answer: faq.a,
    })),
  );

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-6 py-20 text-white">
      <article className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-sm uppercase tracking-[0.15em] text-[#F56E0F]">Pilar 1</p>
        <h1 className="mb-5 text-4xl font-bold leading-tight md:text-5xl">Automacao com IA para escalar vendas com controle</h1>
        <p className="mb-10 text-lg text-white/75">
          Automacao com IA funciona quando existe processo claro. Sem processo, a tecnologia acelera ruido. O objetivo nao e automatizar tudo, e
          automatizar o que libera tempo do time para as conversas de maior valor.
        </p>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Onde empresas perdem tempo antes da automacao</h2>
          <h3 className="mb-2 text-xl font-semibold">Triagem manual de leads</h3>
          <p className="mb-4 text-white/80">
            Equipes recebem volume alto de contatos e gastam horas para descobrir quem realmente tem perfil. Isso reduz velocidade comercial.
          </p>
          <h3 className="mb-2 text-xl font-semibold">Follow-up inconsistente</h3>
          <p className="text-white/80">
            Sem padrao, cada vendedor executa cadencias diferentes. O resultado e perda de oportunidades que poderiam avancar com rotina estruturada.
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Como estruturamos automacao com IA</h2>
          <h3 className="mb-2 text-xl font-semibold">1. Regras de qualificacao objetivas</h3>
          <p className="mb-4 text-white/80">
            Definimos criterios de fit, urgencia e capacidade de investimento. A IA usa esses criterios para priorizar oportunidades.
          </p>
          <h3 className="mb-2 text-xl font-semibold">2. Fluxo operacional por etapa</h3>
          <p className="mb-4 text-white/80">
            Cada etapa do funil recebe gatilhos e tarefas claras. Assim, automacao gera previsibilidade em vez de depender de improviso.
          </p>
          <h3 className="mb-2 text-xl font-semibold">3. Monitoramento de resultado real</h3>
          <p className="text-white/80">Avaliamos conversao por etapa, tempo de resposta e custo por oportunidade para ajuste continuo.</p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Paginas relacionadas</h2>
          <div className="mb-4 flex flex-wrap gap-3">
            <Link href="/solucoes/imobiliarias" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para imobiliarias
            </Link>
            <Link href="/solucoes/clinicas-medicas" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para clinicas medicas
            </Link>
            <Link href="/solucoes/software-b2b" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para software B2B
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/blog/engenharia-de-vendas-high-ticket" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Post: engenharia de vendas high-ticket
            </Link>
            <Link href="/blog/ia-qualificacao-leads" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Post: IA para qualificacao de leads
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-[#F56E0F]/30 bg-[#F56E0F]/10 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">FAQ</h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-xl border border-white/15 bg-black/20 p-4">
                <h3 className="mb-2 text-lg font-semibold">{faq.q}</h3>
                <p className="text-white/80">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </main>
  );
}
