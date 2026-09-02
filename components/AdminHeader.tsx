"use client";

import { FormEvent, useMemo, useState } from "react";
import { Menu, Search, ChevronLeft, ChevronRight, LogOut, Shield, User2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AdminHeader({
  onOpenSidebar,
  collapsed,
  setCollapsed,
}: {
  onOpenSidebar: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const { profile, isAdmin, signOutUser } = useAuth();
  const [search, setSearch] = useState("");

  const roleLabel = useMemo(() => {
    if (!profile) return "Operador";
    if (profile.role === "admin" || profile.role === "agency_owner") return "Dono da Altum";
    if (profile.role === "agency_admin") return "Administrador";
    if (profile.role === "agency_agent") return "Operador da Altum";
    if (profile.role === "closer") return "Closer";
    if (
      profile.role === "client" ||
      profile.role === "client_owner" ||
      profile.role === "client_admin" ||
      profile.role === "client_agent" ||
      profile.role === "client_viewer"
    ) {
      return "Cliente";
    }
    return "SDR";
  }, [profile]);

  function openCommandPalette(initialQuery: string) {
    window.dispatchEvent(
      new CustomEvent("altum:command-open", {
        detail: { query: initialQuery },
      })
    );
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    openCommandPalette(search.trim());
  }

  return (
    <header className="h-16 flex items-center justify-between border-b border-slate-200 bg-white px-4 text-slate-900 shadow-sm md:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSidebar}
          className="rounded-lg p-2 transition hover:bg-slate-100 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={18} />
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
          aria-label="Recolher/Expandir sidebar"
          title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <div className="hidden md:flex flex-col leading-tight">
          <span className="text-[12px] font-semibold text-slate-900">ALTUM · Administração</span>
          <span className="text-[10px] font-medium text-slate-500">Gestão da plataforma</span>
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl mx-4 hidden md:block">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar modulo, cliente, campanha ou acao"
            className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => openCommandPalette(search.trim())}
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-900"
          >
            Ctrl+K
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 md:flex">
          {isAdmin ? <Shield size={14} className="text-blue-600" /> : <User2 size={14} className="text-emerald-600" />}
          <span>{profile?.name || "Operador"}</span>
          <span className="text-slate-400">- {roleLabel}</span>
        </div>

        <button
          onClick={() => void signOutUser()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          title="Sair"
        >
          <LogOut size={14} />
          <span className="hidden md:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
