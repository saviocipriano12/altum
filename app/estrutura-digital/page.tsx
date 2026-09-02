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
    description: "Landing page, site ou loja conforme o tipo de venda e a maturidade da empresa.",
  },
  {
    title: "Captacao e trafego",
    description: "Google, Meta e canais de entrada ligados a mensagem certa e a uma oferta clara.",
  },
  {
    title: "WhatsApp e operacao comercial",
    description: "Fluxo de atendimento, qualificacao, CRM, agenda e follow-up dentro da plataforma.",
    featured: true,
  },
  {
    title: "Implantacao e ritmo de entrada",
    description: "Acompanhamento inicial para nao entregar ativo parado ou processo incompleto.",
  },
];

export default function EstruturaDigitalPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Oferta de maior caixa"
        title="Estrutura Digital combina growth, plataforma, WhatsApp e implantacao numa proposta comercial unica."
        description="Essa pagina serve para o cliente que nao precisa so de software. Ele precisa de uma operacao que capte, responda, acompanhe e venda com mais maturidade."
        primaryAction={{ href: buildCommercialContactUrl("estrutura_digital", "/estrutura-digital"), label: "Montar proposta completa" }}
        secondaryAction={{ href: "/diagnostico", label: "Fazer o quiz estrategico" }}
      />

      <CardGrid
        title="Como a oferta e montada"
        subtitle="Cada camada fortalece o ticket e deixa mais claro porque Altum nao e apenas uma ferramenta ou apenas uma agencia."
        items={bundleLayers}
      />

      <TimelineSection
        title="Da venda ao go-live"
        subtitle="A mesma estrutura suporta o discurso comercial, a entrega inicial e a futura recorrencia da plataforma."
        items={implementationSteps}
      />

      <CaseGallery
        title="Projetos que ajudam a vender essa camada premium"
        subtitle="A prova visual da agencia reforca a percepcao de valor da oferta completa."
        items={caseStudies}
      />

      <CalloutPanel
        title="Esse e o melhor ponto de entrada para clientes com urgencia e verba para resolver o problema inteiro."
        description="Na conversa comercial, o quiz identifica quem deve ir para aqui e quem deve entrar so pela plataforma."
        primaryAction={{ href: "/diagnostico", label: "Comecar pelo quiz" }}
        secondaryAction={{ href: buildCommercialContactUrl("estrutura_digital", "/estrutura-digital"), label: "Falar com a equipe" }}
      />
    </SiteShell>
  );
}
