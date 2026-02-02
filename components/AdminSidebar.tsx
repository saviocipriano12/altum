"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,         // Ícone para Prospecção/CRM
  CalendarCheck,  // Ícone para Atividades
  Users,          // Ícone para Clientes
  FolderKanban,   // Ícone para Projetos
  FileText,       // Ícone para Orçamentos
  DollarSign,     // Ícone para Financeiro
  Settings,       // Ícone para Configurações
  MessageSquare,  // Ícone para o Chat (WhatsApp)
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

// Definição completa do Menu do ALTUM OS
const menu = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/admin/dashboard" },
  { label: "Prospecção (CRM)", icon: Target, href: "/admin/prospeccao" },
  { label: "Inbox (WhatsApp)", icon: MessageSquare, href: "/admin/chat" }, // Novo módulo que vamos criar
  { label: "Atividades", icon: CalendarCheck, href: "/admin/atividades" },
  { label: "Clientes", icon: Users, href: "/admin/clientes" },
  { label: "Projetos", icon: FolderKanban, href: "/admin/projetos" },
  { label: "Orçamentos", icon: FileText, href: "/admin/orcamentos" },
  { label: "Financeiro", icon: DollarSign, href: "/admin/financeiro" },
  { label: "Configurações", icon: Settings, href: "/admin/config" },
];

// Componente visual para mostrar o nome quando a barra está recolhida
function Tooltip({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-lg border border-white/10 bg-[#111111] px-2 py-1 text-[11px] text-white/80 shadow-lg opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1 transition z-50">
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

  // --- VERSÃO DESKTOP ---
  const desktopAside = (
    <aside
      className={`hidden md:flex h-full bg-[#0E0E0E] border-r border-white/10 flex-col transition-all duration-300 ${
        collapsed ? "w-[70px]" : "w-[240px]"
      }`}
    >
      {/* Topo da Sidebar */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex flex-col leading-tight overflow-hidden">
            <span className="text-[12px] tracking-widest text-white/85 font-semibold truncate">
              ALTUM
            </span>
            <span className="text-[10px] text-white/35 truncate">Admin Console</span>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-white/10 transition text-white/60 hover:text-white"
          aria-label="Recolher/Expandir sidebar"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Lista de Navegação */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10">
        {menu.map((item) => {
          // Verifica se a rota atual começa com o href do item (para manter ativo em sub-rotas)
          // Ex: se estiver em /admin/prospeccao/gerar, o botão CRM fica ativo.
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition font-medium
                ${
                  active
                    ? "bg-blue-600/10 text-blue-100 border border-blue-500/20"
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
            >
              <Icon
                size={20}
                className={`shrink-0 ${active ? "text-blue-400" : "text-white/50 group-hover:text-white"}`}
              />
              
              {!collapsed && (
                <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                  {item.label}
                </span>
              )}
              
              {collapsed && <Tooltip text={item.label} />}
              
              {/* Indicador de ativo (bolinha azul) */}
              {active && !collapsed && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé da Sidebar */}
      {!collapsed && (
        <div className="p-4 border-t border-white/10 text-[10px] text-white/30 text-center">
          ALTUM OS • v1.0
        </div>
      )}
    </aside>
  );

  // --- VERSÃO MOBILE (Drawer) ---
  const mobileDrawer = (
    <>
      {/* Fundo escuro (Backdrop) */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      
      {/* Menu Lateral Deslizante */}
      <aside
        className={`md:hidden fixed z-50 top-0 left-0 h-full w-[280px] bg-[#0E0E0E] border-r border-white/10 transform transition-transform duration-300 shadow-2xl ${
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
            className="p-2 rounded-lg hover:bg-white/10 transition text-white/60"
            aria-label="Fechar menu"
          >
            <X size={20} />
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
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition font-medium
                  ${
                    active
                      ? "bg-blue-600/10 text-blue-100 border border-blue-500/20"
                      : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
              >
                <Icon
                  size={20}
                  className={active ? "text-blue-400" : "text-white/50"}
                />
                <span className="whitespace-nowrap">{item.label}</span>
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );

  return (
    <>
      {desktopAside}
      {mobileDrawer}
    </>
  );
}