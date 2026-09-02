import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { DiagnosticWizard } from "@/components/public/diagnostic-wizard";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Diagnóstico comercial",
  description:
    "Diagnóstico da Altum para identificar o melhor ponto de entrada entre plataforma, implantação, automações, canais e inteligência comercial.",
  path: "/diagnostico",
});

export default function DiagnosticoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#0b0b0b] text-white">
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,110,15,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.10),transparent_22%),linear-gradient(180deg,#0b0b0b_0%,#111111_100%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 pb-6">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <Image src="/logo-a.png" alt="Logo Altum" width={44} height={44} className="h-11 w-11 rounded-2xl" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">ALTUM</p>
                <p className="text-sm font-semibold text-white/90">Diagnóstico comercial</p>
              </div>
            </Link>

            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white/78 transition hover:border-white/22 hover:text-white"
            >
              Voltar para o site
            </Link>
          </div>

          <div className="flex flex-1 items-center">
            <div className="mx-auto w-full max-w-6xl">
              <DiagnosticWizard />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
