"use client";

import { Menu, Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function AdminHeader({
  onOpenSidebar,
  collapsed,
  setCollapsed,
}: {
  onOpenSidebar: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-[#0B0B0B]/80 backdrop-blur">
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Abrir menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop collapse toggle (extra no header, fica premium) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:inline-flex p-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Recolher/Expandir sidebar"
          title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <div className="hidden md:flex flex-col leading-tight">
          <span className="text-[12px] text-white/80 font-medium">ALTUM • Painel Administrativo</span>
          <span className="text-[10px] text-white/35">Console operacional</span>
        </div>
      </div>

      {/* Command/search bar (base do ⌘K) */}
      <div className="flex-1 max-w-xl mx-4 hidden md:block">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-white/70">
          <Search size={16} className="text-white/40" />
          <input
            placeholder="Buscar (em breve: ⌘K)"
            className="w-full bg-transparent text-xs outline-none placeholder:text-white/35"
          />
          <span className="text-[10px] text-white/35 border border-white/10 rounded-md px-2 py-0.5">
            ⌘K
          </span>
        </div>
      </div>

      {/* Direita (placeholder pra user, notif, etc.) */}
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 text-xs text-white/50">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Operação rodando
        </div>

        <div className="h-8 w-8 rounded-full bg-blue-600/30 border border-blue-500/30" />
      </div>
    </header>
  );
}
