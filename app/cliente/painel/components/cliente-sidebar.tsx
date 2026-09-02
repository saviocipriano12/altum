"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Headphones,
  LayoutGrid,
  MessageCircle,
  MessageSquare,
  Instagram,
  Send,
  Package,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { BrandIcon } from "@/app/cliente/painel/components/ui";
import type { TenantModuleId } from "@/lib/tenant-entitlements";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type NavAlias = {
  href: string;
  label: string;
  capability?: string;
  module?: TenantModuleId;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  description: string;
  aliases?: NavAlias[];
  capability?: string;
  module?: TenantModuleId;
  tone?: "default" | "success" | "warning" | "ai" | "brand";
  group: "operate" | "grow" | "intelligence" | "system";
  advanced?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  {
    href: "/cliente/painel",
    label: "Inicio",
    icon: LayoutGrid,
    description: "Prioridades, dinheiro, conversas e proximas acoes do dia.",
    group: "operate",
  },
  {
    href: "/cliente/painel/inbox",
    label: "Conversas",
    icon: MessageSquare,
    description: "WhatsApp, Instagram e site com IA e humano no mesmo fluxo.",
    module: "inbox",
    tone: "success",
    group: "operate",
  },
  {
    href: "/cliente/painel/crm",
    label: "Clientes & Oportunidades",
    icon: Users,
    description: "Leads, oportunidades, funil, propostas e proximos passos.",
    module: "crm",
    aliases: [
      { href: "/cliente/painel/crm", label: "Lista" },
      { href: "/cliente/painel/pipeline", label: "Funil", capability: "manage_pipeline" },
      { href: "/cliente/painel/comercial", label: "Propostas", capability: "manage_commercial" },
    ],
    group: "operate",
  },
  {
    href: "/cliente/painel/agenda",
    label: "Agenda",
    icon: CalendarDays,
    description: "Reunioes, retornos, confirmacoes e compromissos comerciais.",
    module: "crm",
    tone: "warning",
    aliases: [
      { href: "/cliente/painel/agenda", label: "Compromissos" },
      { href: "/cliente/painel/follow-ups", label: "Retornos" },
      { href: "/cliente/painel/reunioes-assistidas", label: "Reunioes IA", module: "assisted_meetings" },
    ],
    group: "operate",
  },
  {
    href: "/cliente/painel/reunioes-assistidas",
    label: "Reunioes IA",
    icon: Video,
    description: "Salas, resumos e apoio de IA durante reunioes comerciais.",
    module: "assisted_meetings",
    tone: "ai",
    group: "intelligence",
  },
  {
    href: "/cliente/painel/produtos-servicos",
    label: "Produtos & Servicos",
    icon: Package,
    description: "Ofertas, argumentos, materiais e regras para a IA vender melhor.",
    module: "commerce",
    tone: "success",
    capability: "manage_ai",
    group: "operate",
  },
  {
    href: "/cliente/painel/campanhas",
    label: "Campanhas",
    icon: TrendingUp,
    description: "Trafego, captacao, UTMs e resultado comercial.",
    module: "marketing",
    tone: "brand",
    aliases: [
      { href: "/cliente/painel/campanhas", label: "Campanhas" },
      { href: "/cliente/painel/captacao", label: "Captacao" },
      { href: "/cliente/painel/configuracoes/integracoes", label: "Integracoes" },
      { href: "/cliente/painel/configuracoes/canais", label: "Canais", capability: "manage_channels" },
    ],
    group: "grow",
  },
  {
    href: "/cliente/painel/disparos",
    label: "Disparos em Massa",
    icon: Send,
    description: "Envios segmentados por WhatsApp com limites, previa e historico.",
    module: "marketing",
    tone: "success",
    capability: "manage_automations",
    group: "grow",
  },
  {
    href: "/cliente/painel/automacao-instagram",
    label: "Automacao do Instagram",
    icon: Instagram,
    description: "DMs, comentarios e gatilhos de relacionamento do Instagram.",
    module: "social_automation",
    tone: "ai",
    capability: "manage_automations",
    group: "grow",
  },
  {
    href: "/cliente/painel/metricas",
    label: "Relatorios",
    icon: BarChart3,
    description: "O que gerou dinheiro, onde travou e qual decisao tomar.",
    module: "reports",
    aliases: [{ href: "/cliente/painel/relatorios", label: "Relatorios detalhados" }],
    group: "grow",
  },
  {
    href: "/cliente/painel/perguntar-altum",
    label: "Perguntar a Altum",
    icon: Sparkles,
    description: "Converse com a inteligencia da operacao e encontre proximas acoes.",
    module: "ai",
    tone: "ai",
    capability: "manage_ai",
    group: "intelligence",
  },
  {
    href: "/cliente/painel/ia",
    label: "Assistente Altum",
    icon: Bot,
    description: "Ensinar, simular e controlar a IA que opera o negocio.",
    module: "ai",
    tone: "ai",
    capability: "manage_ai",
    aliases: [
      { href: "/cliente/painel/ia", label: "Controle", capability: "manage_ai" },
      { href: "/cliente/painel/conhecimento", label: "Conhecimento", capability: "manage_ai" },
      { href: "/cliente/painel/handoffs", label: "Escaladas" },
    ],
    group: "intelligence",
  },
  {
    href: "/cliente/painel/configuracoes",
    label: "Configuracoes",
    icon: Settings,
    description: "Empresa, equipe, canais, integracoes e implantacao.",
    capability: "manage_settings",
    aliases: [
      { href: "/cliente/painel/configuracoes", label: "Visao geral" },
      { href: "/cliente/painel/onboarding", label: "Implantacao guiada", capability: "manage_settings" },
      { href: "/cliente/painel/configuracoes/lixeira", label: "Lixeira", capability: "manage_settings" },
    ],
    group: "system",
  },
  {
    href: "/cliente/painel/configuracoes/faturamento",
    label: "Faturamento",
    icon: CreditCard,
    description: "Plano, cobrancas, pagamentos, upgrade e cancelamento.",
    group: "system",
  },
];

