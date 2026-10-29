import type { Metadata } from "next";
import { SiteShell } from "@/components/public/site-shell";
import {
  PublicHero,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { PublicPortfolio } from "@/components/public/public-portfolio";
import { buildMarketingMetadata } from "@/lib/public-site";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Portfólio",
  description:
    "Explore projetos Altum e referências de design para lojas virtuais e sites institucionais.",
  path: "/portfolio",
});
export default function PortfolioPage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Projetos e referências"
        title={
          <>
            Presença digital que conta
            <br />a história de cada negócio.
          </>
        }
        description="Conheça projetos da Altum e referências de design, identificados em cada exemplo. Explore lojas virtuais e sites institucionais."
      />
      <PublicPortfolio />
      <PublicCta
        href="/contato?interest=agencia"
        title="Sua marca também tem uma história para contar."
        description="Vamos conversar sobre o objetivo, a apresentação e o caminho de conversão do seu próximo projeto."
        label="Conversar sobre meu projeto"
      />
    </SiteShell>
  );
}
