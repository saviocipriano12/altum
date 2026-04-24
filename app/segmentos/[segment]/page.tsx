import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProgrammaticLanding from "@/components/programmatic/ProgrammaticLanding";
import { getSegmentPageBySlug, segmentPages } from "@/data/segment-pages";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

type PageProps = {
  params: Promise<{
    segment: string;
  }>;
};

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const dynamicParams = false;

export async function generateStaticParams() {
  return segmentPages.map((segment) => ({ segment: segment.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { segment } = await params;
  const item = getSegmentPageBySlug(segment);
  if (!item) return {};

  const canonical = `${SITE_URL}/segmentos/${item.slug}`;

  return {
    title: `${item.name}: IA, automacao e WhatsApp para leads B2B | ALTUM`,
    description: `Estrategia para ${item.name.toLowerCase()} com foco em ${item.offerFocus}, qualificacao de demanda e operacao comercial previsivel.`,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      title: `${item.name}: IA, automacao e WhatsApp para leads B2B | ALTUM`,
      description: `Modelo para ${item.name.toLowerCase()} com landing pages, IA na triagem e WhatsApp para gerar demanda qualificada.`,
      url: canonical,
    },
  };
}

export default async function SegmentPage({ params }: PageProps) {
  const { segment } = await params;
  const item = getSegmentPageBySlug(segment);
  if (!item) notFound();

  const canonical = `${SITE_URL}/segmentos/${item.slug}`;

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Solucao ALTUM para ${item.name}`,
    serviceType: "IA, automacao comercial e WhatsApp para geracao de leads",
    description: `${item.subtitle} Foco em ${item.leadFocus} e ${item.offerFocus}.`,
    provider: {
      "@type": "Organization",
      name: "ALTUM",
      url: SITE_URL,
    },
    areaServed: "Brasil",
    url: canonical,
  };

  const faqSchema = buildFaqSchema(item.faqs.map((faq) => ({ question: faq.q, answer: faq.a })));

  return (
    <>
      <script id={`segment-service-jsonld-${item.slug}`} type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(serviceSchema)} />
      <script id={`segment-faq-jsonld-${item.slug}`} type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
      <ProgrammaticLanding
        eyebrow="Segmentos"
        title={`IA e automacao para ${item.name}`}
        subtitle={item.subtitle}
        benefits={item.benefits}
        problems={item.problems}
        steps={item.steps}
        delivery7Days={item.delivery7Days}
        faqs={item.faqs}
        ctaHref="/contato"
      />
    </>
  );
}