const ADVANCED_LINKS: NavAlias[] = [];
const ALTUM_SUPPORT_WHATSAPP_URL =
  "https://wa.me/5531972545430?text=Oi%2C%20preciso%20de%20ajuda%20com%20a%20plataforma%20Altum.";
const NAV_GROUPS: Array<{ id: NavItem["group"]; label: string }> = [
  { id: "operate", label: "Operacao diaria" },
  { id: "grow", label: "Crescimento" },
  { id: "intelligence", label: "IA aplicada" },
  { id: "system", label: "Conta" },
];

function isActive(pathname: string, href: string) {
  if (href === "/cliente/painel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemMatches(pathname: string, item: NavItem) {
  if (isActive(pathname, item.href)) return true;
  return (item.aliases || []).some((alias) => isActive(pathname, alias.href));
}

function tourKeyForHref(href: string) {
  if (href === "/cliente/painel") return "inicio";
  if (href.includes("/inbox")) return "conversas";
  if (href.includes("/crm")) return "clientes";
  if (href.includes("/agenda")) return "agenda";
  if (href.includes("/produtos-servicos")) return "produtos";
  if (href.includes("/campanhas")) return "campanhas";
  if (href.includes("/automacao-instagram")) return "instagram";
  if (href.includes("/metricas")) return "relatorios";
  if (href.includes("/perguntar-altum")) return "perguntar";
  if (href.includes("/ia")) return "assistente";
  if (href.includes("/faturamento")) return "faturamento";
  if (href.includes("/configuracoes")) return "configuracoes";
  return undefined;
}

export function ClienteSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const { tenant, hasCapability, hasModule } = useClienteTenant();
  const { experienceMode, sidebarCollapsed, setSidebarCollapsed } = useClienteShell();
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
      PRIMARY_NAV.filter(
        (item) =>
          (experienceMode === "completo" || !item.advanced) &&
          (!item.capability || hasCapability(item.capability)) &&
          (!item.module || hasModule(item.module))
      ).map((item) => ({
        ...item,
        aliases: (item.aliases || []).filter(
          (alias) => (!alias.capability || hasCapability(alias.capability)) && (!alias.module || hasModule(alias.module))
        ),
      })),
    [experienceMode, hasCapability, hasModule]
  );

  const advancedLinks = useMemo(
    () => ADVANCED_LINKS.filter((item) => !item.capability || hasCapability(item.capability)),
    [hasCapability]
  );
  const groupedNav = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: visibleNav.filter((item) => item.group === group.id),
      })).filter((group) => group.items.length > 0),
    [visibleNav]
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
        className={`client-glass fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-[var(--cliente-border)] bg-[var(--cliente-sidebar)] shadow-[var(--cliente-shadow-hard)] transition-[width,transform] duration-300 lg:bottom-5 lg:left-5 lg:top-5 lg:h-[calc(100dvh-2.5rem)] lg:rounded-[24px] lg:border lg:translate-x-0 ${
          compactMode ? "w-[292px] lg:w-[82px]" : "w-[292px]"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--cliente-border-strong),transparent)]" />

        <div className="relative flex h-[72px] items-center gap-3 border-b border-[var(--cliente-border)] px-4">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_24%,transparent)] bg-[var(--cliente-panel-soft)] p-1.5 shadow-[0_18px_34px_-18px_var(--cliente-primary-glow)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="Altum" className="h-full w-full rounded-[13px] object-contain" />
          </div>

          {!compactMode ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-[var(--cliente-text)]">Altum</p>
              <p className="truncate text-[11px] text-[var(--cliente-text-soft)]">Operacao comercial com IA</p>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2 text-[var(--cliente-text-muted)] transition hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)] lg:inline-flex"
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

        <div className="px-4 pt-3">
          <div
            className={`overflow-hidden rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-sidebar-card)] ${
              compactMode ? "px-2 py-2.5" : "px-3 py-3"
            }`}
          >
            <div className={`flex items-center ${compactMode ? "justify-center" : "justify-between gap-3"}`}>
              <div className={compactMode ? "hidden" : "min-w-0"}>
                <p className="text-[10px] font-bold text-[var(--cliente-text-soft)]">Conta</p>
                <p className="mt-1 truncate text-sm font-semibold tracking-normal text-[var(--cliente-text)]">
                  {tenant?.tenantName || tenant?.clientName || "Cliente"}
                </p>
              </div>
              <BrandIcon id="altum" size={compactMode ? "sm" : "md"} />
            </div>
          </div>
        </div>

        <nav className="client-scrollbar mt-4 flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-3">
            {groupedNav.map((group) => (
              <div key={group.id} className={compactMode ? "space-y-2" : "space-y-1.5"}>
                {!compactMode ? (
                  <p className="px-2 text-[10px] font-bold text-[var(--cliente-text-soft)]">
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = itemMatches(pathname, item);
                    const Icon = item.icon;
                    const itemTone = item.tone || "default";
                    const activeTone =
                      itemTone === "ai"
                        ? "border-[color:color-mix(in_srgb,var(--cliente-ai)_24%,transparent)] bg-[var(--cliente-ai)] text-white shadow-[0_18px_38px_-24px_var(--cliente-ai-glow)]"
                        : itemTone === "success"
                          ? "border-[color:color-mix(in_srgb,var(--cliente-success)_26%,transparent)] bg-[var(--cliente-success)] text-white shadow-[0_18px_38px_-26px_rgba(34,197,94,0.45)]"
                          : itemTone === "warning"
                            ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_28%,transparent)] bg-[var(--cliente-warning)] text-white shadow-[0_18px_38px_-26px_rgba(245,158,11,0.45)]"
                            : "border-[color:color-mix(in_srgb,var(--cliente-primary)_24%,transparent)] bg-[var(--cliente-primary)] text-white shadow-[0_18px_38px_-26px_var(--cliente-primary-glow)]";
                    const iconClasses = active
                      ? "border-white/18 bg-white/16 text-white"
                      : itemTone === "ai"
                        ? "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]"
                        : itemTone === "success"
                          ? "border-[color:color-mix(in_srgb,var(--cliente-success)_18%,transparent)] bg-[var(--cliente-whatsapp-soft)] text-[var(--cliente-success)]"
                          : itemTone === "warning"
                            ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
                            : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-soft)] group-hover:text-[var(--cliente-text)]";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        onClick={onClose}
                        className={`group relative block rounded-[16px] border px-2.5 py-2.5 transition ${
                          active
                            ? activeTone
                            : "border-transparent text-[var(--cliente-text-muted)] hover:border-[var(--cliente-border)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-text)]"
                        } ${compactMode ? "px-2" : ""}`}
                        title={compactMode ? item.label : undefined}
                        data-tour-key={tourKeyForHref(item.href)}
                      >
                        <div className={`flex items-center ${compactMode ? "justify-center" : "gap-3"}`}>
                          <span className={`inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[13px] border transition ${iconClasses}`}>
                            <Icon className="h-4.5 w-4.5" />
                          </span>

                          {!compactMode ? (
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{item.label}</p>
                            </div>
                          ) : null}
                        </div>

                        {compactMode ? (
                          <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-text)] shadow-[var(--cliente-shadow-soft)] group-hover:block lg:group-hover:block">
                            {item.label}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-[var(--cliente-border)] px-4 py-4">
          {compactMode ? (
            <a
              href={ALTUM_SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              title="Entrar em contato com a Altum"
              aria-label="Entrar em contato com a Altum pelo WhatsApp"
              className="group relative flex h-12 w-full items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-success)_28%,var(--cliente-border))] bg-[linear-gradient(135deg,var(--cliente-success),color-mix(in_srgb,var(--cliente-primary)_34%,var(--cliente-success)))] text-white shadow-[0_18px_36px_-26px_rgba(34,197,94,0.72)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-text)] shadow-[var(--cliente-shadow-soft)] group-hover:block">
                Suporte Altum
              </span>
            </a>
          ) : (
            <a
              href={ALTUM_SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="group block overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--cliente-success)_22%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-success)_14%,var(--cliente-card)),var(--cliente-card))] p-3 shadow-[0_18px_42px_-32px_rgba(34,197,94,0.6)] transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--cliente-success)_38%,var(--cliente-border))] hover:shadow-[0_22px_52px_-34px_rgba(34,197,94,0.78)]"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,var(--cliente-success),color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-success)))] text-white shadow-[0_16px_34px_-22px_rgba(34,197,94,0.85)]">
                  <Headphones className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black tracking-normal text-[var(--cliente-text)]">
                    Entrar em contato com a Altum
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--cliente-text-soft)]">
                    Suporte direto pelo WhatsApp para duvidas, ajustes e ajuda na operacao.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--cliente-success)] px-3 py-1.5 text-[11px] font-bold text-white transition group-hover:brightness-105">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Falar no WhatsApp
                  </span>
                </div>
              </div>
            </a>
          )}
        </div>

        {advancedLinks.length ? (
        <div className="border-t border-[var(--cliente-border)] px-4 py-4">
          <div className={`rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] ${compactMode ? "flex justify-center px-2 py-3" : "p-4"}`}>
            {compactMode ? (
              <Settings className="h-5 w-5 text-[var(--cliente-primary)]" />
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[1rem] font-semibold tracking-normal text-[var(--cliente-text)]">Avancado</p>
                </div>

                {advancedLinks.length ? (
                  <div className="flex flex-wrap gap-2">
                    {advancedLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
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
        ) : null}
      </aside>
    </>
  );
}
