"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  ADMIN_NAV_SECTIONS,
  filterAdminNavItems,
  type AdminNavItem,
} from "@/components/admin/admin-navigation";

function CollapsedTooltip({ item }: { item: AdminNavItem }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 min-w-44 -translate-y-1/2 translate-x-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 opacity-0 shadow-xl shadow-slate-950/10 transition group-hover:translate-x-0 group-hover:opacity-100">
      {item.shortLabel || item.label}
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
  const { isAdmin } = useAuth();

  const filteredMenu = useMemo(() => filterAdminNavItems(isAdmin), [isAdmin]);

  const renderLink = (item: AdminNavItem, isMobile = false) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    const showText = !collapsed || isMobile;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => isMobile && setMobileOpen(false)}
        className={`group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
          active
            ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
        } ${collapsed && !isMobile ? "justify-center px-2" : ""}`}
      >
        <Icon
          size={18}
          className={`shrink-0 ${
            active ? "text-white" : "text-slate-400 group-hover:text-slate-700"
          }`}
        />

        {showText ? (
          <span className="min-w-0 flex-1 truncate">
            {item.shortLabel || item.label}
          </span>
        ) : null}

        {active && showText ? (
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        ) : null}

        {collapsed && !isMobile ? <CollapsedTooltip item={item} /> : null}
      </Link>
    );
  };

  const renderMenu = (isMobile = false) => (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <div className="space-y-5">
        {ADMIN_NAV_SECTIONS.map((section) => {
          const items = filteredMenu.filter((item) => item.section === section.key);
          if (items.length === 0) return null;
          const SectionIcon = section.icon;
          const showText = !collapsed || isMobile;

          return (
            <section key={section.key} className="space-y-1.5">
              {showText ? (
                <div className="flex items-center gap-2 px-3 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <SectionIcon size={12} />
                  <span>{section.label}</span>
                </div>
              ) : (
                <div className="mx-auto my-3 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                  <SectionIcon size={14} />
                </div>
              )}

              <div className="space-y-1">
                {items.map((item) => renderLink(item, isMobile))}
              </div>
            </section>
          );
        })}
      </div>
    </nav>
  );

  const brand = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black tracking-[0.12em] text-white shadow-sm shadow-blue-600/20">
        A
      </div>
      <div className="min-w-0 leading-tight">
        <span className="block truncate text-[14px] font-black tracking-[0.22em] text-slate-950">
          ALTUM
        </span>
        <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Agency Command
        </span>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden h-full flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 md:flex ${
          collapsed ? "w-[76px]" : "w-[292px]"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-200 px-4">
          {collapsed ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-black tracking-[0.12em] text-white shadow-sm shadow-blue-600/20">
              A
            </div>
          ) : (
            brand
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {!collapsed ? (
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Sessao
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  {isAdmin ? "Admin total" : "Operador"}
                </p>
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
            </div>
          </div>
        ) : null}

        {renderMenu()}

        {!collapsed ? (
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
              <span>Altum OS</span>
              <span>2026</span>
            </div>
          </div>
        ) : null}
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 h-full w-[310px] transform border-r border-slate-200 bg-white shadow-2xl shadow-slate-950/20 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-200 px-4">
          {brand}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Sessao
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {isAdmin ? "Admin total" : "Operador"}
              </p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
          </div>
        </div>

        {renderMenu(true)}
      </aside>
    </>
  );
}
