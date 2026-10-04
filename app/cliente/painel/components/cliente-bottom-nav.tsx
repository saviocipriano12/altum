"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, LayoutGrid, MessageSquare, Target, TrendingUp } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import type { TenantModuleId } from "@/lib/tenant-entitlements";

type BottomItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  matches?: string[];
  module?: TenantModuleId;
};

const ITEMS: BottomItem[] = [
  { href: "/cliente/painel", label: "Inicio", icon: LayoutGrid },
  { href: "/cliente/painel/inbox", label: "Conversas", icon: MessageSquare, module: "inbox" },
  { href: "/cliente/painel/crm", label: "Clientes", icon: Target, matches: ["/cliente/painel/pipeline", "/cliente/painel/comercial"], module: "crm" },
  { href: "/cliente/painel/agenda", label: "Agenda", icon: CalendarDays, matches: ["/cliente/painel/follow-ups", "/cliente/painel/reunioes-assistidas"], module: "crm" },
  {
    href: "/cliente/painel/campanhas",
    label: "Crescer",
    icon: TrendingUp,
    matches: [
      "/cliente/painel/captacao",
      "/cliente/painel/disparos",
      "/cliente/painel/automacao-instagram",
      "/cliente/painel/configuracoes/integracoes",
    ],
    module: "marketing",
  },
];

function isActive(pathname: string, href: string, matches: string[] = []) {
  if (href === "/cliente/painel") return pathname === href;
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  return matches.some((match) => pathname === match || pathname.startsWith(`${match}/`));
}

export function ClienteBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasModule } = useClienteTenant();

  const chatOpenOnMobile = pathname.startsWith("/cliente/painel/inbox") && Boolean(searchParams.get("chatId"));
  if (chatOpenOnMobile) return null;

  const visibleItems = ITEMS.filter((item) => !item.module || hasModule(item.module)).slice(0, 5);
  if (!visibleItems.length) return null;

  return (
    <nav className="client-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_96%,transparent)] px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-xl lg:hidden">
      <ul
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.matches);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[58px] flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-semibold transition active:scale-95 ${
                  active
                    ? "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"
                    : "text-[var(--cliente-text-soft)] hover:bg-[var(--cliente-surface-muted)] hover:text-[var(--cliente-text)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1 truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
