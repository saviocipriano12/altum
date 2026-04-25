"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Gauge, LifeBuoy, LogOut, Menu, MoonStar, SlidersHorizontal, SunMedium } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClienteGlobalSearch } from "@/app/cliente/painel/components/cliente-global-search";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { auth } from "@/firebaseConfig";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();
  const { density, experienceMode, theme, toggleDensity, toggleExperienceMode, toggleTheme } = useClienteShell();
  const router = useRouter();
  const pathname = usePathname();

  const supportUrl =
    process.env.NEXT_PUBLIC_ALTUM_SUPPORT_URL ||
    "mailto:suporte.altum@gmail.com?subject=Suporte%20Painel%20Cliente%20ALTUM";

  const workspaceName = tenant?.tenantName || tenant?.clientName || "Cliente";
  const operatorName = tenant?.userName || "Operador";
  const pageLabel = getPageLabel(pathname || "/cliente/painel");
  const compactDensity = density === "compact";
  const simpleMode = experienceMode === "essencial";

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
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 border-r border-[var(--cliente-border)] pr-3">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[var(--cliente-text)]">ALTUM</p>
            <span className="hidden rounded-md border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--cliente-accent)] md:inline-flex">
              Portal do cliente
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--cliente-text-soft)]">
            <span className="truncate">{workspaceName}</span>
          </div>
        </div>

        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-sm font-semibold text-[var(--cliente-text)]">{pageLabel}</p>
          <p className="mt-0.5 text-[11px] text-[var(--cliente-text-soft)]">Operacao em tempo real</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden xl:flex">
            <ClienteGlobalSearch />
          </div>

          <button
            type="button"
            onClick={toggleExperienceMode}
            className="hidden h-10 items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:inline-flex"
            aria-label={simpleMode ? "Ativar modo completo" : "Ativar modo essencial"}
            title={simpleMode ? "Ativar modo completo" : "Ativar modo essencial"}
          >
            <Gauge className="h-4 w-4 text-[var(--cliente-accent-alt)]" />
            <span className="hidden 2xl:inline">{simpleMode ? "Essencial" : "Completo"}</span>
          </button>

          <button
            type="button"
            onClick={toggleDensity}
            className="hidden h-10 items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:inline-flex"
            aria-label={compactDensity ? "Usar layout confortavel" : "Usar layout compacto"}
            title={compactDensity ? "Usar layout confortavel" : "Usar layout compacto"}
          >
            <SlidersHorizontal className="h-4 w-4 text-[var(--cliente-accent-alt)]" />
            <span className="hidden 2xl:inline">{compactDensity ? "Compacto" : "Conforto"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4 text-[var(--cliente-accent)]" /> : <MoonStar className="h-4 w-4 text-[var(--cliente-accent)]" />}
            <span className="hidden xl:inline">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>

          <div className="hidden rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 py-2 text-right lg:block">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--cliente-text-soft)]">Usuario</p>
            <p className="truncate text-sm font-semibold text-[var(--cliente-text)]">{operatorName}</p>
          </div>

          <Link
            href={supportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
          >
            <LifeBuoy className="h-4 w-4" />
            <span className="hidden sm:inline">Suporte</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]"
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

function getPageLabel(pathname: string) {
  if (pathname === "/cliente/painel") return "Visao geral";
  if (pathname.includes("/inbox")) return "Conversas";
  if (pathname.includes("/crm")) return "CRM";
  if (pathname.includes("/follow-ups")) return "Retornos";
  if (pathname.includes("/agenda")) return "Agenda";
  if (pathname.includes("/pipeline")) return "Funil";
  if (pathname.includes("/comercial")) return "Comercial";
  if (pathname.includes("/captacao")) return "Captacao";
  if (pathname.includes("/campanhas")) return "Campanhas";
  if (pathname.includes("/ia")) return "IA";
  if (pathname.includes("/conhecimento")) return "Conhecimento";
  if (pathname.includes("/handoffs")) return "Transferencias";
  if (pathname.includes("/automacoes/instagram")) return "Operacao Instagram";
  if (pathname.includes("/automacoes")) return "Automacoes";
  if (pathname.includes("/metricas")) return "Metricas";
  if (pathname.includes("/go-live")) return "Lancamento";
  if (pathname.includes("/logs")) return "Logs";
  if (pathname.includes("/configuracoes")) return "Configuracoes";
  return "Painel";
}
