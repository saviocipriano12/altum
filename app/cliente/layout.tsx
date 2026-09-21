import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ClienteAppOpening } from "@/app/cliente/components/cliente-app-opening";
import ClientePanelGuard from "@/app/cliente/ClientePanelGuard";
import { ClienteFinanceScreenAlert } from "@/app/cliente/components/cliente-finance-screen-alert";
import { ClienteInstallBanner } from "@/app/cliente/components/cliente-install-banner";
import { ClienteNetworkBanner } from "@/app/cliente/components/cliente-network-banner";
import { ClientePwaRegister } from "@/app/cliente/components/cliente-pwa-register";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Portal do Cliente | ALTUM",
  description: "Area autenticada para clientes ALTUM.",
  appleWebApp: { capable: true, title: "Altum", statusBarStyle: "default" },
  icons: { apple: "/pwa/apple-touch-icon.png" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  interactiveWidget: "resizes-content", themeColor: "#f4f6f9",
};

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ClienteAppOpening />}>
    <ClientePanelGuard>
      <ClientePwaRegister />
      <ClienteNetworkBanner />
      <ClienteFinanceScreenAlert />
      <ClienteInstallBanner />
      {children}
    </ClientePanelGuard>
    </Suspense>
  );
}
