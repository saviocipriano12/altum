import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import styles from "../public-site.module.css";
export function PublicHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.pageHero}>
      <div className={styles.container}>
        <p className={styles.eyebrow}>
          <span />
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p className={styles.heroDescription}>{description}</p>
        {children}
      </div>
    </section>
  );
}
export function PublicSectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
}) {
  return (
    <div className={styles.sectionHeading} data-reveal>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}
export function PublicFaq({
  items,
  title = "Uma boa decisão começa sem dúvidas.",
}: {
  title?: string;
  items: readonly (readonly [string, string])[];
}) {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <div data-reveal>
          <p className={styles.eyebrow}>Perguntas frequentes</p>
          <h2>{title}</h2>
          <p className={styles.muted}>Quer conversar sobre o seu cenário?</p>
          <Link href="/contato" className={styles.textLink}>
            Fale com a Altum <ArrowRight size={17} />
          </Link>
        </div>
        <div className={styles.faqList}>
          {items.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={20} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
export function PublicCta({
  title = "Sua próxima venda merece uma operação melhor.",
  description = "Veja como conversas, oportunidades e IA podem trabalhar juntas na sua empresa.",
  href = "/contato?interest=demonstracao",
  label = "Agendar demonstração",
}: {
  title?: string;
  description?: string;
  href?: string;
  label?: string;
}) {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.closingCta}`} data-reveal>
        <div>
          <p className={styles.eyebrow}>
            <Sparkles size={14} />
            Vamos colocar em prática
          </p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Link href={href} className={styles.button}>
          {label}
          <span>
            <ArrowRight size={18} />
          </span>
        </Link>
      </div>
    </section>
  );
}
