import type { Metadata } from "next";
import Link from "next/link";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "IA no WhatsApp para qualificacao e agendamento",
  description:
    "Como usar IA no WhatsApp para qualificar leads, reduzir ruido no atendimento e acelerar reunioes comerciais.",
  alternates: {
    canonical: `${SITE_URL}/ia-no-whatsapp`,
  },
  openGraph: {
    type: "article",
    title: "IA no WhatsApp para qualificacao e agendamento",
    description:
      "Framework pratico para usar IA no WhatsApp em captacao, triagem e direcionamento comercial com mais conversao.",
    url: `${SITE_URL}/ia-no-whatsapp`,
  },
};

const faqs = [
  {
    q: "IA no WhatsApp aumenta conversao mesmo com pouco volume?",
    a: "Sim. Mesmo com pouco volume, a triagem automatica reduz perda de oportunidades e melhora tempo de resposta.",
  },
  {
    q: "Qual risco mais comum nesse tipo de implementacao?",
    a: "Perguntas longas e confusas no inicio da conversa. O ideal e roteiro curto com perguntas de alto impacto.",
  },
  {
    q: "Precisa integrar com CRM desde o primeiro dia?",
    a: "Nao necessariamente. Pode iniciar com fluxo simples e depois integrar CRM quando o processo estiver validado.",
  },
] as const;

export default function IaNoWhatsappPage() {
  const faqSchema = buildFaqSchema(
    faqs.map((faq) => ({
      question: faq.q,
      answer: faq.a,
    })),
  );

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-6 py-20 text-white">
      <article className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-sm uppercase tracking-[0.15em] text-[#F56E0F]">Pilar 2</p>
        <h1 className="mb-5 text-4xl font-bold leading-tight md:text-5xl">IA no WhatsApp para filtrar curiosos e priorizar quem compra</h1>
        <p className="mb-10 text-lg text-white/75">
          O WhatsApp e o principal canal de atendimento de muitas operacoes. Quando a conversa inicial e automatizada com criterio, o time comercial
          recebe menos ruido e mais contexto para fechar.
        </p>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Problemas comuns no WhatsApp comercial</h2>
          <h3 className="mb-2 text-xl font-semibold">Atendimento lento em horario de pico</h3>
          <p className="mb-4 text-white/80">
            Mensagens acumulam, leads esfriam e o primeiro contato acontece tarde. A resposta lenta derruba conversao mesmo com bom trafego.
          </p>
          <h3 className="mb-2 text-xl font-semibold">Conversa sem roteiro de qualificacao</h3>
          <p className="text-white/80">
            Sem perguntas objetivas, a equipe nao identifica cedo quem tem fit. Isso aumenta retrabalho e ocupacao de agenda com oportunidades fracas.
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Implementacao pratica</h2>
          <h3 className="mb-2 text-xl font-semibold">Mensagem de abertura orientada a contexto</h3>
          <p className="mb-4 text-white/80">
            A conversa inicia com linguagem simples, confirma objetivo do lead e conduz para perguntas curtas de decisao.
          </p>
          <h3 className="mb-2 text-xl font-semibold">Classificacao automatica de prioridade</h3>
          <p className="mb-4 text-white/80">
            A IA classifica cada contato em aprovado, revisao ou reprovado. O vendedor entra apenas quando existe potencial real.
          </p>
          <h3 className="mb-2 text-xl font-semibold">Handoff com contexto para o comercial</h3>
          <p className="text-white/80">
            Quando o lead e aprovado, o vendedor recebe resumo com necessidade, prazo e nivel de prontidao para acelerar a reuniao.
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Links internos</h2>
          <div className="mb-4 flex flex-wrap gap-3">
            <Link href="/solucoes/dentistas" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para dentistas
            </Link>
            <Link href="/solucoes/clinicas-de-estetica" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para clinicas de estetica
            </Link>
            <Link href="/solucoes/autoescolas" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para autoescolas
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/blog/ia-qualificacao-leads" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Post: IA para qualificacao de leads
            </Link>
            <Link href="/blog/engenharia-de-vendas-high-ticket" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Post: engenharia de vendas high-ticket
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
