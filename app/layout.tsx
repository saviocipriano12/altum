import "./globals.css";
import { Inter } from "next/font/google";
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

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.altumia.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  title: {
    default: "ALTUM | CRM, atendimento e automação de vendas com IA",
    template: "%s | ALTUM",
  },
  description:
    "Centralize CRM, atendimento, pipeline, follow-ups, automações e inteligência artificial em uma plataforma criada para transformar conversas em vendas.",
  openGraph: {
    title: "ALTUM | Plataforma de vendas e relacionamento com IA",
    description:
      "Centralize atendimento, CRM, pipeline, follow-ups e automações para organizar a operação comercial e transformar conversas em vendas.",
    url: SITE_URL,
    siteName: "ALTUM",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTUM | Plataforma de vendas e relacionamento com IA",
    description:
      "CRM, atendimento, pipeline, follow-ups, automações e IA em uma única operação comercial.",
  },
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#151419",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteUrl = getSiteUrl();
  const socialLinks = getSocialLinksFromEnv();
  const organizationSchema = buildOrganizationSchema({
    siteUrl,
    name: "ALTUM",
    logoPath: process.env.NEXT_PUBLIC_SITE_LOGO_PATH ?? "/logo-a.png",
    socialLinks,
  });
  const webSiteSchema = buildWebSiteSchema({ siteUrl, name: "ALTUM" });
  const softwareApplicationSchema = buildSoftwareApplicationSchema({
    siteUrl,
    name: "ALTUM",
    description:
      "Plataforma de vendas e relacionamento que centraliza CRM, atendimento, pipeline, follow-ups, automações e inteligência artificial.",
  });

  return (
    <html lang="pt-BR" className="scroll-smooth">
      <body
        className={`${inter.className} bg-[#0B0B0B] text-white antialiased selection:bg-[#F56E0F] selection:text-white`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(organizationSchema)} />
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(webSiteSchema)} />
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(softwareApplicationSchema)} />
        <Suspense fallback={null}>
          <TrackingScripts />
        </Suspense>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
