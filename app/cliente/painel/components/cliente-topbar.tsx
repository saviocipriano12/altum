"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LifeBuoy, LogOut, Menu, MoonStar, Search, SunMedium } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClienteGlobalSearch } from "@/app/cliente/painel/components/cliente-global-search";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { ClientBadge } from "@/app/cliente/painel/components/ui";
import { auth } from "@/firebaseConfig";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();
  const { theme, toggleTheme } = useClienteShell();
  const router = useRouter();
  const pathname = usePathname();

  const supportUrl =
    process.env.NEXT_PUBLIC_ALTUM_SUPPORT_URL ||
    "mailto:suporte.altum@gmail.com?subject=Suporte%20Painel%20Cliente%20ALTUM";

  const operatorName = tenant?.userName || "Operador";
  const pageMeta = getPageMeta(pathname || "/cliente/painel");
  const initials = operatorName.slice(0, 2).toUpperCase();
  const actionButtonClass =
    "inline-flex h-10 items-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)]";

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Falha ao encerrar sessao do cliente:", error);
    }
    router.push("/cliente/login");
  }

  return (
    <header className="client-glass client-topbar fixed left-0 right-0 top-0 z-30 border-b border-[var(--cliente-border)] bg-[var(--cliente-topbar)] lg:left-[var(--cliente-sidebar-width)] lg:right-5 lg:top-5 lg:rounded-[20px] lg:border">
      <div className="flex h-[64px] items-center gap-2 px-3 sm:gap-3 lg:h-[72px] lg:px-4">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-text-muted)] transition hover:border-[var(--cliente-primary)]/20 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 px-1 lg:flex-none">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[1rem] font-semibold tracking-normal text-[var(--cliente-text)]">{pageMeta.title}</p>
              <ClientBadge label={pageMeta.badge} tone={pageMeta.tone} />
            </div>
            <p className="mt-0.5 hidden truncate text-[12px] font-medium text-[var(--cliente-text-soft)] xl:block">{pageMeta.description}</p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden xl:flex">
            <ClienteGlobalSearch />
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("altum:cliente-command-open"))}
            className={`${actionButtonClass} hidden lg:inline-flex xl:hidden`}
            title="Buscar"
          >
            <Search className="h-4 w-4 text-[var(--cliente-primary)]" />
            Buscar
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={actionButtonClass}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4 text-[var(--cliente-primary)]" /> : <MoonStar className="h-4 w-4 text-[var(--cliente-primary)]" />}
            <span className="hidden xl:inline">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>

          <div className="hidden items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-2 py-1.5 text-right lg:flex">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,var(--cliente-primary),var(--cliente-primary-hover))] text-[10px] font-black text-white shadow-[0_14px_24px_-14px_var(--cliente-primary-glow)]">
              {initials}
            </div>
            <p className="max-w-[120px] truncate text-sm font-semibold text-[var(--cliente-text)]">{operatorName}</p>
          </div>

          <Link href={supportUrl} target="_blank" rel="noreferrer noopener" className={actionButtonClass}>
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
            <LogOut className="h-4 w-4 text-[var(--cliente-primary)]" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      <div className="hidden px-4 pb-4 sm:block xl:hidden">
        <ClienteGlobalSearch />
      </div>
    </header>
  );
}

function getPageMeta(pathname: string) {
  if (pathname === "/cliente/painel") {
    return { title: "Inicio", description: "Trafego, atendimento, venda e retencao em uma fila clara.", badge: "Operacao", tone: "info" as const };
  }
  if (pathname.includes("/inbox")) {
    return { title: "Conversas", description: "Conversas com IA e humano trabalhando para converter.", badge: "Engajamento", tone: "success" as const };
  }
  if (pathname.includes("/crm") || pathname.includes("/pipeline") || pathname.includes("/comercial")) {
    return { title: "Clientes & Oportunidades", description: "Clientes, oportunidades, propostas e proximos passos.", badge: "Conversao", tone: "info" as const };
  }
  if (pathname.includes("/follow-ups") || pathname.includes("/agenda")) {
    return { title: "Agenda", description: "Retornos, compromissos, recompra e clientes parados.", badge: "Retencao", tone: "warning" as const };
  }
  if (pathname.includes("/produtos-servicos")) {
    return { title: "Produtos & Servicos", description: "O que a empresa vende e como a IA deve recomendar.", badge: "Oferta", tone: "info" as const };
  }
  if (pathname.includes("/campanhas") || pathname.includes("/captacao")) {
    return { title: "Campanhas", description: "Campanhas, captacao, UTMs e resultado comercial.", badge: "Trafego", tone: "info" as const };
  }
  if (pathname.includes("/metricas")) {
    return { title: "Relatorios", description: "Leitura simples do que gera dinheiro e do que trava.", badge: "Decisao", tone: "info" as const };
  }
  if (pathname.includes("/perguntar-altum")) {
    return { title: "Perguntar a Altum", description: "Converse com os dados da operacao para achar prioridades e gargalos.", badge: "Insights", tone: "ai" as const };
  }
  if (
    pathname.includes("/ia") ||
    pathname.includes("/conhecimento") ||
    pathname.includes("/handoffs") ||
    pathname.includes("/automacoes")
  ) {
    return { title: "Assistente Altum", description: "Ensinar, simular e controlar a IA da operacao.", badge: "IA", tone: "ai" as const };
  }
  if (pathname.includes("/go-live") || pathname.includes("/logs") || pathname.includes("/configuracoes")) {
    return { title: "Configuracoes", description: "Empresa, equipe, canais, integracoes e implantacao.", badge: "Conta", tone: "neutral" as const };
  }
  return { title: "Altum", description: "Operacao comercial com IA.", badge: "Altum", tone: "info" as const };
}
