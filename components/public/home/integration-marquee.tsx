"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useInView } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Pause, Play } from "lucide-react";
import {
  SiWhatsapp,
  SiInstagram,
  SiMessenger,
  SiMeta,
  SiGoogleads,
  SiShopify,
  SiWoocommerce,
  SiVtex,
} from "react-icons/si";
import styles from "../public-site.module.css";

const integrations = [
  {
    name: "WhatsApp",
    Icon: SiWhatsapp,
    color: "#008b52",
    category: "Conversas",
  },
  {
    name: "Instagram",
    Icon: SiInstagram,
    color: "#c13584",
    category: "Conversas",
  },
  {
    name: "Messenger",
    Icon: SiMessenger,
    color: "#087bfa",
    category: "Conversas",
  },
  { name: "Meta Ads", Icon: SiMeta, color: "#0866ff", category: "Campanhas" },
  {
    name: "Google Ads",
    Icon: SiGoogleads,
    color: "#4285f4",
    category: "Campanhas",
  },
  {
    name: "Shopify",
    Icon: SiShopify,
    color: "#6b942e",
    category: "E-commerce",
  },
  {
    name: "WooCommerce",
    Icon: SiWoocommerce,
    color: "#873eff",
    category: "E-commerce",
  },
  { name: "Nuvemshop", Icon: null, color: "#2453de", category: "E-commerce" },
  { name: "VTEX", Icon: SiVtex, color: "#ed125f", category: "Via webhook" },
];

export function IntegrationMarquee() {
  const root = useRef<HTMLElement>(null);
  const visible = useInView(root, { amount: 0.1 });
  const [playing, setPlaying] = useState(true);
  return (
    <section
      ref={root}
      className={styles.integrationBand}
      aria-label="Integrações da Altum"
    >
      <div className={`${styles.container} ${styles.integrationIntro}`}>
        <div>
          <p className={styles.eyebrow}>Seu ecossistema, conectado</p>
          <h2>
            As ferramentas que você usa.
            <br />O contexto que sua equipe precisa.
          </h2>
        </div>
        <Link href="/integracoes" className={styles.textLink}>
          Conhecer integrações <ArrowRight size={17} />
        </Link>
      </div>
      <div className={styles.logoWindow}>
        <div className={styles.logoTrack} data-paused={!playing || !visible}>
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className={styles.logoGroup}
              aria-hidden={copy === 1 ? true : undefined}
            >
              {integrations.map(({ name, Icon, color, category }) => (
                <div
                  key={name}
                  className={styles.logoTile}
                  style={{ "--platform-color": color } as CSSProperties}
                >
                  <div>
                    {Icon && <Icon aria-hidden="true" />}
                    <strong>{name}</strong>
                  </div>
                  <small>{category}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.container} ${styles.integrationFoot}`}>
        <p>
          A disponibilidade depende do plano, das permissões e da configuração
          de cada conexão.
        </p>
        <button
          type="button"
          className={styles.logoMotionToggle}
          onClick={() => setPlaying((value) => !value)}
          aria-pressed={!playing}
          aria-label={
            playing
              ? "Pausar movimento das integrações"
              : "Reproduzir movimento das integrações"
          }
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? "Pausar logos" : "Reproduzir logos"}
        </button>
      </div>
    </section>
  );
}
