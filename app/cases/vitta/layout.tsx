import type { Metadata } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Case Vitta Prime | ALTUM",
  description:
    "Case de landing page para nutraceuticos e emagrecimento com foco em posicionamento premium e conversao.",
  alternates: {
    canonical: `${SITE_URL}/cases/vitta`,
  },
  openGraph: {
    type: "article",
    title: "Case Vitta Prime | ALTUM",
    description:
      "Exemplo de pagina premium para oferta de bem-estar e emagrecimento com narrativa orientada a resultados.",
    url: `${SITE_URL}/cases/vitta`,
  },
};

export default function VittaCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
