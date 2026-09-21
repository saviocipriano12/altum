"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, X, Settings2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { filterAdminNavItems, type AdminNavItem } from "@/components/admin/admin-navigation";

const navigation = [
  { label: "Operação", routes: ["/admin/operacao", "/admin/dashboard", "/admin/clientes", "/admin/chat"] },
  { label: "Gestão", routes: ["/admin/prospeccao", "/admin/projetos", "/admin/midia", "/admin/financeiro", "/admin/ia"] },
];
const children: Record<string, string[]> = {
  "/admin/clientes": ["/admin/saas"],
  "/admin/prospeccao": ["/admin/pipeline", "/admin/orcamentos", "/admin/prospeccao/gerar", "/admin/playbook"],
  "/admin/projetos": ["/admin/atividades"],
  "/admin/midia": ["/admin/estrategias", "/admin/campanhas", "/admin/templates"],
};

export default function AdminSidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: {
  collapsed: boolean; setCollapsed: (value: boolean) => void;
  mobileOpen: boolean; setMobileOpen: (value: boolean) => void;
}) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const items = filterAdminNavItems(isAdmin);
  const current = [...items].sort((a, b) => b.href.length - a.href.length).find(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen, setMobileOpen]);
  const toggle = (key: string, active: boolean) => setExpanded(previous => ({ ...previous, [key]: !(previous[key] ?? active) }));

  function link(item: AdminNavItem, compact: boolean, nested = false) {
    const active = current?.href === item.href;
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined} onClick={() => setMobileOpen(false)}
      className={`group flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"} ${compact ? "justify-center" : ""} ${nested ? "min-h-9 text-xs" : ""}`}>
      {nested ? <span className={`h-1 w-1 shrink-0 rounded-full ${active ? "bg-indigo-600" : "bg-slate-300"}`} /> : <Icon size={18} strokeWidth={1.7} className="shrink-0" />}
      {!compact && <span className="truncate">{item.shortLabel || item.label}</span>}
    </Link>;
  }

  function menu(mobile: boolean) {
    const compact = collapsed && !mobile;
    return <><div className="flex h-16 shrink-0 items-center justify-between px-5">
      <Link href={isAdmin ? "/admin/operacao" : "/admin/dashboard"} onClick={() => setMobileOpen(false)} aria-label="Altum — início" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">A</span>
        {!compact && <span className="text-lg font-semibold tracking-tight text-slate-950">altum<span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-medium tracking-normal text-slate-500">admin</span></span>}
      </Link>
      {mobile && <button aria-label="Fechar menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMobileOpen(false)}><X size={18} /></button>}
    </div>
    <nav aria-label="Navegação administrativa" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {navigation.map(section => <section key={section.label}>
        {!compact && <p className="mb-2 px-3 text-[11px] font-medium text-slate-400">{section.label}</p>}
        <div className="space-y-1">{section.routes.map(route => {
          const item = items.find(entry => entry.href === route); if (!item) return null;
          const subitems = (children[route] || []).flatMap(href => items.filter(entry => entry.href === href));
          const active = subitems.some(entry => current?.href === entry.href);
          const open = expanded[route] ?? active;
          return <div key={route}><div className="flex items-center gap-0.5"><div className="min-w-0 flex-1">{link(item, compact)}</div>{!!subitems.length && !compact && <button aria-label={`Opções de ${item.shortLabel || item.label}`} aria-expanded={open} onClick={() => toggle(route, active)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} /></button>}</div>{open && !compact && <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">{subitems.map(entry => link(entry, false, true))}</div>}</div>;
        })}</div>
      </section>)}
      {isAdmin && <section>{compact ? items.filter(item => ["/admin/equipe", "/admin/mcp", "/admin/config"].includes(item.href)).map(item => link(item, true)) : <><button onClick={() => toggle("settings", ["/admin/equipe", "/admin/mcp", "/admin/config"].includes(current?.href || ""))} aria-expanded={expanded.settings ?? ["/admin/equipe", "/admin/mcp", "/admin/config"].includes(current?.href || "")} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-slate-100"><span className="flex items-center gap-3"><Settings2 size={18} strokeWidth={1.7} />Administração</span><ChevronDown size={14} /></button>{(expanded.settings ?? ["/admin/equipe", "/admin/mcp", "/admin/config"].includes(current?.href || "")) && <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">{items.filter(item => ["/admin/equipe", "/admin/mcp", "/admin/config"].includes(item.href)).map(item => link(item, false, true))}</div>}</>}</section>}
    </nav>
    {!mobile && <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} className="m-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-100">{collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} />Recolher menu</>}</button>}
    </>;
  }

  return <><aside className={`hidden h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] md:flex ${collapsed ? "w-[72px]" : "w-[248px]"}`}>{menu(false)}</aside>{mobileOpen && <><div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} /><aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-xl md:hidden">{menu(true)}</aside></>}</>;
}
