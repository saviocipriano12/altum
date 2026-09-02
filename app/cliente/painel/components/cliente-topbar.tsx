"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LifeBuoy, ListFilter, LogOut, Menu, MoonStar, MoreHorizontal, Rocket, Search, SunMedium } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClienteGlobalSearch } from "@/app/cliente/painel/components/cliente-global-search";
import { ClienteNotifications } from "@/app/cliente/painel/components/cliente-notifications";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { auth } from "@/firebaseConfig";

type Props = {
  onOpenMenu: () => void;
};

export function ClienteTopbar({ onOpenMenu }: Props) {
  const { tenant } = useClienteTenant();
  const { experienceMode, theme, toggleExperienceMode, toggleTheme } = useClienteShell();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const supportUrl =
    process.env.NEXT_PUBLIC_ALTUM_SUPPORT_URL ||
    "mailto:suporte.altum@gmail.com?subject=Suporte%20Painel%20Cliente%20ALTUM";

  const operatorName = tenant?.userName || "Operador";
  const pageMeta = getPageMeta(pathname || "/cliente/painel");
  const initials = operatorName.slice(0, 2).toUpperCase();
  const actionButtonClass =
    "inline-flex h-10 items-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 text-sm font-medium text-[var(--cliente-text-muted)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)]";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Falha ao encerrar sessao do cliente:", error);
    }
    router.push("/cliente/login");
  }

  return (
    <header className="client-glass client-topbar fixed left-0 right-0 top-0 z-50 border-b border-[var(--cliente-border)] bg-[var(--cliente-topbar)] lg:left-[var(--cliente-sidebar-width)] lg:right-5 lg:top-5 lg:rounded-[20px] lg:border">
      <div className="flex h-[60px] items-center gap-2 px-3 sm:h-[64px] sm:gap-3 lg:h-[72px] lg:px-4">
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
            </div>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("altum:cliente-command-open"))}
            className={`${pathname.includes("/inbox") ? "hidden" : "inline-flex"} h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-text-muted)] transition hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] lg:hidden`}
            aria-label="Buscar"
            title="Buscar"
          >
            <Search className="h-4 w-4 text-[var(--cliente-primary)]" />
          </button>
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

          <ClienteNotifications />

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("altum:cliente-activation-open"))}
            data-tour-key="activation-control"
            className={`${actionButtonClass} hidden lg:inline-flex`}
            aria-label="Abrir central de ativacao"
            title="Configurar minha operacao"
          >
            <Rocket className="h-4 w-4 text-[var(--cliente-primary)]" />
            <span className="hidden 2xl:inline">Configurar</span>
          </button>

          <button
            type="button"
            onClick={toggleExperienceMode}
            className={`${actionButtonClass} hidden lg:inline-flex`}
            aria-label={experienceMode === "essencial" ? "Mostrar visão completa" : "Voltar à visão simples"}
            title={experienceMode === "essencial" ? "Mostrar visão completa" : "Voltar à visão simples"}
          >
            <ListFilter className="h-4 w-4 text-[var(--cliente-primary)]" />
            <span className="hidden 2xl:inline">{experienceMode === "essencial" ? "Ver mais" : "Simplificar"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={`${actionButtonClass} hidden lg:inline-flex`}
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

          <Link href={supportUrl} target="_blank" rel="noreferrer noopener" className={`${actionButtonClass} hidden h-10 w-10 justify-center px-0 sm:inline-flex`} aria-label="Suporte" title="Suporte">
            <LifeBuoy className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            className={`${actionButtonClass} hidden h-10 w-10 justify-center px-0 sm:inline-flex`}
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="h-4 w-4 text-[var(--cliente-primary)]" />
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-text-muted)] transition hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] sm:hidden"
            aria-label="Mais opcoes"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="border-t border-[var(--cliente-border)] px-3 pb-3 pt-2 sm:hidden">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event("altum:cliente-activation-open"));
                setMobileMenuOpen(false);
              }}
              className="inline-flex items-center justify-between rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-medium text-[var(--cliente-text)]"
            >
              Configurar minha operacao
              <Rocket className="h-4 w-4 text-[var(--cliente-primary)]" />
            </button>
            <button
              type="button"
              onClick={() => {
                toggleExperienceMode();
                setMobileMenuOpen(false);
              }}
              className="inline-flex items-center justify-between rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-medium text-[var(--cliente-text)]"
            >
              {experienceMode === "essencial" ? "Mostrar mais opções" : "Voltar à visão simples"}
              <ListFilter className="h-4 w-4 text-[var(--cliente-primary)]" />
            </button>
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              className="inline-flex items-center justify-between rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-medium text-[var(--cliente-text)]"
            >
              Tema
              {theme === "dark" ? <SunMedium className="h-4 w-4 text-[var(--cliente-primary)]" /> : <MoonStar className="h-4 w-4 text-[var(--cliente-primary)]" />}
            </button>
            <Link
              href={supportUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center justify-between rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-medium text-[var(--cliente-text)]"
            >
              Suporte
              <LifeBuoy className="h-4 w-4 text-[var(--cliente-primary)]" />
            </Link>
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
                setMobileMenuOpen(false);
              }}
              className="inline-flex items-center justify-between rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-medium text-[var(--cliente-text)]"
            >
              Sair
              <LogOut className="h-4 w-4 text-[var(--cliente-primary)]" />
            </button>
          </div>
        </div>
      ) : null}

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
  if (pathname.includes("/reunioes-assistidas")) {
    return { title: "Reunioes IA", description: "Chamada assistida, traducao, orientacao ao vivo e resumo para o vendedor.", badge: "IA ao vivo", tone: "ai" as const };
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
  if (pathname.includes("/metricas") || pathname.includes("/relatorios")) {
    return { title: "Relatorios", description: "Leitura simples do que gera dinheiro e do que trava.", badge: "Decisao", tone: "info" as const };
  }
  if (pathname.includes("/assinatura") || pathname.includes("/faturamento")) {
    return { title: "Faturamento", description: "Plano, pagamentos e cobrancas da conta.", badge: "Conta", tone: "neutral" as const };
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
