"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Cable,
  ChevronRight,
  LayoutGrid,
  MessageSquare,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const NAV_ITEMS = [
  { href: "/cliente/painel", label: "Dashboard", icon: LayoutGrid },
  { href: "/cliente/painel/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/cliente/painel/crm", label: "CRM", icon: Users },
  { href: "/cliente/painel/ia", label: "IA", icon: Bot },
  { href: "/cliente/painel/automacoes", label: "Automacoes", icon: Cable },
  { href: "/cliente/painel/metricas", label: "Metricas", icon: Target },
  { href: "/cliente/painel/configuracoes", label: "Configuracoes", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/cliente/painel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClienteSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const { tenant } = useClienteTenant();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/55 transition-opacity lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[270px] border-r border-white/10 bg-[#0b111c]/98 p-4 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-[#111d35] to-[#0b1224] p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/65">ALTUM OS</p>
          <p className="mt-1 truncate text-base font-semibold text-white">
            {tenant?.tenantName || tenant?.clientName || "Cliente"}
          </p>
          <p className="mt-1 text-xs text-white/55">Tenant {tenant?.tenantId || "-"}</p>
        </div>

        <nav className="mt-4 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center justify-between rounded-xl border px-3 py-2.5 transition ${
                  active
                    ? "border-cyan-300/35 bg-cyan-400/14 text-white"
                    : "border-transparent bg-transparent text-white/72 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <ChevronRight className={`h-4 w-4 transition ${active ? "opacity-100" : "opacity-0 group-hover:opacity-75"}`} />
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
