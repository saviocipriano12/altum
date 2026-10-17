import type { Metadata } from "next";

import { ProductHome } from "@/components/public/home/product-home";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "CRM com IA para WhatsApp, Instagram e vendas",
  description:
    "Conversas, clientes, oportunidades, agenda e IA em uma plataforma feita para sua equipe responder melhor, vender mais e acompanhar tudo em um só lugar.",
  path: "/",
});

export default function HomePage() {
  return <ProductHome />;
}
