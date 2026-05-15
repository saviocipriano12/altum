import type { Metadata } from "next";
import SegmentosLanding from "@/components/segmentos/SegmentosLanding";
import { verticals } from "@/lib/verticals";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Segmentos",
  description: "Panorama de segmentos atendidos com estrutura comercial orientada a conversao e previsibilidade.",
  alternates: {
    canonical: `${SITE_URL}/segmentos`,
  },
  openGraph: {
    type: "website",
    title: "Segmentos | ALTUM",
    description: "Veja como aplicamos captacao e qualificacao por segmento para gerar pipeline previsivel.",
    url: `${SITE_URL}/segmentos`,
  },
};

export default function SegmentosPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Segmentos ALTUM",
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
        sourceLabel="Segmentos ALTUM"
        title="Segmentos com maior potencial para escalar vendas com IA"
        subtitle="Aplicamos o mesmo framework comercial em nichos diferentes, adaptando mensagem, fluxo de qualificacao e operacao de vendas."
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
