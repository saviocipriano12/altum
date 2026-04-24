"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LifeBuoy, LogOut, Menu, MoonStar, SunMedium } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClienteGlobalSearch } from "@/app/cliente/painel/components/cliente-global-search";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { auth } from "@/firebaseConfig";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();
  const { theme, toggleTheme } = useClienteShell();
  const router = useRouter();

  const supportUrl =
    process.env.NEXT_PUBLIC_ALTUM_SUPPORT_URL ||
    "mailto:suporte.altum@gmail.com?subject=Suporte%20Painel%20Cliente%20ALTUM";

  const workspaceName = tenant?.tenantName || tenant?.clientName || "Cliente";
  const operatorName = tenant?.userName || "Operador";

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Falha ao encerrar sessao do cliente:", error);
    }
    router.push("/cliente/login");
  }

  return (
    <header className="client-glass fixed left-0 right-0 top-0 z-30 border-b border-[var(--cliente-border)] bg-[var(--cliente-topbar)]/95 backdrop-blur-md lg:left-[var(--cliente-sidebar-width)]">
      <div className="flex h-[76px] items-center gap-2.5 px-3 lg:px-5">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[var(--cliente-text)]">ALTUM</p>
            <span className="hidden rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--cliente-accent)] md:inline-flex">
              Portal do cliente
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--cliente-text-soft)]">
            <span className="truncate">{workspaceName}</span>
            <span className="hidden sm:inline">/</span>
            <span className="hidden sm:inline">Operacao em tempo real</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden xl:flex">
            <ClienteGlobalSearch />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4 text-[var(--cliente-accent)]" /> : <MoonStar className="h-4 w-4 text-[var(--cliente-accent)]" />}
            <span className="hidden xl:inline">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>

          <div className="hidden rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 py-2 text-right lg:block">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--cliente-text-soft)]">Usuario</p>
            <p className="truncate text-sm font-semibold text-[var(--cliente-text)]">{operatorName}</p>
          </div>

          <Link
            href={supportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
          >
            <LifeBuoy className="h-4 w-4" />
            <span className="hidden sm:inline">Suporte</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
          >
            <LogOut className="h-4 w-4 text-[var(--cliente-accent)]" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 xl:hidden">
        <ClienteGlobalSearch />
      </div>
    </header>
  );
}
