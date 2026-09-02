import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { buildOrganizationSchema, getSiteUrl, getSocialLinksFromEnv, toJsonLdScript } from "@/lib/schema";
import { TrackingScripts } from "@/components/analytics/TrackingScripts";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag"),
  applicationName: "ALTUM",
  title: {
    default: "ALTUM | Operacao Comercial com IA",
    template: "%s | ALTUM",
  },
  description:
    "Conversas, clientes, oportunidades, agenda e IA em uma plataforma para responder melhor, vender mais e acompanhar tudo em um so lugar.",
  keywords: ["Operacao comercial com IA", "CRM", "WhatsApp", "Plataforma de vendas", "Atendimento"],
  openGraph: {
    title: "ALTUM | Operacao Comercial com IA",
    description:
      "Conversas, clientes, oportunidades, agenda e IA em uma plataforma para responder melhor, vender mais e acompanhar tudo em um so lugar.",
    url: "https://altum.ag",
    siteName: "ALTUM",
    images: [
      {
        url: "/logo-a.png",
        width: 1200,
        height: 630,
        alt: "ALTUM",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTUM | Operacao Comercial com IA",
    description:
      "Conversas, clientes, oportunidades, agenda e IA em uma plataforma para responder melhor, vender mais e acompanhar tudo em um so lugar.",
    images: ["/logo-a.png"],
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

  return (
    <html lang="pt-BR" className="scroll-smooth" data-scroll-behavior="smooth">
      <body className="bg-[#04131f] font-sans text-white antialiased selection:bg-[#f97316] selection:text-white">
        <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(organizationSchema)} />
        <Suspense fallback={null}>
          <TrackingScripts />
        </Suspense>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
