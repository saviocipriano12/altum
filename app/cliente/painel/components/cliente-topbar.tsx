"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Gauge, LifeBuoy, LogOut, Menu, MoonStar, Search, SlidersHorizontal, SunMedium, ChevronRight } from "lucide-react";
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
  const initials = operatorName.slice(0, 2).toUpperCase();
  const actionButtonClass =
    "inline-flex h-11 items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_88%,transparent)] px-3.5 text-sm font-medium text-[var(--cliente-text-muted)] shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-text)]";

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Falha ao encerrar sessao do cliente:", error);
    }
    router.push("/cliente/login");
  }

  return (
    <header className="client-glass client-topbar fixed left-0 right-0 top-0 z-30 border-b border-[var(--cliente-border)] bg-[var(--cliente-topbar)]/92 backdrop-blur-xl lg:left-[var(--cliente-sidebar-width)]">
      <div className="flex h-[88px] items-center gap-3 px-3 lg:px-5">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_88%,transparent)] text-[var(--cliente-text-muted)] shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] transition hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 rounded-[24px] border border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_70%,transparent)] px-3.5 py-2.5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.55)]">
          <div className="flex items-center gap-2">
            <div className="hidden h-10 w-10 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-accent)_88%,#ffb67a),var(--cliente-accent))] text-[11px] font-black text-white shadow-[0_18px_34px_-16px_var(--cliente-accent)] sm:inline-flex">
              A
            </div>
            <p className="text-[12px] font-black uppercase tracking-[0.22em] text-[var(--cliente-text)]">ALTUM</p>
            <span className="hidden rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cliente-accent)] md:inline-flex">
              Portal do cliente
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-[var(--cliente-text-soft)]">
            <span className="truncate font-medium">{workspaceName}</span>
          </div>
        </div>

        <div className="hidden min-w-0 items-center gap-2 rounded-[24px] border border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_64%,transparent)] px-3.5 py-2.5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.55)] lg:flex">
          <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cliente-text-soft)]">
            Navegacao
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--cliente-text-soft)]" />
          <div className="min-w-0">
            <p className="truncate text-[1.05rem] font-extrabold tracking-[-0.025em] text-[var(--cliente-text)]">{pageLabel}</p>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--cliente-text-soft)]">Fluxo simples, visual e direto</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden xl:flex">
            <ClienteGlobalSearch />
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("altum:cliente-command-open"))}
            className={`${actionButtonClass} hidden lg:inline-flex xl:hidden`}
            title="Buscar"
          >
            <Search className="h-4 w-4 text-[var(--cliente-accent)]" />
            Buscar
          </button>

          <button
            type="button"
            onClick={toggleExperienceMode}
            className={`${actionButtonClass} hidden lg:inline-flex`}
            aria-label={simpleMode ? "Ativar modo completo" : "Ativar modo essencial"}
            title={simpleMode ? "Ativar modo completo" : "Ativar modo essencial"}
          >
            <Gauge className="h-4 w-4 text-[var(--cliente-accent-alt)]" />
            <span className="hidden 2xl:inline">{simpleMode ? "Essencial" : "Conforto"}</span>
          </button>

            <button
              type="button"
              onClick={toggleDensity}
              className={`${actionButtonClass} hidden lg:inline-flex`}
              aria-label={compactDensity ? "Usar layout confortavel" : "Usar layout compacto"}
              title={compactDensity ? "Usar layout confortavel" : "Usar layout compacto"}
            >
            <SlidersHorizontal className="h-4 w-4 text-[var(--cliente-accent-alt)]" />
            <span className="hidden 2xl:inline">{compactDensity ? "Compacto" : "Conforto"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={actionButtonClass}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4 text-[var(--cliente-accent)]" /> : <MoonStar className="h-4 w-4 text-[var(--cliente-accent)]" />}
            <span className="hidden xl:inline">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>

          <div className="hidden items-center gap-2 rounded-[20px] border border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_88%,transparent)] px-2.5 py-2 text-right shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] lg:flex">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-accent)_86%,#ffbf85),var(--cliente-accent))] text-[10px] font-black text-white shadow-[0_14px_28px_-14px_var(--cliente-accent)]">
              {initials}
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--cliente-text-soft)]">Usuario</p>
              <p className="max-w-[120px] truncate text-sm font-bold text-[var(--cliente-text)]">{operatorName}</p>
            </div>
          </div>

          <Link
            href={supportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={actionButtonClass}
          >
            <LifeBuoy className="h-4 w-4" />
            <span className="hidden sm:inline">Suporte</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            className={actionButtonClass}
          >
            <LogOut className="h-4 w-4 text-[var(--cliente-accent)]" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 xl:hidden">
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
