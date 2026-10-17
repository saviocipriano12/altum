import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiInstagram, SiX, SiYoutube } from "react-icons/si";
import { FaLinkedinIn } from "react-icons/fa6";
import { ALTUM_SOCIAL_PROFILES } from "@/lib/public-social";
import styles from "../public-site.module.css";

const icons = {
  instagram: SiInstagram,
  x: SiX,
  linkedin: FaLinkedinIn,
  youtube: SiYoutube,
};
export function SocialSection() {
  return (
    <section
      className={styles.socialSection}
      aria-labelledby="altum-social-title"
    >
      <div className={styles.container}>
        <div className={styles.socialIntro} data-reveal>
          <div>
            <p className={styles.eyebrow}>A conversa continua</p>
            <h2 id="altum-social-title">
              A Altum também está
              <br />
              <em>onde as ideias circulam.</em>
            </h2>
          </div>
          <p>Escolha sua rede e acompanhe nossos canais oficiais.</p>
        </div>
        <div className={styles.socialGrid}>
          {ALTUM_SOCIAL_PROFILES.map((profile) => {
            const Icon = icons[profile.id];
            return (
              <a
                key={profile.id}
                href={profile.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialCard}
                style={{ "--social-color": profile.color } as CSSProperties}
                aria-label={`${profile.description} Abre em nova aba.`}
              >
                <div>
                  <Icon aria-hidden="true" />
                  <ArrowUpRight size={21} aria-hidden="true" />
                </div>
                <h3>{profile.name}</h3>
                <strong>{profile.handle}</strong>
                <p>{profile.description}</p>
                <span>
                  Acompanhar <ArrowUpRight size={15} />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
