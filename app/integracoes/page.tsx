import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import {
  SiWhatsapp,
  SiInstagram,
  SiMessenger,
  SiMeta,
  SiGoogleads,
  SiShopify,
  SiWoocommerce,
} from "react-icons/si";
import { SiteShell } from "@/components/public/site-shell";
import {
  PublicHero,
  PublicSectionHeading,
  PublicFaq,
  PublicCta,
} from "@/components/public/shared/public-sections";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";
import styles from "@/components/public/public-site.module.css";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Integrações",
  description:
    "Conecte WhatsApp, Instagram, mídia e e-commerce à operação comercial Altum. Conheça integrações e condições de disponibilidade.",
  path: "/integracoes",
});
const integrations = [
  {
    name: "WhatsApp",
    icon: SiWhatsapp,
    color: "#16a34a",
    group: "Conversas",
    text: "Atendimento, mensagens e histórico do cliente conectados à sua operação.",
    href: "/crm-para-whatsapp",
  },
  {
    name: "Instagram",
    icon: SiInstagram,
    color: "#c13584",
    group: "Conversas",
    text: "Mensagens e interações que podem continuar no atendimento e relacionamento.",
    href: "/automacao-instagram",
  },
  {
    name: "Messenger",
    icon: SiMessenger,
    color: "#1877f2",
    group: "Conversas",
    text: "Mensagens do Facebook junto da operação, conforme configuração do canal.",
    href: "/inbox",
  },
  {
    name: "Meta Ads",
    icon: SiMeta,
    color: "#0866ff",
    group: "Mídia e aquisição",
    text: "Métricas de campanhas para aproximar aquisição e acompanhamento comercial.",
    href: "/plataforma",
  },
  {
    name: "Google Ads",
    icon: SiGoogleads,
    color: "#4285f4",
    group: "Mídia e aquisição",
    text: "Dados de mídia para acompanhar a origem e os resultados da sua operação.",
    href: "/plataforma",
  },
  {
    name: "Shopify",
    icon: SiShopify,
    color: "#629f36",
    group: "E-commerce",
    text: "Clientes, pedidos e dados de comércio para dar contexto ao atendimento.",
    href: "/plataforma",
  },
  {
    name: "Nuvemshop",
    icon: ShoppingBag,
    color: "#2563eb",
    group: "E-commerce",
    text: "Uma conexão entre os dados da loja e o relacionamento com seus clientes.",
    href: "/plataforma",
  },
  {
    name: "WooCommerce",
    icon: SiWoocommerce,
    color: "#96588a",
    group: "E-commerce",
    text: "Dados de comércio conectados à operação, conforme configuração da loja.",
    href: "/plataforma",
  },
] as const;
const faq = [
  [
    "Todas as integrações estão disponíveis em qualquer plano?",
    "Não. A disponibilidade depende do plano, provedor, permissões e configuração do ambiente. A demonstração ajuda a confirmar quais conexões fazem sentido para sua operação.",
  ],
  [
    "Posso conectar o WhatsApp da minha empresa?",
    "Sim, conforme o provedor e a configuração do ambiente. A conexão permite aproximar atendimento, clientes e continuidade comercial.",
  ],
  [
    "Como funciona a conexão com Shopify?",
    "A implementação contempla autenticação, recebimento de atualizações e sincronização de dados de comércio, quando a loja e as permissões necessárias estão configuradas.",
  ],
  [
    "A Altum integra com Google Calendar?",
    "A Altum possui agenda interna. A integração completa com Google Calendar depende da disponibilidade e configuração do ambiente; não é uma conexão geral garantida.",
  ],
] as const;
export default function IntegracoesPage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Integrações Altum"
        title={
          <>
            Suas ferramentas conectadas.
            <br />
            Seu contexto preservado.
          </>
        }
        description="Aproxime conversas, campanhas e comércio da sua operação. Para a informação continuar útil depois de cada conexão."
      />
      <section className={styles.section}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="Um ecossistema, mais continuidade"
            title="A operação acontece em vários canais. O contexto pode ficar junto."
          />
          <div className={styles.integrationGrid}>
            {integrations.map((item) => (
              <article
                key={item.name}
                className={styles.integrationCard}
                data-reveal
              >
                <item.icon style={{ color: item.color }} aria-hidden />
                <h3>{item.name}</h3>
                <small>{item.group}</small>
                <p>{item.text}</p>
                <Link href={item.href} className={styles.textLink}>
                  Ver na operação <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
          <p className={styles.pricingNote}>
            A disponibilidade de cada integração depende do plano, provedor,
            permissões e etapa de implantação. Confirme o escopo para sua
            empresa antes de contratar.
          </p>
        </div>
      </section>
      <PublicFaq items={faq} />
      <PublicCta
        title="Vamos conectar o que faz sentido para você?"
        description="Conte quais canais e ferramentas sua empresa já usa. Avaliamos o caminho para uma operação mais conectada."
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={toJsonLdScript(
          buildFaqSchema(
            faq.map(([question, answer]) => ({ question, answer })),
          ),
        )}
      />
    </SiteShell>
  );
}
