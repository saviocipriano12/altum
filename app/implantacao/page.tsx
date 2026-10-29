import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Settings2,
  PlugZap,
  Sparkles,
  Rocket,
} from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import {
  PublicHero,
  PublicSectionHeading,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { buildMarketingMetadata } from "@/lib/public-site";
import styles from "@/components/public/public-site.module.css";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Implantação",
  description:
    "Implantação assistida Altum para configurar equipe, canais, funil, catálogo e inteligência artificial e orientar seu time.",
  path: "/implantacao",
});
const phases = [
  {
    icon: Settings2,
    title: "Entender sua forma de vender",
    text: "Oferta, público, ciclo de venda, canais e responsabilidades orientam a configuração.",
  },
  {
    icon: PlugZap,
    title: "Conectar a operação",
    text: "Equipe, permissões, canais e integrações contratadas são organizados para começar.",
  },
  {
    icon: Sparkles,
    title: "Dar contexto à inteligência",
    text: "Base de conhecimento, tom de voz, regras comerciais e escaladas orientam a IA.",
  },
  {
    icon: Rocket,
    title: "Começar com acompanhamento",
    text: "Validamos os fluxos e orientamos o time para os primeiros dias de operação.",
  },
];
const deliverables = [
  "Usuários e permissões iniciais",
  "Pipeline alinhado ao processo comercial",
  "Canais e integrações contratadas",
  "Catálogo de produtos ou serviços",
  "Base inicial de conhecimento da IA",
  "Regras de atendimento e escalada",
  "Agenda, tarefas e cadências comerciais",
  "Treinamento e entrada em operação assistida",
];
export default function ImplantacaoPage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Implantação Altum"
        title={
          <>
            Uma plataforma conectada.
            <br />
            Um time pronto para começar.
          </>
        }
        description="Transformamos o jeito como sua empresa atende e vende em uma configuração de equipe, canais, funil e inteligência artificial."
      >
        <div className={styles.actions}>
          <Link href="/contato?interest=implantacao" className={styles.button}>
            Planejar minha implantação
            <span>
              <ArrowRight size={18} />
            </span>
          </Link>
        </div>
      </PublicHero>
      <section className={styles.section}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="Um caminho claro"
            title="Da primeira conversa ao primeiro dia de operação."
          />
          <div
            className={styles.valueGrid}
            style={{
              gridTemplateColumns:
                "repeat(auto-fit,minmax(min(250px,100%),1fr))",
            }}
          >
            {phases.map((phase, index) => (
              <article
                key={phase.title}
                className={styles.valueCard}
                data-reveal
              >
                <phase.icon size={25} />
                <p
                  className={styles.eyebrow}
                  style={{ display: "block", marginTop: 25 }}
                >
                  Etapa 0{index + 1}
                </p>
                <h3>{phase.title}</h3>
                <p>{phase.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className={styles.section} style={{ background: "#f5f5f4" }}>
        <div className={`${styles.container} ${styles.aboutIntro}`}>
          <div data-reveal>
            <p className={styles.eyebrow}>Estrutura para trabalhar</p>
            <h2>O que entra na configuração inicial.</h2>
            <p className={styles.muted}>
              O escopo é definido conforme o plano e a proposta. Seu time
              aprende a operar com responsabilidades e próximos passos claros.
            </p>
          </div>
          <ul className={styles.checkList}>
            {deliverables.map((item) => (
              <li key={item}>
                <Check size={15} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <PublicCta
        href="/contato?interest=implantacao"
        label="Conversar sobre implantação"
        title="Vamos preparar a entrada da sua equipe?"
        description="Definimos prioridades, configuração e acompanhamento a partir da realidade da sua empresa."
      />
    </SiteShell>
  );
}
