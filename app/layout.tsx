import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";

/* ---------------- Font ---------------- */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/* ---------------- Metadata (SEO + OpenGraph + Twitter) ---------------- */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "ALTUM — Do Alto nasce a inovação",
    template: "%s • ALTUM",
  },
  description:
    "Sites e LPs premium, automações com n8n/WhatsApp e agentes de IA que vendem.",
  openGraph: {
    title: "ALTUM — Do Alto nasce a inovação",
    description:
      "Sites e LPs premium, automações com n8n/WhatsApp e agentes de IA que vendem.",
    url: "https://altum.ag",
    siteName: "ALTUM",
    images: [
      {
        url: "/og-altum.jpg",
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
    title: "ALTUM — Do Alto nasce a inovação",
    description: "Sites e LPs premium, automações e IA.",
    images: ["/og-altum.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  themeColor: "#0B1220",
  manifest: "/site.webmanifest",
};

/* ---------------- Layout ---------------- */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className={`${inter.className} bg-[color:var(--blue-900)] text-white antialiased selection:bg-[color:var(--gold)]/30`}
      >
        {children}
      </body>
    </html>
  );
}
