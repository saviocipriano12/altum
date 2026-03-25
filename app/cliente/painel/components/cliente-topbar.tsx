"use client";

import Link from "next/link";
import { LifeBuoy, Menu, MoonStar, Sparkles, SunMedium } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClienteGlobalSearch } from "@/app/cliente/painel/components/cliente-global-search";
import { useTenantReadiness } from "@/app/cliente/painel/hooks/use-tenant-readiness";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { StateBadge } from "@/app/cliente/painel/components/ui";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();
  const { pilotReady, readinessScore, blockerCount } = useTenantReadiness(tenant?.tenantId);
  const { theme, toggleTheme } = useClienteShell();

  const supportUrl =
    process.env.NEXT_PUBLIC_ALTUM_SUPPORT_URL ||
    "mailto:suporte.altum@gmail.com?subject=Suporte%20Painel%20Cliente%20ALTUM";

  const workspaceName = tenant?.tenantName || tenant?.clientName || "Cliente";
  const operatorName = tenant?.userName || "Operador";

  return (
    <header className="client-glass fixed left-0 right-0 top-0 z-30 border-b border-[var(--cliente-border)] bg-[var(--cliente-topbar)] lg:left-[var(--cliente-sidebar-width)]">
      <div className="flex h-[74px] items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-muted)] shadow-[var(--cliente-shadow-soft)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-black uppercase tracking-[0.28em] text-[var(--cliente-text)]">ALTUM</p>
            <span className="hidden rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cliente-accent)] md:inline-flex">
              Portal do cliente
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--cliente-text-soft)]">
            <span className="truncate">{workspaceName}</span>
            <span className="hidden sm:inline">/</span>
            <span className="hidden sm:inline">Operacao em tempo real</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden xl:flex">
            <ClienteGlobalSearch />
          </div>

          <div className="hidden items-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 shadow-[var(--cliente-shadow-soft)] md:flex">
            <Sparkles className="h-4 w-4 text-[var(--cliente-accent)]" />
            <StateBadge
              label={
                pilotReady
                  ? `Piloto pronto ${readinessScore}%`
                  : blockerCount > 0
                    ? `${blockerCount} pendencia(s)`
                    : "Operacao ativa"
              }
              tone={pilotReady ? "success" : blockerCount > 0 ? "warning" : "info"}
            />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] shadow-[var(--cliente-shadow-soft)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4 text-[var(--cliente-accent)]" /> : <MoonStar className="h-4 w-4 text-[var(--cliente-accent)]" />}
            <span className="hidden lg:inline">{theme === "dark" ? "Claro" : "Escuro"}</span>
          </button>

          <div className="hidden rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2 text-right shadow-[var(--cliente-shadow-soft)] md:block">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--cliente-text-soft)]">Usuario</p>
            <p className="truncate text-sm font-semibold text-[var(--cliente-text)]">{operatorName}</p>
          </div>

          <Link
            href={supportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] shadow-[var(--cliente-shadow-soft)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
          >
            <LifeBuoy className="h-4 w-4" />
            <span className="hidden sm:inline">Suporte</span>
          </Link>
        </div>
      </div>

      <div className="px-4 pb-3 xl:hidden">
        <ClienteGlobalSearch />
      </div>
    </header>
  );
}
