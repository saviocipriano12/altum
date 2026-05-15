import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProgrammaticLanding from "@/components/programmatic/ProgrammaticLanding";
import { cityPages, getCityPageBySlug } from "@/data/city-pages";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

type PageProps = {
  params: Promise<{
    city: string;
  }>;
};

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const dynamicParams = false;

export async function generateStaticParams() {
  return cityPages.map((city) => ({ city: city.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const item = getCityPageBySlug(city);
  if (!item) return {};

  const canonical = `${SITE_URL}/cidades/${item.slug}`;

  return {
    title: `Geracao de leads em ${item.city} (${item.state}) com IA e WhatsApp | ALTUM`,
    description: `Operacao comercial para empresas em ${item.city}/${item.state} com IA, automacao e WhatsApp focados em demanda qualificada.`,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      title: `Geracao de leads em ${item.city} (${item.state}) com IA e WhatsApp | ALTUM`,
      description: `Modelo para ${item.localFocus} com landing pages, triagem inteligente e rotina comercial orientada por dados.`,
      url: canonical,
    },
  };
}

export default async function CityPage({ params }: PageProps) {
  const { city } = await params;
  const item = getCityPageBySlug(city);
  if (!item) notFound();

  const canonical = `${SITE_URL}/cidades/${item.slug}`;

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Geracao de leads em ${item.city} com IA e automacao`,
    serviceType: "IA, automacao comercial e WhatsApp para empresas B2B",
    description: `${item.subtitle} Foco local em ${item.localFocus}.`,
    provider: {
      "@type": "Organization",
      name: "ALTUM",
      url: SITE_URL,
    },
    areaServed: `${item.city}, ${item.state}, BR`,
    url: canonical,
  };

  const faqSchema = buildFaqSchema(item.faqs.map((faq) => ({ question: faq.q, answer: faq.a })));

  return (
    <>
      <script id={`city-service-jsonld-${item.slug}`} type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(serviceSchema)} />
      <script id={`city-faq-jsonld-${item.slug}`} type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
      <ProgrammaticLanding
        eyebrow="Cidades"
        title={`IA e automacao em ${item.city}/${item.state}`}
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
