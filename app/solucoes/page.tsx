import Link from "next/link";
import { SiteShell } from "@/components/public/site-shell";
import {
  PublicHero,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { publicSolutions } from "@/lib/public-solutions";
import { buildMarketingMetadata } from "@/lib/public-site";
import { toJsonLdScript, getSiteUrl } from "@/lib/schema";
import styles from "@/components/public/public-site.module.css";

export const metadata = buildMarketingMetadata({
  title: "CRM com IA para empresas, clínicas e e-commerce",
  description:
    "Encontre o fluxo da Altum para vendas por WhatsApp e Instagram, clínicas, serviços e lojas virtuais. Veja usos, condições e o que avaliar na demonstração.",
  path: "/solucoes",
});

export default function SolucoesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Solucoes ALTUM",
    itemListElement: publicSolutions.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: `${getSiteUrl()}/solucoes/${item.slug}`,
    })),
  };

  return (
    <SiteShell>
      <PublicHero
        eyebrow="Soluções Altum"
        title="Um fluxo que faz sentido para a sua operação."
        description="A mesma plataforma conecta atendimento, clientes, oportunidades e IA. O processo, os canais e a configuração precisam acompanhar a forma como a sua empresa trabalha."
        breadcrumbs={[
          { name: "Início", href: "/" },
          { name: "Soluções", href: "/solucoes" },
        ]}
      />
      <section className={`${styles.section} ${styles.discoverySection}`}>
        <div className={styles.container}>
          <h2>Escolha o seu cenário</h2>
          <div className={styles.valueGrid}>
            {publicSolutions.map((solution) => (
              <article className={styles.valueCard} key={solution.slug}>
                <h3>
                  <Link href={`/solucoes/${solution.slug}`}>
                    {solution.name}
                  </Link>
                </h3>
                <p>{solution.description}</p>
                <Link
                  className={styles.textLink}
                  href={`/solucoes/${solution.slug}`}
                >
                  Ver o fluxo e as condições →
                </Link>
              </article>
            ))}
          </div>
          <div className={styles.actions}>
            <Link href="/precos" className={styles.secondaryButton}>
              Comparar planos
            </Link>
            <Link href="/integracoes" className={styles.secondaryButton}>
              Conferir integrações
            </Link>
          </div>
        </div>
      </section>
      <PublicCta title="Valide o fluxo com um exemplo da sua empresa." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={toJsonLdScript(jsonLd)}
      />
    </SiteShell>
  );
}
