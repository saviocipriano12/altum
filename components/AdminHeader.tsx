"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, ChevronRight, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { filterAdminNavItems } from "@/components/admin/admin-navigation";

export default function AdminHeader({ onOpenSidebar }: {
  onOpenSidebar: () => void; collapsed: boolean; setCollapsed: (value: boolean) => void;
}) {
  const { profile, isAdmin, signOutUser } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = filterAdminNavItems(isAdmin).sort((a, b) => b.href.length - a.href.length).find(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const detail = current && pathname !== current.href;
  const initials = (profile?.name || "Altum").split(" ").filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return <header className="relative flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:px-8">
    <div className="flex min-w-0 items-center gap-3"><button aria-label="Abrir menu" onClick={onOpenSidebar} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"><Menu size={18} /></button>
      <nav aria-label="Caminho da página" className="flex min-w-0 items-center gap-2 text-xs"><span className="hidden text-slate-400 sm:inline">Administração</span><ChevronRight size={13} className="hidden text-slate-300 sm:block" />{detail ? <><Link href={current.href} className="truncate text-slate-500 hover:text-indigo-600">{current.shortLabel || current.label}</Link><ChevronRight size={13} className="text-slate-300" /><span className="font-medium text-slate-800">{pathname.endsWith("/portal") ? "Configuração da empresa" : "Detalhes"}</span></> : <span className="truncate font-medium text-slate-800">{current?.shortLabel || current?.label || "Admin"}</span>}</nav>
    </div>
    <div className="flex items-center gap-3"><button onClick={() => window.dispatchEvent(new CustomEvent("altum:command-open", { detail: { query: "" } }))} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-700" aria-label="Buscar páginas e ações"><Search size={15} /><span className="hidden lg:inline">Buscar páginas e ações</span><kbd className="ml-8 hidden text-[10px] text-slate-400 lg:inline">Ctrl K</kbd></button>
      <div className="relative"><button aria-label="Menu da conta" aria-expanded={open} aria-controls="admin-account-menu" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg p-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700">{initials}</span><ChevronDown size={13} /></button>
        {open && <><button tabIndex={-1} aria-label="Fechar menu da conta" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} /><div id="admin-account-menu" className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"><div className="border-b border-slate-100 p-3"><p className="truncate text-sm font-semibold text-slate-800">{profile?.name || "Equipe Altum"}</p><p className="mt-1 text-xs text-slate-500">{isAdmin ? "Administração Altum" : "Operação Altum"}</p></div><button className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => void signOutUser()}><LogOut size={15} />Sair da conta</button></div></>}
      </div>
    </div>
  </header>;
}
