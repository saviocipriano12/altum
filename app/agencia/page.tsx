import type { Metadata } from "next";
import { SiteShell } from "@/components/public/site-shell";
import {
  CalloutPanel,
  CardGrid,
  CaseGallery,
  PageHero,
} from "@/components/public/marketing-sections";
import { buildCommercialContactUrl } from "@/lib/commercial-contact";
import {
  agencyServices,
  buildMarketingMetadata,
  caseStudies,
} from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Agencia",
  description:
    "Pagina da Altum Agencia para servicos de presenca digital, captacao, lojas, landing pages, automacao e growth.",
  path: "/agencia",
});

export default function AgenciaPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Altum Agencia"
        title="Sua presença digital também faz parte da venda."
        description="Sites, landing pages, lojas e campanhas para aproximar sua marca de quem precisa dela. Com atendimento e operação comercial conectados quando fizer sentido para o seu projeto."
        primaryAction={{
          href: buildCommercialContactUrl("agencia", "/agencia"),
          label: "Pedir proposta da agencia",
        }}
        secondaryAction={{
          href: "/diagnostico",
          label: "Fazer o quiz estrategico",
        }}
      />

      <CardGrid
        title="Do primeiro acesso à primeira conversa."
        subtitle="Definimos os canais, as páginas e o acompanhamento conforme o objetivo da sua empresa."
        items={agencyServices}
      />

      <CaseGallery
        title="Projetos para conhecer de perto."
        subtitle="Alguns exemplos de presença digital, apresentação de oferta e captação."
        items={caseStudies}
      />

      <CalloutPanel
        title="Presença digital e operação podem começar juntas."
        description="Se sua empresa precisa estruturar aquisição e atendimento, podemos desenhar um projeto com páginas, campanhas e plataforma."
        primaryAction={{
          href: "/estrutura-digital",
          label: "Ver oferta combinada",
        }}
        secondaryAction={{ href: "/diagnostico", label: "Passar pelo quiz" }}
      />
    </SiteShell>
  );
}
