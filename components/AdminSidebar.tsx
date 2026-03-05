"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext"; // Importando sua lógica de segurança
import {
  LayoutDashboard,
  Target,
  CalendarCheck,
  Users,
  UserCog,
  FolderKanban,
  FileText,
  DollarSign,
  Settings,
  MessageSquare,
  BrainCircuit,
  LineChart,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldAlert,
} from "lucide-react";

// Definição completa do Menu do ALTUM OS
const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/admin/dashboard", adminOnly: false },
  { label: "Prospecção (CRM)", icon: Target, href: "/admin/prospeccao", adminOnly: false },
  { label: "Gerador de Leads", icon: ShieldAlert, href: "/admin/prospeccao/gerar", adminOnly: true }, // BLOQUEADO PARA VENDEDOR
  { label: "Inbox (WhatsApp)", icon: MessageSquare, href: "/admin/chat", adminOnly: false },
  { label: "Campanhas", icon: LineChart, href: "/admin/campanhas", adminOnly: true },
  { label: "IA da Plataforma", icon: BrainCircuit, href: "/admin/ia", adminOnly: false },
  { label: "Playbook Comercial", icon: BookOpen, href: "/admin/playbook", adminOnly: false },
  { label: "Equipe", icon: UserCog, href: "/admin/equipe", adminOnly: true },
  { label: "Atividades", icon: CalendarCheck, href: "/admin/atividades", adminOnly: false },
  { label: "Clientes", icon: Users, href: "/admin/clientes", adminOnly: false },
  { label: "Projetos", icon: FolderKanban, href: "/admin/projetos", adminOnly: false },
  { label: "Orçamentos", icon: FileText, href: "/admin/orcamentos", adminOnly: false },
  { label: "Financeiro", icon: DollarSign, href: "/admin/financeiro", adminOnly: false }, // A página já filtra os dados
  { label: "Pipeline", icon: Settings, href: "/admin/pipeline", adminOnly: true },       // BLOQUEADO PARA VENDEDOR
  { label: "Configurações", icon: Settings, href: "/admin/config", adminOnly: true },    // BLOQUEADO PARA VENDEDOR
];

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
  const { isAdmin } = useAuth(); // Puxando o cargo do usuário logado

  // FILTRAGEM DE SEGURANÇA: Só mostra itens adminOnly se o usuário for Admin
  const filteredMenu = useMemo(() => {
    return menuItems.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin]);

  const renderMenuItems = (isMobile: boolean = false) => (
    filteredMenu.map((item) => {
      const active = pathname.startsWith(item.href);
      const Icon = item.icon;

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => isMobile && setMobileOpen(false)}
          className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition font-medium
            ${active
              ? "bg-blue-600/10 text-blue-100 border border-blue-500/20"
              : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
        >
          <Icon
            size={20}
            className={`shrink-0 ${active ? "text-blue-400" : "text-white/50 group-hover:text-white"}`}
          />
          
          {(!collapsed || isMobile) && (
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">
              {item.label}
            </span>
          )}
          
          {collapsed && !isMobile && <Tooltip text={item.label} />}
          
          {active && (!collapsed || isMobile) && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
          )}
        </Link>
      );
    })
  );

  return (
    <>
      {/* VERSÃO DESKTOP */}
      <aside className={`hidden md:flex h-full bg-[#0E0E0E] border-r border-white/10 flex-col transition-all duration-300 ${collapsed ? "w-[70px]" : "w-[240px]"}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          {!collapsed && (
            <div className="flex flex-col leading-tight overflow-hidden text-white/85">
              <span className="text-[12px] tracking-widest font-bold truncate italic">ALTUM</span>
              <span className="text-[10px] text-white/20 truncate uppercase font-bold tracking-tighter">
                {isAdmin ? "Enterprise OS" : "Partner OS"}
              </span>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg hover:bg-white/10 transition text-white/60">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {renderMenuItems()}
        </nav>

        {!collapsed && (
          <div className="p-4 border-t border-white/5 text-[9px] font-black text-white/10 text-center uppercase tracking-widest italic">
            Altum Digital • 2026
          </div>
        )}
      </aside>

      {/* VERSÃO MOBILE */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      
      <aside className={`md:hidden fixed z-50 top-0 left-0 h-full w-[280px] bg-[#0E0E0E] border-r border-white/10 transform transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <span className="text-[12px] tracking-widest text-white/85 font-bold italic">ALTUM</span>
          <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/60"><X size={20} /></button>
        </div>
        <nav className="px-2 py-4 space-y-1">
          {renderMenuItems(true)}
        </nav>
      </aside>
    </>
  );
}
