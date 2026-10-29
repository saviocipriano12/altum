import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/public/site-shell";
import { DiagnosticWizard } from "@/components/public/diagnostic-wizard";
import { PublicHero } from "@/components/public/shared/public-sections";
import { buildMarketingMetadata } from "@/lib/public-site";
import styles from "@/components/public/public-site.module.css";
export const metadata: Metadata = buildMarketingMetadata({
  title: "Diagnóstico comercial",
  description:
    "Identifique o próximo passo para conectar atendimento, vendas e inteligência na sua empresa.",
  path: "/diagnostico",
});
export default function DiagnosticoPage() {
  return (
    <SiteShell>
      <PublicHero
        eyebrow="Diagnóstico comercial"
        title="Qual é o próximo passo da sua operação?"
        description="Responda sobre a sua rotina para encontrar o caminho de entrada na Altum."
      />
      <section className={styles.section}>
        <div className={styles.container}>
          <Suspense fallback={<p role="status">Preparando o diagnóstico…</p>}>
            <DiagnosticWizard />
          </Suspense>
        </div>
      </section>
    </SiteShell>
  );
}
