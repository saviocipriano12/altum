"use client";

import { useEffect } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { ClientActionButton, PanelCard } from "@/app/cliente/painel/components/ui";

export default function ClientePainelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Erro inesperado no painel do cliente:", error);
  }, [error]);

  return (
    <PanelCard className="mx-auto max-w-2xl p-8 text-center sm:p-10" tone="danger">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]"><TriangleAlert className="h-7 w-7" /></span>
      <h1 className="client-section-title mt-6 text-2xl text-[var(--cliente-card-text)]">Não foi possível carregar esta área</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--cliente-card-text-soft)]">Tente novamente. Se o problema continuar, informe o horário e a tela acessada ao suporte.</p>
      <ClientActionButton tone="primary" className="mt-7" onClick={retry}><RefreshCcw className="h-4 w-4" /> Tentar novamente</ClientActionButton>
    </PanelCard>
  );
}
