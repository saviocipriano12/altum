import type { Metadata } from "next";
import { SiteShell } from "@/components/public/site-shell";
import { PricingPlans } from "@/components/public/pricing-plans";
import {
  PublicHero,
  PublicFaq,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { buildMarketingMetadata } from "@/lib/public-site";
import styles from "@/components/public/public-site.module.css";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Planos",
  description:
    "Compare os planos Altum para atendimento, CRM, agenda e inteligência artificial. Confira limites, teste gratuito e implantação.",
  path: "/precos",
});
const faq = [
  [
    "Posso começar sem implantação?",
    "Nos planos Operação e Escala, a implantação é obrigatória. Na Estrutura Assistida, o escopo é definido em proposta. O cartão de cada plano mostra a condição e o investimento correspondente.",
  ],
  [
    "A IA está incluída em todos os planos?",
    "O nível de inteligência, automações e volume de uso varia conforme o plano e a configuração contratada. Os créditos incluídos aparecem na comparação.",
  ],
  [
    "Como funciona o teste?",
    "Os planos elegíveis oferecem sete dias sem cartão, com limites controlados. Ao final do teste, o uso dos recursos operacionais depende de uma assinatura ativa.",
  ],
  [
    "Posso conectar mais canais ou ampliar a equipe?",
    "Sim, conforme a capacidade do plano e a disponibilidade dos adicionais. Nenhum adicional é contratado automaticamente: as condições são apresentadas antes do aceite.",
  ],
  [
    "O que acontece depois de escolher o plano?",
    "Nos planos com teste disponível, você segue para o cadastro com o plano selecionado. Nos demais, nossa equipe conversa sobre o cenário e prepara a proposta.",
  ],
] as const;
export default function PrecosPage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Planos Altum"
        title={
          <>
            Uma estrutura para começar.
            <br />
            Espaço para crescer.
          </>
        }
        description="Escolha a capacidade que faz sentido para o seu time. Conversas, clientes, agenda e IA conectados, com condições claras."
      />
      <section className={styles.section}>
        <div className={styles.container}>
          <PricingPlans comparison />
        </div>
      </section>
      <PublicFaq items={faq} />
      <PublicCta
        title="Vamos encontrar o plano para o seu momento?"
        description="Conte como sua empresa vende e quais canais usa. Mostramos uma configuração que faça sentido para sua rotina."
      />
    </SiteShell>
  );
}
