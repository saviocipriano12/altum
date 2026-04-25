"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, MessageSquare, Settings, Users } from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

type BottomItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  capability?: string;
};

const ITEMS: BottomItem[] = [
  { href: "/cliente/painel", label: "Inicio", icon: LayoutGrid },
  { href: "/cliente/painel/inbox", label: "Conversas", icon: MessageSquare },
  { href: "/cliente/painel/crm", label: "CRM", icon: Users },
  { href: "/cliente/painel/metricas", label: "Metricas", icon: BarChart3 },
  { href: "/cliente/painel/configuracoes", label: "Ajustes", icon: Settings, capability: "manage_settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/cliente/painel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClienteBottomNav() {
  const pathname = usePathname();
  const { hasCapability } = useClienteTenant();

  const visibleItems = ITEMS.filter(
    (item) => !item.capability || hasCapability(item.capability)
  ).slice(0, 5);
  if (!visibleItems.length) return null;

  return (
    <nav className="client-glass fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.4rem)] z-40 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel)] p-1 shadow-[var(--cliente-shadow-hard)] lg:hidden">
      <ul
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                  active
                    ? "bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)] shadow-[inset_0_0_0_1px_var(--cliente-border-strong)]"
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
