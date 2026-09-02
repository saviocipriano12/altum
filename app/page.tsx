import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import { ProductHome } from "@/components/public/home/product-home";
import { buildMarketingMetadata } from "@/lib/public-site";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-altum-public",
  display: "swap",
});

export const metadata: Metadata = buildMarketingMetadata({
  title: "Operação comercial com IA",
  description:
    "Conversas, clientes, oportunidades, agenda e IA em uma plataforma feita para sua equipe responder melhor, vender mais e acompanhar tudo em um só lugar.",
  path: "/",
});

export default function HomePage() {
  return (
    <main className={`${manrope.variable} bg-black font-[family-name:var(--font-altum-public)] text-[#f9f9f9]`}>
      <ProductHome />
    </main>
  );
}
