"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Bot,
  Cable,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  DollarSign,
  FileText,
  Funnel,
  GitBranchPlus,
  LayoutGrid,
  ListTodo,
  Megaphone,
  MessageSquare,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useTenantReadiness } from "@/app/cliente/painel/hooks/use-tenant-readiness";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { StateBadge } from "@/app/cliente/painel/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  capability?: string;
  badge?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operacao",
    items: [{ href: "/cliente/painel", label: "Visao geral", icon: LayoutGrid }],
  },
  {
    title: "Atendimento e vendas",
    items: [
      { href: "/cliente/painel/inbox", label: "Inbox", icon: MessageSquare },
      { href: "/cliente/painel/crm", label: "CRM", icon: Users },
      { href: "/cliente/painel/follow-ups", label: "Follow-ups", icon: ListTodo },
      { href: "/cliente/painel/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/cliente/painel/pipeline", label: "Pipeline", icon: Funnel },
      { href: "/cliente/painel/comercial", label: "Comercial", icon: DollarSign, capability: "manage_commercial" },
    ],
  },
  {
    title: "Crescimento",
    items: [
      { href: "/cliente/painel/captacao", label: "Captacao", icon: Megaphone },
      { href: "/cliente/painel/campanhas", label: "Campanhas", icon: Sparkles, capability: "manage_automations", badge: "novo" },
    ],
  },
  {
    title: "Inteligencia",
    items: [
      { href: "/cliente/painel/ia", label: "IA", icon: Bot, capability: "manage_ai" },
      { href: "/cliente/painel/conhecimento", label: "Conhecimento", icon: BookOpen, capability: "manage_ai" },
      { href: "/cliente/painel/handoffs", label: "Handoffs", icon: GitBranchPlus },
      { href: "/cliente/painel/automacoes", label: "Automacoes", icon: Cable, capability: "manage_automations" },
      { href: "/cliente/painel/metricas", label: "Metricas", icon: Target },
    ],
  },
  {
    title: "Governanca",
    items: [
      { href: "/cliente/painel/go-live", label: "Go-live", icon: Rocket },
      { href: "/cliente/painel/logs", label: "Logs", icon: FileText },
      { href: "/cliente/painel/configuracoes", label: "Configuracoes", icon: Settings, capability: "manage_settings" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/cliente/painel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClienteSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const { tenant, hasCapability } = useClienteTenant();
  const { pilotReady, readinessScore, blockerCount } = useTenantReadiness(tenant?.tenantId);
  const { sidebarCollapsed, setSidebarCollapsed } = useClienteShell();
  const [isDesktop, setIsDesktop] = useState(false);

  const roleLabel = tenant?.tenantRole?.replace(/_/g, " ") || "cliente";
  const navStateLabel = pilotReady ? "pronto" : blockerCount > 0 ? `${blockerCount} pend.` : "operando";
  const compactMode = isDesktop && sidebarCollapsed;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={`client-glass fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-[var(--cliente-border)] bg-[var(--cliente-sidebar)] shadow-[var(--cliente-shadow-hard)] transition-[width,transform] duration-300 lg:translate-x-0 ${
          compactMode ? "w-[304px] lg:w-[92px]" : "w-[304px]"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="pointer-events-none absolute inset-x-4 top-0 h-24 rounded-b-[32px] bg-[linear-gradient(180deg,var(--cliente-accent-soft),transparent)]" />

        <div className="relative flex h-20 items-center gap-3 border-b border-[var(--cliente-border)] px-4">
          <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)] shadow-[0_12px_30px_rgba(59,130,246,0.16)]">
            <Crown className="h-5 w-5" />
          </div>

          {!compactMode ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-black uppercase tracking-[0.28em] text-[var(--cliente-text)]">ALTUM</p>
              <p className="truncate text-[10px] uppercase tracking-[0.22em] text-[var(--cliente-text-soft)]">Portal do cliente</p>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)] lg:inline-flex"
              title={compactMode ? "Expandir menu" : "Recolher menu"}
            >
              {compactMode ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <button
              onClick={onClose}
              className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-text-muted)] hover:text-[var(--cliente-text)] lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div
            className={`client-glass overflow-hidden rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-sidebar-card)] shadow-[var(--cliente-shadow-soft)] ${
              compactMode ? "px-2 py-3" : "px-4 py-4"
            }`}
          >
            <div className={`flex items-start ${compactMode ? "justify-center" : "justify-between gap-3"}`}>
              <div className={compactMode ? "hidden" : "min-w-0"}>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--cliente-text-soft)]">Workspace</p>
                <p className="mt-2 truncate text-base font-semibold text-[var(--cliente-text)]">
                  {tenant?.tenantName || tenant?.clientName || "Cliente"}
                </p>
                <p className="mt-1 text-xs text-[var(--cliente-text-soft)]">Operacao centralizada da conta</p>
              </div>
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]">
                <Shield className="h-4 w-4" />
              </div>
            </div>

            {!compactMode ? (
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--cliente-text-soft)]">Prontidao</p>
                    <p className="mt-1 text-sm font-medium text-[var(--cliente-text)]">
                      {pilotReady ? "Operacao pronta" : "Estrutura em implantacao"}
                    </p>
                  </div>
                  <StateBadge label={pilotReady ? `${readinessScore}%` : navStateLabel} tone={pilotReady ? "success" : blockerCount > 0 ? "warning" : "info"} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="client-scrollbar mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !("capability" in item) || !item.capability || hasCapability(item.capability));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title}>
                {!compactMode ? (
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--cliente-text-soft)]">{group.title}</p>
                ) : null}

                <div className="space-y-1.5">
                  {visibleItems.map((item) => {
                    const active = isActive(pathname, item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`group relative flex items-center rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                          active
                            ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-text)] shadow-[0_12px_30px_rgba(59,130,246,0.14)]"
                            : "border-transparent text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-text)]"
                        } ${compactMode ? "justify-center px-2" : "justify-between gap-3"}`}
                        title={compactMode ? item.label : undefined}
                      >
                        <span className={`inline-flex items-center ${compactMode ? "justify-center" : "gap-3"} min-w-0`}>
                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
                              active
                                ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-panel-solid)] text-[var(--cliente-accent)]"
                                : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-soft)] group-hover:text-[var(--cliente-text)]"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          {!compactMode ? <span className="truncate">{item.label}</span> : null}
                        </span>

                        {!compactMode ? (
                          <span className="ml-auto inline-flex items-center gap-2">
                            {typeof item.badge === "string" && item.badge ? <StateBadge label={item.badge} tone="info" /> : null}
                            {active ? (
                              <span className="h-2 w-2 rounded-full bg-[var(--cliente-accent)] shadow-[0_0_14px_var(--cliente-accent)]" />
                            ) : (
                              <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-75" />
                            )}
                          </span>
                        ) : (
                          <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] px-3 py-2 text-xs text-[var(--cliente-text)] shadow-[var(--cliente-shadow-soft)] group-hover:block lg:group-hover:block">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[var(--cliente-border)] px-4 py-4">
          <div
            className={`rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] ${
              compactMode ? "flex justify-center px-2 py-3" : "px-4 py-4"
            }`}
          >
            {compactMode ? (
              <Shield className="h-5 w-5 text-[var(--cliente-accent)]" />
            ) : (
              <div>
                <p className="text-sm font-semibold text-[var(--cliente-text)]">Workspace governado</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--cliente-text-soft)]">{roleLabel}</p>
                <p className="mt-2 text-sm text-[var(--cliente-text-muted)]">
                  Conta isolada, canais dedicados, modulos conectados e operacao centralizada.
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
