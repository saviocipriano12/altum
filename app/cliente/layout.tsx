import type { Metadata } from "next";
import ClientePanelGuard from "@/app/cliente/ClientePanelGuard";
import { ClienteCriticalNotifications } from "@/app/cliente/components/cliente-critical-notifications";
import { ClienteInstallBanner } from "@/app/cliente/components/cliente-install-banner";
import { ClienteNetworkBanner } from "@/app/cliente/components/cliente-network-banner";
import { ClientePwaRegister } from "@/app/cliente/components/cliente-pwa-register";

export const metadata: Metadata = {
  title: "Portal do Cliente | ALTUM",
  description: "Area autenticada para clientes ALTUM.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientePanelGuard>
      <ClientePwaRegister />
      <ClienteNetworkBanner />
      <ClienteCriticalNotifications />
      <ClienteInstallBanner />
      {children}
    </ClientePanelGuard>
  );
}
