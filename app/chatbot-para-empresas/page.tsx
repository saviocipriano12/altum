import type { Metadata } from "next";
import Link from "next/link";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Chatbot para empresas: estrategia, operacao e ROI",
  description:
    "Guia completo para implementar chatbot para empresas com foco em atendimento comercial, eficiencia operacional e conversao.",
  alternates: {
    canonical: `${SITE_URL}/chatbot-para-empresas`,
  },
  openGraph: {
    type: "article",
    title: "Chatbot para empresas: estrategia, operacao e ROI",
    description:
      "Entenda como desenhar chatbot para empresas com roteiro de atendimento, integracao e metas de resultado.",
    url: `${SITE_URL}/chatbot-para-empresas`,
  },
};

const faqs = [
  {
    q: "Quando um chatbot vale a pena para empresa B2B?",
    a: "Quando existe volume minimo de demanda e processo comercial que sofre com triagem manual e tempo de resposta.",
  },
  {
    q: "Como evitar um chatbot robotico e ineficiente?",
    a: "Use linguagem natural, roteiros curtos e transicao rapida para humano quando houver sinal de compra.",
  },
  {
    q: "Quais indicadores acompanhar apos lancar o chatbot?",
    a: "Taxa de resposta, taxa de lead qualificado, tempo ate primeira reuniao e conversao por etapa do funil.",
  },
] as const;

export default function ChatbotParaEmpresasPage() {
  const faqSchema = buildFaqSchema(
    faqs.map((faq) => ({
      question: faq.q,
      answer: faq.a,
    })),
  );

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-6 py-20 text-white">
      <article className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-sm uppercase tracking-[0.15em] text-[#F56E0F]">Pilar 3</p>
        <h1 className="mb-5 text-4xl font-bold leading-tight md:text-5xl">Chatbot para empresas com foco em resultado comercial</h1>
        <p className="mb-10 text-lg text-white/75">
          Chatbot nao e apenas atendimento automatico. Em operacoes de vendas, ele atua como camada de qualificacao, distribuicao e ganho de velocidade
          do funil. O valor real aparece quando existe estrategia de negocio por tras.
        </p>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Desenho de chatbot que gera impacto</h2>
          <h3 className="mb-2 text-xl font-semibold">Objetivo unico por fluxo</h3>
          <p className="mb-4 text-white/80">
            Cada fluxo deve ter uma meta: qualificar, agendar, recuperar ou nutrir. Misturar objetivos em uma conversa reduz taxa de conclusao.
          </p>
          <h3 className="mb-2 text-xl font-semibold">Escalonamento inteligente para humano</h3>
          <p className="text-white/80">
            O chatbot precisa saber a hora de transferir para o time. Isso evita friccao quando o lead esta pronto para negociar.
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Operacao e melhoria continua</h2>
          <h3 className="mb-2 text-xl font-semibold">Revisao semanal de conversas</h3>
          <p className="mb-4 text-white/80">
            A equipe analisa objecoes, pontos de abandono e padroes de resposta para ajustar roteiro e perguntas criticas.
          </p>
          <h3 className="mb-2 text-xl font-semibold">Ajuste por dados do funil</h3>
          <p className="text-white/80">
            Melhorias devem ser guiadas por taxa de qualificacao e avance de etapa. Assim o chatbot evolui com o negocio, nao por opiniao.
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Conteudos e paginas relacionadas</h2>
          <div className="mb-4 flex flex-wrap gap-3">
            <Link href="/solucoes/consultorias-empresariais" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para consultorias
            </Link>
            <Link href="/solucoes/contabilidades" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para contabilidades
            </Link>
            <Link href="/solucoes/equipamentos-industriais" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#F56E0F]">
              Solucao para industria
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
