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
        title="Projetos e growth para empresas que precisam parecer mais fortes e vender com mais consistencia."
        description="A agencia continua sendo uma parte importante do ecossistema Altum. Ela gera caixa, monta ativos, melhora percepcao de valor e pode evoluir o cliente para plataforma, implantacao ou estrutura digital."
        primaryAction={{ href: buildCommercialContactUrl("agencia", "/agencia"), label: "Pedir proposta da agencia" }}
        secondaryAction={{ href: "/diagnostico", label: "Fazer o quiz estrategico" }}
      />

      <CardGrid
        title="Servicos que conectam melhor com a plataforma"
        subtitle="Aqui a ideia nao e vender coisas soltas. E vender servicos que fazem sentido para captacao, conversao e operacao futura."
        items={agencyServices}
      />

      <CaseGallery
        title="A linguagem visual da agencia reforca o valor da proposta"
        subtitle="Cases e referencias ajudam a abrir portas de ticket mais alto e criam ponte natural para a recorrencia depois."
        items={caseStudies}
      />

      <CalloutPanel
        title="Quando o cliente precisa de demanda e organizacao ao mesmo tempo, growth entra junto com o SaaS."
        description="O caminho comercial mais forte e mostrar a agencia como acelerador, a plataforma como base continua da operacao e o quiz como filtro de entrada."
        primaryAction={{ href: "/estrutura-digital", label: "Ver oferta combinada" }}
        secondaryAction={{ href: "/diagnostico", label: "Passar pelo quiz" }}
      />
    </SiteShell>
  );
}
