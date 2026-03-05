import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";
import { getVerticalBySlug, verticals } from "@/lib/verticals";

type PageProps = {
  params: Promise<{
    vertical: string;
  }>;
};

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const PILLAR_LINKS = [
  { href: "/automacao-com-ia", label: "Pilar 1: Automacao com IA" },
  { href: "/ia-no-whatsapp", label: "Pilar 2: IA no WhatsApp" },
  { href: "/chatbot-para-empresas", label: "Pilar 3: Chatbot para Empresas" },
] as const;

export const dynamicParams = false;

export async function generateStaticParams() {
  return verticals.map((vertical) => ({ vertical: vertical.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vertical } = await params;
  const page = getVerticalBySlug(vertical);
  if (!page) return {};

  const canonical = `${SITE_URL}/solucoes/${page.slug}`;

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      title: page.title,
      description: page.description,
      url: canonical,
    },
  };
}

export default async function VerticalPage({ params }: PageProps) {
  const { vertical } = await params;
  const page = getVerticalBySlug(vertical);
  if (!page) notFound();

  const faqs = [
    {
      q: `Como a ALTUM ajuda ${page.name.toLowerCase()} a gerar mais leads qualificados?`,
      a: `Combinamos landing pages orientadas a conversao, captacao segmentada e triagem automatica no WhatsApp para priorizar contatos com perfil real de compra.`,
    },
    {
      q: "Em quanto tempo os primeiros indicadores melhoram?",
      a: "Normalmente em poucas semanas ja e possivel observar ganho em tempo de resposta, taxa de lead qualificado e avanço no funil comercial.",
    },
    {
      q: "A estrategia funciona para equipe comercial pequena?",
      a: "Sim. A implementacao comeca enxuta, com processos essenciais, e evolui conforme o volume de oportunidades cresce.",
    },
  ];

  const canonical = `${SITE_URL}/solucoes/${page.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.title,
    description: page.description,
    url: canonical,
    provider: {
      "@type": "Organization",
      name: "ALTUM",
      url: SITE_URL,
    },
  };
  const faqJsonLd = buildFaqSchema(
    faqs.map((faq) => ({
      question: faq.q,
      answer: faq.a,
    })),
  );

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-6 py-20 text-white">
      <section className="mx-auto w-full max-w-4xl">
        <Link href="/solucoes" className="mb-8 inline-block text-sm font-semibold text-[#F56E0F] hover:text-[#ff8e44]">
          Voltar para solucoes
        </Link>

        <p className="mb-3 text-sm uppercase tracking-[0.14em] text-[#F56E0F]">Vertical: {page.name}</p>
        <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">{page.title}</h1>
        <p className="mb-10 max-w-3xl text-lg text-white/75">{page.description}</p>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Problemas comuns</h2>
          <ul className="list-disc space-y-3 pl-6 text-white/85">
            {page.commonProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Como resolvemos</h2>
          <ul className="list-disc space-y-3 pl-6 text-white/85">
            {page.howWeSolve.map((solution) => (
              <li key={solution}>{solution}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Exemplos de aplicacao</h2>
          <ul className="list-disc space-y-3 pl-6 text-white/85">
            {page.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">Pilares da implementacao</h2>
          <p className="mb-4 text-white/75">Aprofunde nos pilares que sustentam a operacao. Essas paginas serao detalhadas na sequencia.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {PILLAR_LINKS.map((pillar) => (
              <Link
                key={pillar.href}
                href={pillar.href}
                className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm font-semibold text-white/90 transition-colors hover:border-[#F56E0F] hover:text-[#F56E0F]"
              >
                {pillar.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="mb-4 text-2xl font-semibold">FAQ</h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <article key={faq.q} className="rounded-xl border border-white/10 bg-black/20 p-5">
                <h3 className="mb-2 text-lg font-semibold">{faq.q}</h3>
                <p className="text-white/75">{faq.a}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#F56E0F]/30 bg-[#F56E0F]/10 p-6 md:p-8">
          <h2 className="mb-3 text-2xl font-semibold">Proximo passo</h2>
          <p className="mb-5 text-white/85">
            Se voce atua em {page.name.toLowerCase()} e quer aumentar previsibilidade comercial, podemos montar um plano com metas por etapa do funil.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="rounded-full bg-[#F56E0F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ff8e44]">
              Solicitar diagnostico
            </Link>
            <Link href="/blog" className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold text-white/90 hover:border-white">
              Ler conteudo tecnico
            </Link>
          </div>
        </section>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqJsonLd)} />
    </main>
  );
}
