"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileText,
  DollarSign,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

const menu = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/admin/dashboard" },
  { label: "Clientes", icon: Users, href: "/admin/clientes" },
  { label: "Projetos", icon: FolderKanban, href: "/admin/projetos" },
  { label: "Orçamentos", icon: FileText, href: "/admin/orcamentos" },
  { label: "Financeiro", icon: DollarSign, href: "/admin/financeiro" },
  { label: "Configurações", icon: Settings, href: "/admin/config" },
];

function Tooltip({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-lg border border-white/10 bg-[#111111] px-2 py-1 text-[11px] text-white/80 shadow-lg opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1 transition">
      {text}
    </span>
  );
}

export default function AdminSidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const pathname = usePathname();

  const desktopAside = (
    <aside className="hidden md:flex h-full bg-[#0E0E0E] border-r border-white/10 flex-col">
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] tracking-widest text-white/85 font-semibold">
              ALTUM
            </span>
            <span className="text-[10px] text-white/35">Admin Console</span>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Recolher/Expandir sidebar"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {menu.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition
                ${
                  active
                    ? "bg-blue-600/20 text-white border border-blue-500/30"
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
            >
              <Icon size={18} className={active ? "text-blue-200" : "text-white/65"} />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              {collapsed && <Tooltip text={item.label} />}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-white/10 text-[11px] text-white/40">
          ALTUM Console • v1.0
        </div>
      )}
    </aside>
  );

  const mobileDrawer = (
    <aside
      className={`md:hidden fixed z-50 top-0 left-0 h-full w-[280px] bg-[#0E0E0E] border-r border-white/10 transform transition-transform duration-300 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
        <div className="flex flex-col leading-tight">
          <span className="text-[12px] tracking-widest text-white/85 font-semibold">
            ALTUM
          </span>
          <span className="text-[10px] text-white/35">Admin Console</span>
        </div>

        <button
          onClick={() => setMobileOpen(false)}
          className="p-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="px-2 py-4 space-y-1">
        {menu.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition
                ${
                  active
                    ? "bg-blue-600/20 text-white border border-blue-500/30"
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
            >
              <Icon size={18} className={active ? "text-blue-200" : "text-white/65"} />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <>
      {desktopAside}
      {mobileDrawer}
    </>
  );
}
