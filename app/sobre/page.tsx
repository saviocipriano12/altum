import type { Metadata } from "next";
import { MessagesSquare, Workflow, UsersRound, Sparkles } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import {
  PublicHero,
  PublicSectionHeading,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { buildMarketingMetadata, SITE_URL } from "@/lib/public-site";
import { toJsonLdScript } from "@/lib/schema";
import styles from "@/components/public/public-site.module.css";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Sobre a Altum",
  description:
    "Conheça a Altum, plataforma de operação comercial com IA que conecta atendimento, clientes, oportunidades e próximas ações.",
  path: "/sobre",
});
export default function SobrePage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Sobre a Altum"
        title={
          <>
            Boas conversas abrem portas.
            <br />
            Uma boa operação mantém abertas.
          </>
        }
        description="A Altum conecta atendimento, vendas e inteligência para o contexto continuar acompanhando cada oportunidade."
      />
      <section className={styles.section}>
        <div className={`${styles.container} ${styles.aboutIntro}`}>
          <div className={styles.aboutArt} aria-hidden>
            <span>
              <MessagesSquare />
            </span>
          </div>
          <div data-reveal>
            <p className={styles.eyebrow}>Por que a Altum existe</p>
            <h2>Para a venda continuar depois da primeira mensagem.</h2>
            <p>
              Quando uma informação fica no WhatsApp, outra na planilha e outra
              com o vendedor, acompanhar o cliente vira um esforço extra. A
              Altum aproxima essas partes em uma operação comercial com IA.
            </p>
            <p>
              Conversas, clientes, oportunidades e próxima ação compartilham
              contexto. A equipe atende com mais clareza e a gestão encontra
              informações para decidir.
            </p>
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="O que orienta o produto"
            title="Tecnologia que faz sentido na rotina."
          />
          <div className={styles.valueGrid}>
            {[
              [
                Workflow,
                "Continuidade",
                "Do primeiro contato ao acompanhamento, a informação precisa continuar útil.",
              ],
              [
                UsersRound,
                "Pessoas no controle",
                "A IA apoia o trabalho. A equipe define o processo e assume quando necessário.",
              ],
              [
                Sparkles,
                "Inteligência aplicada",
                "O valor da IA aparece quando ela ajuda a responder, organizar e decidir melhor.",
              ],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Workflow;
              return (
                <article
                  className={styles.valueCard}
                  key={String(title)}
                  data-reveal
                >
                  <I size={25} />
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      <PublicCta
        title="Conheça a Altum no seu contexto."
        description="Conte como sua empresa atende e vende. Vamos mostrar onde a plataforma pode ajudar."
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={toJsonLdScript({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          url: `${SITE_URL}/sobre`,
          name: "Sobre a Altum",
          about: {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "ALTUM",
            url: SITE_URL,
          },
        })}
      />
    </SiteShell>
  );
}
