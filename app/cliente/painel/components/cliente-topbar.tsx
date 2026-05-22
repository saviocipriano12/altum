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
    "inline-flex h-11 items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3.5 text-sm font-medium text-[var(--cliente-text-muted)] shadow-[0_14px_28px_-24px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-primary)]/20 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)]";

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Falha ao encerrar sessao do cliente:", error);
    }
    router.push("/cliente/login");
  }

  return (
    <header className="client-glass client-topbar fixed left-0 right-0 top-0 z-30 border-b border-[var(--cliente-border)] bg-[var(--cliente-topbar)]/95 backdrop-blur-xl lg:left-[var(--cliente-sidebar-width)] lg:right-5 lg:top-5 lg:rounded-[24px] lg:border">
      <div className="flex h-[72px] items-center gap-2 px-3 sm:gap-3 lg:h-[88px] lg:px-5">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-muted)] shadow-[0_14px_28px_-24px_rgba(15,23,42,0.2)] transition hover:border-[var(--cliente-primary)]/20 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.24)] sm:rounded-[22px] sm:px-4 sm:py-3 lg:flex-none">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[1rem] font-semibold tracking-[-0.025em] text-[var(--cliente-text)]">{pageMeta.title}</p>
              <ClientBadge label={pageMeta.badge} tone={pageMeta.tone} />
            </div>
            <p className="mt-1 hidden truncate text-[12px] font-medium text-[var(--cliente-text-soft)] sm:block">{pageMeta.description}</p>
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

          <div className="hidden items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-2 text-right shadow-[0_14px_28px_-24px_rgba(15,23,42,0.2)] lg:flex">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,var(--cliente-primary),var(--cliente-primary-hover))] text-[10px] font-black text-white shadow-[0_14px_24px_-14px_var(--cliente-primary-glow)]">
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
    return { title: "Inicio", description: "Veja prioridades, numeros e o que pede acao agora.", badge: "Prioridades", tone: "info" as const };
  }
  if (pathname.includes("/inbox")) {
    return { title: "Conversas", description: "Atenda clientes e avance a venda no mesmo fluxo.", badge: "Atendimento", tone: "success" as const };
  }
  if (pathname.includes("/crm") || pathname.includes("/pipeline") || pathname.includes("/comercial")) {
    return { title: "Clientes & Oportunidades", description: "Lista, kanban e propostas do mesmo relacionamento.", badge: "Vendas", tone: "info" as const };
  }
  if (pathname.includes("/follow-ups") || pathname.includes("/agenda")) {
    return { title: "Agenda", description: "Compromissos, tarefas e proximos passos com clareza.", badge: "Execucao", tone: "warning" as const };
  }
  if (pathname.includes("/produtos-servicos")) {
    return { title: "Produtos & Servicos", description: "Ensine a Altum o que a empresa vende e como deve recomendar.", badge: "Oferta", tone: "info" as const };
  }
  if (pathname.includes("/campanhas") || pathname.includes("/captacao")) {
    return { title: "Campanhas", description: "Aquisicao, segmentacao e reativacao sem ruido tecnico.", badge: "Crescimento", tone: "info" as const };
  }
  if (pathname.includes("/metricas")) {
    return { title: "Relatorios", description: "KPIs e leitura comercial para decidir com rapidez.", badge: "Performance", tone: "info" as const };
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
    return { title: "Assistente Altum", description: "IA, conhecimento, automacoes e escaladas no mesmo lugar.", badge: "IA", tone: "ai" as const };
  }
  if (pathname.includes("/go-live") || pathname.includes("/logs") || pathname.includes("/configuracoes")) {
    return { title: "Configuracoes", description: "Empresa, canais, equipe e areas avancadas do workspace.", badge: "Ajustes", tone: "neutral" as const };
  }
  return { title: "Portal do cliente", description: "Atendimento, CRM, vendas e campanhas em uma experiencia mais simples.", badge: "Altum", tone: "info" as const };
}
