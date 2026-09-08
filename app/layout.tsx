import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/context/AuthContext";
import {
  buildOrganizationSchema,
  buildSoftwareApplicationSchema,
  buildWebSiteSchema,
  getSiteUrl,
  getSocialLinksFromEnv,
  toJsonLdScript,
} from "@/lib/schema";
import { TrackingScripts } from "@/components/analytics/TrackingScripts";

const PUBLIC_SITE_URL = "https://www.altumia.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? PUBLIC_SITE_URL),
  applicationName: "ALTUM",
  alternates: {
    canonical: "/",
  },
  title: {
    default: "ALTUM | Plataforma de Vendas e Relacionamento com IA",
    template: "%s | ALTUM",
  },
  description:
    "Centralize atendimento, CRM, pipeline, automacoes, follow-up e inteligencia artificial em uma unica operacao comercial.",
  keywords: [
    "plataforma de vendas com IA",
    "CRM com IA",
    "CRM para WhatsApp",
    "automacao comercial",
    "atendimento com IA",
    "pipeline de vendas",
  ],
  openGraph: {
    title: "ALTUM | Plataforma de Vendas e Relacionamento com IA",
    description:
      "Atendimento, CRM, pipeline, automacoes, follow-up e IA trabalhando juntos para transformar conversas em vendas.",
    url: PUBLIC_SITE_URL,
    siteName: "ALTUM",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTUM | Plataforma de Vendas e Relacionamento com IA",
    description:
      "Atendimento, CRM, pipeline, automacoes, follow-up e IA em uma unica operacao comercial.",
  },
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = {
  themeColor: "#04131f",
};

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
  const websiteSchema = buildWebSiteSchema({
    siteUrl,
    name: "ALTUM",
    description:
      "Plataforma de vendas e relacionamento com IA para centralizar atendimento, CRM, pipeline e automacoes.",
  });
  const softwareSchema = buildSoftwareApplicationSchema({
    siteUrl,
    name: "ALTUM",
    description:
      "Plataforma de vendas e relacionamento com CRM, inbox, pipeline, automacoes, follow-up e inteligencia artificial.",
  });

  return (
    <html lang="pt-BR" className="scroll-smooth" data-scroll-behavior="smooth">
      <body className="bg-[#04131f] font-sans text-white antialiased selection:bg-[#f97316] selection:text-white">
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(organizationSchema)} />
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(websiteSchema)} />
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(softwareSchema)} />
        <Suspense fallback={null}>
          <TrackingScripts />
        </Suspense>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
