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
    if (profile.role === "admin") return "Administrador";
    if (profile.role === "closer") return "Closer";
    if (profile.role === "client") return "Cliente";
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
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-[#0B0B0B]/80 backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Abrir menu"
        >
          <Menu size={18} />
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:inline-flex p-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Recolher/Expandir sidebar"
          title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <div className="hidden md:flex flex-col leading-tight">
          <span className="text-[12px] text-white/80 font-medium">ALTUM - Painel Administrativo</span>
          <span className="text-[10px] text-white/35">Console operacional</span>
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl mx-4 hidden md:block">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-white/70">
          <Search size={16} className="text-white/40" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar acoes, paginas e atalhos"
            className="w-full bg-transparent text-xs outline-none placeholder:text-white/35"
          />
          <button
            type="button"
            onClick={() => openCommandPalette(search.trim())}
            className="text-[10px] text-white/35 border border-white/10 rounded-md px-2 py-0.5 hover:text-white/70"
          >
            Ctrl+K
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 text-xs text-white/70 rounded-xl border border-white/10 px-3 py-1.5 bg-white/5">
          {isAdmin ? <Shield size={14} className="text-blue-300" /> : <User2 size={14} className="text-emerald-300" />}
          <span>{profile?.name || "Operador"}</span>
          <span className="text-white/35">- {roleLabel}</span>
        </div>

        <button
          onClick={() => void signOutUser()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10"
          title="Sair"
        >
          <LogOut size={14} />
          <span className="hidden md:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
