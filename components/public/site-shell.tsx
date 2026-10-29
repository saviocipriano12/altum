import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { PublicHeader } from "./shared/public-header";
import { PublicMotion } from "./shared/public-motion";
import styles from "./public-site.module.css";
import { ALTUM_SOCIAL_PROFILES } from "@/lib/public-social";

const footerGroups = [
  {
    title: "Plataforma",
    links: [
      ["Conversas", "/inbox"],
      ["Clientes e oportunidades", "/crm"],
      ["Funil de vendas", "/pipeline"],
      ["IA e automações", "/ia-para-vendas"],
      ["Integrações", "/integracoes"],
    ],
  },
  {
    title: "Para sua empresa",
    links: [
      ["Soluções", "/solucoes"],
      ["Vendas por WhatsApp e Instagram", "/solucoes/whatsapp-e-instagram"],
      ["Clínicas e serviços", "/solucoes/clinicas-e-servicos"],
      ["E-commerce", "/solucoes/ecommerce"],
      ["Planos", "/precos"],
      ["Portfólio", "/portfolio"],
      ["Implantação", "/implantacao"],
      ["Conteúdos", "/blog"],
      ["Agência Altum", "/agencia"],
    ],
  },
  {
    title: "Vamos conversar",
    links: [
      ["Sobre a Altum", "/sobre"],
      ["Como escolher um CRM com IA", "/blog/como-escolher-crm-com-ia"],
      ["Agendar demonstração", "/contato?interest=demonstracao"],
      ["Falar com a Altum", "/contato"],
      ["Entrar na plataforma", "/cliente/login"],
    ],
  },
] as const;

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-altum-surface="public"
      data-public-redesign="true"
      className={styles.site}
    >
      <a className={styles.skipLink} href="#conteudo">
        Ir para o conteúdo
      </a>
      <PublicHeader />
      <PublicMotion className={styles.content}>{children}</PublicMotion>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <div>
              <p className={styles.eyebrow}>O próximo passo da sua operação</p>
              <h2>
                Mais conexão.
                <br />
                Mais espaço para crescer.
              </h2>
            </div>
            <Link
              href="/contato?interest=demonstracao"
              className={styles.button}
            >
              Conhecer a Altum{" "}
              <span>
                <ArrowRight size={18} />
              </span>
            </Link>
          </div>
          <div className={styles.footerGrid}>
            <div>
              <Link
                href="/"
                className={styles.brand}
                aria-label="Altum — início"
              >
                <Image src="/logo-a.png" alt="" width={36} height={36} />
                <span>
                  altum<span className={styles.brandDot}>.</span>
                </span>
              </Link>
              <p className={styles.footerDescription}>
                Conversas, clientes e inteligência.
                <br />
                Uma operação comercial conectada.
              </p>
              <div
                className={styles.footerSocials}
                aria-label="Redes sociais da Altum"
              >
                {ALTUM_SOCIAL_PROFILES.map((profile) => (
                  <a
                    key={profile.id}
                    href={profile.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${profile.name} da Altum — abre em nova aba`}
                  >
                    {profile.name} <ArrowRight size={12} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
            {footerGroups.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h3>{group.title}</h3>
                {group.links.map(([label, href]) => (
                  <Link href={href} key={href} prefetch={false}>
                    {label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
          <div className={styles.footerBottom}>
            <p>
              © {new Date().getFullYear()} Altum. Todos os direitos reservados.
            </p>
            <div>
              <Link href="/politica-de-privacidade">Privacidade</Link>
              <Link href="/termos">Termos de uso</Link>
              <Link href="/exclusao-de-dados">Seus dados</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
