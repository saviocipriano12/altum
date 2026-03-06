"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Cable,
  ChevronRight,
  Crown,
  LayoutGrid,
  MessageSquare,
  Shield,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { StateBadge } from "@/app/cliente/painel/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const NAV_GROUPS = [
  {
    title: "Workspace",
    items: [{ href: "/cliente/painel", label: "Dashboard", icon: LayoutGrid }],
  },
  {
    title: "Revenue Ops",
    items: [
      { href: "/cliente/painel/inbox", label: "Inbox", icon: MessageSquare },
      { href: "/cliente/painel/crm", label: "CRM", icon: Users },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/cliente/painel/ia", label: "IA", icon: Bot },
      { href: "/cliente/painel/automacoes", label: "Automacoes", icon: Cable },
      { href: "/cliente/painel/metricas", label: "Metricas", icon: Target },
    ],
  },
  {
    title: "Governanca",
    items: [{ href: "/cliente/painel/configuracoes", label: "Configuracoes", icon: Settings }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/cliente/painel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClienteSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const { tenant } = useClienteTenant();
  const roleLabel = tenant?.tenantRole?.replace(/_/g, " ") || "client viewer";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/55 transition-opacity lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col border-r border-white/10 bg-[#0b111c]/98 p-4 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-[#111d35] via-[#0e1730] to-[#0b1224] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/65">ALTUM OS</p>
              <p className="mt-1 truncate text-base font-semibold text-white">
                {tenant?.tenantName || tenant?.clientName || "Cliente"}
              </p>
              <p className="mt-1 text-xs text-white/55">Tenant {tenant?.tenantId || "-"}</p>
            </div>
            <span className="inline-flex rounded-xl border border-cyan-300/25 bg-cyan-400/10 p-2 text-cyan-100">
              <Crown className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Plano operacional</p>
              <p className="mt-1 text-sm font-medium text-white">Premium Workspace</p>
            </div>
            <StateBadge label="ativo" tone="success" />
          </div>
        </div>

        <nav className="mt-4 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-white/38">{group.title}</p>
              <div className="space-y-1.5">
                {group.items.map((item) => {
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
                      <ChevronRight
                        className={`h-4 w-4 transition ${
                          active ? "opacity-100" : "opacity-0 group-hover:opacity-75"
                        }`}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="inline-flex rounded-xl border border-white/12 bg-white/[0.04] p-2 text-white/80">
            <Shield className="h-4 w-4" />
          </div>
          <p className="mt-3 text-sm font-medium text-white">Workspace governado</p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/48">{roleLabel}</p>
          <p className="mt-2 text-sm text-white/58">
            Seu painel opera com isolamento por tenant, canais dedicados e visibilidade executiva unificada.
          </p>
        </div>
      </aside>
    </>
  );
}
