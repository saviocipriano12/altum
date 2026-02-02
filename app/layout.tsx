import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext"; // 1. Adicione este import
/* ---------------- Font ---------------- */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"], // Adicionei 800 para os títulos extra-bold
});

/* ---------------- Metadata (SEO + OpenGraph + Twitter) ---------------- */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "ALTUM | Engenharia de Vendas High-Ticket",
    template: "%s • ALTUM",
  },
  description:
    "Instalamos a máquina que filtra curiosos e agenda reuniões reais. Método ALTUM para escalar vendas de Alto Ticket com IA.",
  keywords: ["Engenharia de Vendas", "High Ticket", "Trafego Pago", "Inteligencia Artificial", "Vendas B2B"],
  openGraph: {
    title: "ALTUM | Engenharia de Vendas High-Ticket",
    description:
      "Pare de perder tempo com curiosos. Atraia, filtre e agende reuniões apenas com quem tem orçamento.",
    url: "https://altum.ag",
    siteName: "ALTUM",
    images: [
      {
        url: "/og-altum.jpg", // Certifique-se de que essa imagem existe na pasta public
        width: 1200,
        height: 630,
        alt: "ALTUM - Engenharia de Vendas",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTUM | Engenharia de Vendas High-Ticket",
    description: "Instalamos a máquina que filtra curiosos e agenda reuniões reais.",
    images: ["/og-altum.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  themeColor: "#151419", // Atualizado para Dark Void (Preto da marca)
  manifest: "/site.webmanifest",
};

/* ---------------- Layout ---------------- */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="scroll-smooth">
      <body
        className={`${inter.className} bg-[#0B0B0B] text-white antialiased selection:bg-[#F56E0F] selection:text-white`}
      >
        {/* 2. Envolva o children com o AuthProvider */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}