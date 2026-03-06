"use client";

import Link from "next/link";
import { LifeBuoy, Menu } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClienteGlobalSearch } from "@/app/cliente/painel/components/cliente-global-search";
import { StateBadge } from "@/app/cliente/painel/components/ui";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();
  const supportUrl =
    process.env.NEXT_PUBLIC_ALTUM_SUPPORT_URL ||
    "mailto:suporte.altum@gmail.com?subject=Suporte%20Painel%20Cliente%20ALTUM";

  return (
    <header className="fixed left-0 right-0 top-0 z-30 border-b border-white/10 bg-[#070d17]/92 backdrop-blur-xl lg:left-[270px]">
      <div className="flex h-[76px] items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] text-white/80 transition hover:bg-white/[0.08] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {tenant?.tenantName || tenant?.clientName || "Cliente"}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <StateBadge label="Operacao ativa" tone="success" />
            <span className="hidden text-xs text-white/58 sm:inline">
              Usuario: {tenant?.userName || "Operador"}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ClienteGlobalSearch />

          <Link
            href={supportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
          >
            <LifeBuoy className="h-4 w-4" />
            Suporte
          </Link>
        </div>
      </div>
    </header>
  );
}
