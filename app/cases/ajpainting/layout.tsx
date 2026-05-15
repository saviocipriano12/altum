import type { Metadata } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Case AJ Painting | ALTUM",
  description:
    "Case de pagina de alta conversao para servicos de pintura residencial, comercial e industrial.",
  alternates: {
    canonical: `${SITE_URL}/cases/ajpainting`,
  },
  openGraph: {
    type: "article",
    title: "Case AJ Painting | ALTUM",
    description:
      "Exemplo de estrutura de captacao e conversao para empresa de painting e cleaning nos EUA.",
    url: `${SITE_URL}/cases/ajpainting`,
  },
};

export default function AjPaintingCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
