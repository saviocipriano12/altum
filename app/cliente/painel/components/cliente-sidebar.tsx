"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MessageSquare,
  Package,
  Settings,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { BrandIcon } from "@/app/cliente/painel/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type NavAlias = {
  href: string;
  label: string;
  capability?: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  description: string;
  aliases?: NavAlias[];
  capability?: string;
  tone?: "default" | "success" | "warning" | "ai" | "brand";
};

const PRIMARY_NAV: NavItem[] = [
  {
    href: "/cliente/painel",
    label: "Inicio",
    icon: LayoutGrid,
    description: "Prioridades, numeros fortes e acoes do dia.",
  },
  {
    href: "/cliente/painel/inbox",
    label: "Conversas",
    icon: MessageSquare,
    description: "Atenda clientes e avance oportunidades sem sair do chat.",
    tone: "success",
  },
  {
    href: "/cliente/painel/crm",
    label: "Clientes & Oportunidades",
    icon: Users,
    description: "Lista, kanban e propostas do mesmo relacionamento comercial.",
    aliases: [
      { href: "/cliente/painel/crm", label: "Lista" },
      { href: "/cliente/painel/pipeline", label: "Kanban", capability: "manage_pipeline" },
      { href: "/cliente/painel/comercial", label: "Propostas", capability: "manage_commercial" },
    ],
  },
  {
    href: "/cliente/painel/agenda",
    label: "Agenda",
    icon: CalendarDays,
    description: "Compromissos, retornos e proximas acoes em um so lugar.",
    tone: "warning",
    aliases: [
      { href: "/cliente/painel/agenda", label: "Compromissos" },
      { href: "/cliente/painel/follow-ups", label: "Tarefas" },
    ],
  },
  {
    href: "/cliente/painel/produtos-servicos",
    label: "Produtos & Servicos",
    icon: Package,
    description: "O que a empresa vende, como explicar e quando recomendar.",
    capability: "manage_ai",
    tone: "brand",
  },
  {
    href: "/cliente/painel/campanhas",
    label: "Campanhas",
    icon: Sparkles,
    description: "Aquisicao, outbound e reativacao com status claro.",
    tone: "brand",
    aliases: [{ href: "/cliente/painel/captacao", label: "Captacao" }],
  },
  {
    href: "/cliente/painel/metricas",
    label: "Relatorios",
    icon: Target,
    description: "KPIs e leitura comercial com menos ruido tecnico.",
  },
  {
    href: "/cliente/painel/perguntar-altum",
    label: "Perguntar a Altum",
    icon: Sparkles,
    description: "Converse com a inteligencia da operacao e encontre proximas acoes.",
    tone: "ai",
    capability: "manage_ai",
  },
  {
    href: "/cliente/painel/ia",
    label: "Assistente Altum",
    icon: Bot,
    description: "IA, base de conhecimento, automacoes e escaladas.",
    tone: "ai",
    capability: "manage_ai",
    aliases: [
      { href: "/cliente/painel/ia", label: "IA", capability: "manage_ai" },
      { href: "/cliente/painel/conhecimento", label: "Base", capability: "manage_ai" },
      { href: "/cliente/painel/handoffs", label: "Escaladas" },
      { href: "/cliente/painel/automacoes", label: "Automacoes", capability: "manage_automations" },
    ],
  },
  {
    href: "/cliente/painel/configuracoes",
    label: "Configuracoes",
    icon: Settings,
    description: "Empresa, equipe, canais e ajustes do workspace.",
    capability: "manage_settings",
  },
];

const ADVANCED_LINKS: NavAlias[] = [];

