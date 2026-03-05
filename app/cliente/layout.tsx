import type { Metadata } from "next";
import ClientePanelGuard from "@/app/cliente/ClientePanelGuard";

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
  return <ClientePanelGuard>{children}</ClientePanelGuard>;
}
