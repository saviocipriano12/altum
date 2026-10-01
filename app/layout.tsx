import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/context/AuthContext"; // 1. Adicione este import
import { buildOrganizationSchema, getSiteUrl, getSocialLinksFromEnv, toJsonLdScript } from "@/lib/schema";
import { TrackingScripts } from "@/components/analytics/TrackingScripts";
/* ---------------- Font ---------------- */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"], // Adicionei 800 para os títulos extra-bold
});

/* ---------------- Metadata (SEO + OpenGraph + Twitter) ---------------- */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  title: {
    default: "ALTUM | Plataforma de Vendas e Relacionamento com IA",
    template: "%s • ALTUM",
  },
  description:
    "Centralize CRM, WhatsApp, Instagram, atendimento, IA, automações, pipeline, campanhas e métricas em uma operação comercial conectada.",
  keywords: ["CRM", "WhatsApp", "Instagram", "Automação de Vendas", "Inteligência Artificial", "Atendimento", "Vendas B2B"],
  openGraph: {
    title: "ALTUM | Plataforma de Vendas e Relacionamento com IA",
    description:
      "Centralize CRM, canais de atendimento, IA e automações para operar vendas e relacionamento em um só lugar.",
    url: "https://www.altumia.com.br",
    siteName: "ALTUM",
    images: [
      {
        url: "/og-altum.jpg", // Certifique-se de que essa imagem existe na pasta public
        width: 1200,
        height: 630,
        alt: "ALTUM - Plataforma de Vendas e Relacionamento com IA",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTUM | Plataforma de Vendas e Relacionamento com IA",
    description: "CRM, canais, IA e automações conectados para sua operação comercial.",
    images: ["/og-altum.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#151419",
};

/* ---------------- Layout ---------------- */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteUrl = getSiteUrl();
  const organizationSchema = buildOrganizationSchema({
    siteUrl,
    name: "ALTUM",
    logoPath: process.env.NEXT_PUBLIC_SITE_LOGO_PATH ?? "/logo-a.png",
    socialLinks: getSocialLinksFromEnv(),
  });

  return (
    <html lang="pt-BR" className="scroll-smooth">
      <body
        className={`${inter.className} bg-[#0B0B0B] text-white antialiased selection:bg-[#F56E0F] selection:text-white`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(organizationSchema)} />
        <Suspense fallback={null}>
          <TrackingScripts />
        </Suspense>
        {/* 2. Envolva o children com o AuthProvider */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
