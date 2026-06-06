"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, LayoutGrid, MessageSquare, Target, TrendingUp } from "lucide-react";

type BottomItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  matches?: string[];
};

const ITEMS: BottomItem[] = [
  { href: "/cliente/painel", label: "Inicio", icon: LayoutGrid },
  { href: "/cliente/painel/inbox", label: "Conversas", icon: MessageSquare },
  { href: "/cliente/painel/crm", label: "Clientes", icon: Target, matches: ["/cliente/painel/pipeline", "/cliente/painel/comercial"] },
  { href: "/cliente/painel/agenda", label: "Agenda", icon: CalendarDays, matches: ["/cliente/painel/follow-ups"] },
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

  const chatOpenOnMobile = pathname.startsWith("/cliente/painel/inbox") && Boolean(searchParams.get("chatId"));
  if (chatOpenOnMobile) return null;

  const visibleItems = ITEMS.slice(0, 5);
  if (!visibleItems.length) return null;

  return (
    <nav className="client-glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.55rem)] z-40 rounded-[26px] border border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel)_92%,white)] p-1.5 shadow-[var(--cliente-shadow-hard)] lg:hidden">
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
                prefetch={false}
                className={`flex min-h-12 flex-col items-center justify-center rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${
                  active
                    ? "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-accent-soft)_76%,white),var(--cliente-accent-soft))] text-[var(--cliente-accent)] shadow-[inset_0_0_0_1px_var(--cliente-border-strong)]"
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
