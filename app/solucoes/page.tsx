import type { Metadata } from "next";
import SegmentosLanding from "@/components/segmentos/SegmentosLanding";
import { verticals } from "@/lib/verticals";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Solucoes",
  description: "Paginas por vertical para captacao, qualificacao e escala comercial com foco em performance.",
  alternates: {
    canonical: `${SITE_URL}/solucoes`,
  },
};

export default function SolucoesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Solucoes ALTUM",
    itemListElement: verticals.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: `${SITE_URL}/solucoes/${item.slug}`,
    })),
  };

  return (
    <>
      <SegmentosLanding
        sourceLabel="Solucoes ALTUM"
        title="Solucoes por vertical para captacao, qualificacao e escala"
        subtitle="Uma estrutura pratica para reduzir ruido comercial, aumentar velocidade de atendimento e transformar volume em oportunidades reais."
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
