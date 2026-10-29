import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CalendarClock,
  Megaphone,
  PackageSearch,
  BarChart3,
  Mic2,
  Video,
} from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import {
  PublicHero,
  PublicSectionHeading,
  PublicFaq,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { AltumLiveDemo } from "@/components/public/home/altum-live-demo";
import { ProductPreview } from "@/components/public/home/product-preview";
import { buildMarketingMetadata } from "@/lib/public-site";
import styles from "@/components/public/public-site.module.css";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Plataforma de atendimento, CRM e vendas com IA",
  description:
    "Conheça a Altum: conversas, clientes, oportunidades, agenda, campanhas, e-commerce, relatórios e IA em uma operação comercial conectada.",
  path: "/plataforma",
});
const features = [
  {
    eyebrow: "Atender com contexto",
    title: "A conversa continua. O histórico também.",
    text: "Reúna o atendimento e mantenha as informações do cliente por perto. A equipe encontra contexto para responder, transferir e acompanhar cada contato.",
    preview: "conversations",
    bullets: [
      "WhatsApp, Instagram e entradas do site",
      "Histórico e responsável pelo atendimento",
      "IA com transferência para uma pessoa",
    ],
    href: "/inbox",
  },
  {
    eyebrow: "Organizar para vender",
    title: "Toda oportunidade merece um próximo passo.",
    text: "Visualize as negociações em um funil. Etapa, responsável, proposta e próxima ação acompanham o cliente sem se perder entre controles separados.",
    preview: "pipeline",
    bullets: [
      "Clientes e oportunidades no mesmo contexto",
      "Pipeline, propostas e acompanhamento financeiro",
      "Agenda e follow-up ligados à negociação",
    ],
    href: "/crm",
  },
  {
    eyebrow: "Decidir com inteligência",
    title: "Pergunte. Entenda. Encontre onde agir.",
    text: "O Assistente Altum apoia a operação com contexto do negócio. Use a IA para orientar respostas, resumir conversas e analisar prioridades da conta.",
    preview: "assistant",
    bullets: [
      "Base de conhecimento do seu negócio",
      "Recomendações e resumos com contexto",
      "Controle humano e regras da operação",
    ],
    href: "/ia-para-vendas",
  },
] as const;
export default function PlataformaPage() {
  return (
    <SiteShell>
      <PublicHero
        breadcrumbs={[
          { name: "Início", href: "/" },
          { name: "Plataforma", href: "/plataforma" },
        ]}
        eyebrow="Altum Plataforma"
        title={
          <>
            O contexto acompanha a conversa.
            <br />A inteligência acompanha você.
          </>
        }
        description="Atendimento, vendas e gestão compartilham o mesmo caminho. Uma plataforma para responder, vender, acompanhar e decidir."
      >
        <div className={styles.actions}>
          <Link href="/contato?interest=demonstracao" className={styles.button}>
            Ver uma demonstração
            <span>
              <ArrowRight size={18} />
            </span>
          </Link>
          <Link href="/precos" className={styles.secondaryButton}>
            Conhecer planos
          </Link>
        </div>
      </PublicHero>
      <section className={styles.section}>
        <div className={`${styles.container} ${styles.featureRows}`}>
          {features.map((feature) => (
            <article
              key={feature.title}
              className={styles.featureRow}
              data-reveal
            >
              <div>
                <p className={styles.eyebrow}>{feature.eyebrow}</p>
                <h2>{feature.title}</h2>
                <p>{feature.text}</p>
                <ul className={styles.checkList}>
                  {feature.bullets.map((item) => (
                    <li key={item}>
                      <Check size={14} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={feature.href} className={styles.textLink}>
                  Conhecer o recurso <ArrowRight size={17} />
                </Link>
              </div>
              <div className={styles.featureImage}>
                <ProductPreview view={feature.preview} />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.section} style={{ background: "#f5f5f4" }}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="O restante da operação também se conecta"
            title="Da próxima ação à próxima venda."
          />
          <div className={styles.valueGrid}>
            {[
              [
                CalendarClock,
                "Agenda e follow-up",
                "Reuniões, tarefas e retornos ligados à rotina comercial.",
              ],
              [
                Megaphone,
                "Campanhas e aquisição",
                "Origem dos contatos, mídia e relacionamento mais próximos do funil.",
              ],
              [
                PackageSearch,
                "Produtos e e-commerce",
                "Catálogo, atendimento e dados de comércio conectados quando configurados.",
              ],
              [
                BarChart3,
                "Relatórios",
                "Visibilidade de atendimento, oportunidades e resultados.",
              ],
              [
                Mic2,
                "Voz no WhatsApp",
                "Respostas em áudio conforme a configuração e a forma de atender.",
              ],
              [
                Video,
                "Reuniões assistidas",
                "Contexto, apoio e resumos comerciais conforme disponibilidade do ambiente.",
              ],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof CalendarClock;
              return (
                <article
                  key={String(title)}
                  className={styles.valueCard}
                  data-reveal
                >
                  <I size={24} />
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </article>
              );
            })}
          </div>
          <p className={styles.pricingNote}>
            Recursos e integrações variam por plano, permissões e configuração.
            Na demonstração, mostramos o que se aplica ao seu cenário.
          </p>
        </div>
      </section>
      <AltumLiveDemo />
      <PublicFaq
        items={[
          [
            "Preciso substituir todas as minhas ferramentas?",
            "A Altum pode se conectar aos canais e plataformas disponíveis para sua operação. Avaliamos suas ferramentas para definir o que centralizar e o que integrar.",
          ],
          [
            "Como minha equipe começa a usar?",
            "Você pode começar por um plano elegível para teste ou com implantação assistida, que organiza equipe, canais, funil e conhecimento da IA.",
          ],
          [
            "Onde vejo as integrações disponíveis?",
            "A página de Integrações apresenta as conexões e as condições de configuração. A disponibilidade concreta depende de plano, conta e permissões.",
          ],
        ]}
      />
      <PublicCta />
    </SiteShell>
  );
}
