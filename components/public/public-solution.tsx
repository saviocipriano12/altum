import Link from "next/link";
import type { PublicSolution } from "@/lib/public-solutions";
import { publicSolutions } from "@/lib/public-solutions";
import { SiteShell } from "./site-shell";
import { PublicHero, PublicFaq, PublicCta } from "./shared/public-sections";
import styles from "./public-site.module.css";

export function PublicSolutionPage({ solution }: { solution: PublicSolution }) {
  return (
    <SiteShell>
      <PublicHero
        eyebrow={solution.name}
        title={solution.title}
        description={solution.answer}
        breadcrumbs={[
          { name: "Início", href: "/" },
          { name: "Soluções", href: "/solucoes" },
          { name: solution.name, href: `/solucoes/${solution.slug}` },
        ]}
      />
      <section className={styles.section}>
        <div className={styles.container}>
          <h2>Como o fluxo funciona na prática</h2>
          <div className={styles.valueGrid}>
            {solution.workflow.map((step) => (
              <article className={styles.valueCard} key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <Link className={styles.textLink} href={step.href}>
                  {step.label} →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className={`${styles.section} ${styles.plansSection}`}>
        <div className={styles.container}>
          <h2>O que conferir na demonstração</h2>
          <ul className={styles.checkList}>
            {solution.evaluation.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p>
            Traga um exemplo da sua operação. Confira usuários, canais,
            mensagens, créditos de IA e implantação antes de escolher.
          </p>
          <div className={styles.actions}>
            <Link href="/precos" className={styles.button}>
              Comparar planos e condições
            </Link>
            <Link
              href="/blog/como-escolher-crm-com-ia"
              className={styles.secondaryButton}
            >
              Como avaliar um CRM com IA
            </Link>
          </div>
        </div>
      </section>
      <PublicFaq items={solution.questions} />
      <section className={styles.section}>
        <div className={styles.container}>
          <h2>Outros cenários de uso</h2>
          <div className={styles.actions}>
            {publicSolutions
              .filter((item) => item.slug !== solution.slug)
              .map((item) => (
                <Link
                  href={`/solucoes/${item.slug}`}
                  key={item.slug}
                  className={styles.textLink}
                >
                  {item.name} →
                </Link>
              ))}
          </div>
        </div>
      </section>
      <PublicCta
        title="Veja o seu processo dentro da Altum."
        description="Apresente seus canais, sua equipe e um exemplo de atendimento. Vamos avaliar o fluxo e as configurações necessárias."
      />
    </SiteShell>
  );
}
