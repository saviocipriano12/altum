import type { Metadata } from "next";
import { SiteShell } from "@/components/public/site-shell";
import {
  CalloutPanel,
  CardGrid,
  CaseGallery,
  PageHero,
  TimelineSection,
} from "@/components/public/marketing-sections";
import { buildCommercialContactUrl } from "@/lib/commercial-contact";
import {
  buildMarketingMetadata,
  caseStudies,
  implementationSteps,
} from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Estrutura Digital",
  description:
    "Oferta combinada da Altum para pagina, captacao, WhatsApp, IA, plataforma e implantacao trabalhando como uma unica operacao.",
  path: "/estrutura-digital",
});

const bundleLayers = [
  {
    title: "Pagina ou estrutura principal",
    description:
      "Landing page, site ou loja conforme o tipo de venda e a maturidade da empresa.",
  },
  {
    title: "Captacao e trafego",
    description:
      "Google, Meta e canais de entrada ligados a mensagem certa e a uma oferta clara.",
  },
  {
    title: "WhatsApp e operacao comercial",
    description:
      "Fluxo de atendimento, qualificacao, CRM, agenda e follow-up dentro da plataforma.",
    featured: true,
  },
  {
    title: "Implantacao e ritmo de entrada",
    description:
      "Acompanhamento inicial para nao entregar ativo parado ou processo incompleto.",
  },
];

export default function EstruturaDigitalPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Estrutura digital Altum"
        title="Sua presença digital e sua operação. Trabalhando juntas."
        description="Combine páginas, aquisição, WhatsApp e plataforma em um projeto preparado para a forma como sua empresa vende."
        primaryAction={{
          href: buildCommercialContactUrl(
            "estrutura_digital",
            "/estrutura-digital",
          ),
          label: "Montar proposta completa",
        }}
        secondaryAction={{
          href: "/diagnostico",
          label: "Fazer o quiz estrategico",
        }}
      />

      <CardGrid
        title="Uma estrutura, do acesso ao atendimento."
        subtitle="O escopo une os pontos necessários para apresentar sua oferta, receber contatos e acompanhar oportunidades."
        items={bundleLayers}
      />

      <TimelineSection
        title="Da venda ao go-live"
        subtitle="Começamos pelas prioridades e preparamos a configuração, os canais e a equipe para entrar em operação."
        items={implementationSteps}
      />

      <CaseGallery
        title="Projetos que mostram o cuidado com a apresentação."
        subtitle="Conheça exemplos de páginas e experiências digitais desenvolvidas para diferentes negócios."
        items={caseStudies}
      />

      <CalloutPanel
        title="Vamos desenhar uma estrutura para o seu momento?"
        description="Conte o que sua empresa já tem e onde precisa avançar. A partir disso, definimos escopo, prioridades e investimento."
        primaryAction={{ href: "/diagnostico", label: "Comecar pelo quiz" }}
        secondaryAction={{
          href: buildCommercialContactUrl(
            "estrutura_digital",
            "/estrutura-digital",
          ),
          label: "Falar com a equipe",
        }}
      />
    </SiteShell>
  );
}
