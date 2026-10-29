"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
const AuthProvider = lazy(() =>
  import("@/context/AuthContext").then((module) => ({
    default: module.AuthProvider,
  })),
);

// Marketing pages must render on the server without waiting for Firebase.
// Every other route keeps the existing authentication provider and loading flow.
const publicRoots = new Set([
  "agencia",
  "automacao-com-ia",
  "automacao-instagram",
  "automacoes",
  "blog",
  "cases",
  "chatbot-para-empresas",
  "chatbot-whatsapp",
  "cidades",
  "contato",
  "crm",
  "crm-para-whatsapp",
  "diagnostico",
  "estrutura-digital",
  "exclusao-de-dados",
  "follow-up",
  "ia-no-whatsapp",
  "ia-para-vendas",
  "implantacao",
  "inbox",
  "integracoes",
  "pipeline",
  "plataforma",
  "politica-de-privacidade",
  "portfolio",
  "precos",
  "privacidade",
  "qualificacao-de-leads-com-ia",
  "segmentos",
  "sobre",
  "solucoes",
  "termos",
]);

export function PublicRenderingBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname === "/" || publicRoots.has(pathname.split("/")[1]);
  return isPublic ? (
    children
  ) : (
    <Suspense fallback={null}>
      <AuthProvider>{children}</AuthProvider>
    </Suspense>
  );
}
