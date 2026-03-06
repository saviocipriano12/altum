"use client";

import { LifeBuoy, Menu, Search } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { StateBadge } from "@/app/cliente/painel/components/ui";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();

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
          <p className="truncate text-sm font-semibold text-white">{tenant?.tenantName || tenant?.clientName || "Cliente"}</p>
          <div className="mt-1 flex items-center gap-2">
            <StateBadge label="Operacao ativa" tone="success" />
            <span className="hidden text-xs text-white/58 sm:inline">Usuario: {tenant?.userName || "Operador"}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-white/70 md:flex">
            <Search className="h-4 w-4" />
            <input
              placeholder="Buscar modulo, lead ou conversa"
              className="w-[280px] bg-transparent text-sm outline-none placeholder:text-white/40"
            />
          </label>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
          >
            <LifeBuoy className="h-4 w-4" />
            Suporte
          </button>
        </div>
      </div>
    </header>
  );
}