function isActive(pathname: string, href: string) {
  if (href === "/cliente/painel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemMatches(pathname: string, item: NavItem) {
  if (isActive(pathname, item.href)) return true;
  return (item.aliases || []).some((alias) => isActive(pathname, alias.href));
}

export function ClienteSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const { tenant, hasCapability } = useClienteTenant();
  const { sidebarCollapsed, setSidebarCollapsed } = useClienteShell();
  const [isDesktop, setIsDesktop] = useState(false);

  const compactMode = isDesktop && sidebarCollapsed;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const visibleNav = useMemo(
    () =>
      PRIMARY_NAV.filter((item) => !item.capability || hasCapability(item.capability)).map((item) => ({
        ...item,
        aliases: (item.aliases || []).filter((alias) => !alias.capability || hasCapability(alias.capability)),
      })),
    [hasCapability]
  );

  const advancedLinks = useMemo(
    () => ADVANCED_LINKS.filter((item) => !item.capability || hasCapability(item.capability)),
    [hasCapability]
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        data-client-nav="sidebar"
        className={`client-glass fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-[var(--cliente-border)] bg-[var(--cliente-sidebar)] shadow-[var(--cliente-shadow-hard)] transition-[width,transform] duration-300 lg:translate-x-0 ${
          compactMode ? "w-[306px] lg:w-[92px]" : "w-[306px]"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_right,var(--cliente-primary-soft),transparent_50%)] opacity-90" />
        <div className="pointer-events-none absolute -right-16 top-20 h-44 w-44 rounded-full bg-[var(--cliente-primary-glow)] blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-12 h-40 w-40 rounded-full bg-[var(--cliente-ai-glow)] blur-3xl" />

        <div className="relative flex h-[82px] items-center gap-3 border-b border-[var(--cliente-border)] px-4">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_24%,transparent)] bg-[var(--cliente-panel-soft)] p-1.5 shadow-[0_18px_34px_-18px_var(--cliente-primary-glow)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="Altum" className="h-full w-full rounded-[13px] object-contain" />
          </div>

          {!compactMode ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-black uppercase tracking-[0.22em] text-[var(--cliente-text)]">Altum</p>
              <p className="truncate text-[10px] tracking-[0.16em] text-[var(--cliente-text-soft)]">Operacao comercial com IA</p>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-text-muted)] transition hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] lg:inline-flex"
              title={compactMode ? "Expandir menu" : "Recolher menu"}
            >
              {compactMode ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <button
              onClick={onClose}
              className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-text-muted)] transition hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div
            className={`client-glass overflow-hidden rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-sidebar-card)] shadow-[var(--cliente-shadow-soft)] ${
              compactMode ? "px-2 py-3" : "px-4 py-4"
            }`}
          >
            <div className={`flex items-center ${compactMode ? "justify-center" : "justify-between gap-3"}`}>
              <div className={compactMode ? "hidden" : "min-w-0"}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--cliente-text-soft)]">Conta</p>
                <p className="mt-2 truncate text-[1rem] font-semibold tracking-[-0.02em] text-[var(--cliente-text)]">
                  {tenant?.tenantName || tenant?.clientName || "Cliente"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--cliente-text-soft)]">Atendimento e vendas em um fluxo unico.</p>
              </div>
              <BrandIcon id="altum" size={compactMode ? "sm" : "md"} />
            </div>
          </div>
        </div>

        <nav className="client-scrollbar mt-5 flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-2">
            {visibleNav.map((item) => {
              const active = itemMatches(pathname, item);
              const Icon = item.icon;
              const itemTone = item.tone || "default";
              const activeDot =
                itemTone === "ai"
                  ? "bg-[var(--cliente-ai)]"
                  : itemTone === "success"
                    ? "bg-[var(--cliente-success)]"
                    : itemTone === "warning"
                      ? "bg-[var(--cliente-warning)]"
                      : "bg-[var(--cliente-primary)]";
              const iconClasses = active
                ? itemTone === "ai"
                  ? "border-[color:color-mix(in_srgb,var(--cliente-ai)_24%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]"
                  : itemTone === "success"
                    ? "border-[color:color-mix(in_srgb,var(--cliente-success)_24%,transparent)] bg-[var(--cliente-whatsapp-soft)] text-[var(--cliente-success)]"
                    : itemTone === "warning"
                      ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_24%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
                      : "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"
                : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-soft)] group-hover:text-[var(--cliente-text)]";

              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={onClose}
                    className={`group relative block rounded-[26px] border px-3.5 py-3.5 transition ${
                      active
                        ? "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text)] shadow-[0_18px_40px_-30px_rgba(37,99,235,0.26)]"
                        : "border-transparent text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-text)]"
                    } ${compactMode ? "px-2" : ""}`}
                    title={compactMode ? item.label : undefined}
                  >
                    <div className={`flex items-center ${compactMode ? "justify-center" : "gap-3"}`}>
                      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border transition ${iconClasses}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>

                      {!compactMode ? (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">{item.label}</p>
                            {active ? (
                              <span className={`h-2 w-2 rounded-full ${activeDot}`} />
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {compactMode ? (
                      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-text)] shadow-[var(--cliente-shadow-soft)] group-hover:block lg:group-hover:block">
                        {item.label}
                      </span>
                    ) : null}
                  </Link>

                </div>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-[var(--cliente-border)] px-4 py-4">
          <div className={`rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] ${compactMode ? "flex justify-center px-2 py-3" : "p-4"}`}>
            {compactMode ? (
              <Settings className="h-5 w-5 text-[var(--cliente-primary)]" />
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[1rem] font-semibold tracking-[-0.02em] text-[var(--cliente-text)]">Avancado</p>
                </div>

                {advancedLinks.length ? (
                  <div className="flex flex-wrap gap-2">
                    {advancedLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={onClose}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          isActive(pathname, item.href)
                            ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_22%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
                            : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-soft)] hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
