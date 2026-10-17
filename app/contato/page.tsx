import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/public/site-shell";
import { PublicHero } from "@/components/public/shared/public-sections";
import { CommercialContactForm } from "@/components/public/commercial-contact-form";
import { buildMarketingMetadata } from "@/lib/public-site";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Fale com a Altum",
  description:
    "Agende uma demonstração da Altum aplicada ao seu cenário de atendimento, vendas e inteligência artificial.",
  path: "/contato",
});
export default function ContatoPage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Vamos conversar"
        title={
          <>
            O próximo passo começa
            <br />
            com a sua operação.
          </>
        }
        description="Conte como sua empresa atende e vende. Mostramos como a Altum pode conectar o que já acontece no seu dia a dia."
      />
      <Suspense
        fallback={
          <p className="px-6 py-16 text-center text-slate-600" role="status">
            Preparando o formulário…
          </p>
        }
      >
        <CommercialContactForm />
      </Suspense>
    </SiteShell>
  );
}
