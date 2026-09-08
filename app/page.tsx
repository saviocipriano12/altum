import type { Metadata } from "next";

import { ProductHome } from "@/components/public/home/product-home";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Operação comercial com IA",
  description:
    "Conversas, clientes, oportunidades, agenda e IA em uma plataforma feita para sua equipe responder melhor, vender mais e acompanhar tudo em um só lugar.",
  path: "/",
});

export default function HomePage() {
  return (
    <main className="font-[family-name:var(--font-altum-public)] text-[#f9f9f9]">
      <ProductHome />
    </main>
  );
}
