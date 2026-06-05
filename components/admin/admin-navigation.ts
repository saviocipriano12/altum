"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  CalendarCheck,
  DollarSign,
  FileText,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  MessageSquareText,
  Rocket,
  Settings,
  ShieldCheck,
  Target,
  UserCog,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  shortLabel?: string;
  description: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  section: "comando" | "receita" | "entrega" | "gestao";
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    label: "Cockpit da agencia",
    shortLabel: "Cockpit",
    description: "Prioridades, riscos e leitura geral da Altum.",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    section: "comando",
  },
  {
    label: "Prospeccao",
    description: "CRM comercial da agencia e oportunidades captadas.",
    href: "/admin/prospeccao",
    icon: Target,
    section: "receita",
  },
  {
    label: "Gerador Maps",
    description: "Busca qualificada de leads no Google Maps.",
    href: "/admin/prospeccao/gerar",
    icon: Rocket,
    adminOnly: true,
    section: "receita",
  },
  {
    label: "Conversas internas",
    shortLabel: "Conversas",
    description: "Atendimento da agencia, prospeccao e historico operacional.",
    href: "/admin/chat",
    icon: MessageSquare,
    section: "receita",
  },
  {
    label: "Midia paga",
    description: "Contas, sincronizacao e analise de campanhas de trafego.",
    href: "/admin/campanhas",
    icon: BarChart3,
    adminOnly: true,
    section: "receita",
  },
  {
    label: "Templates Meta",
    description: "Biblioteca de modelos oficiais para disparos WhatsApp.",
    href: "/admin/templates",
    icon: MessageSquareText,
    adminOnly: true,
    section: "receita",
  },
  {
    label: "IA da plataforma",
    description: "Sinais, handoffs e saude da IA nos tenants.",
    href: "/admin/ia",
    icon: Bot,
    section: "comando",
  },
  {
    label: "Playbook comercial",
    description: "Oferta, abordagem e padroes de venda da Altum.",
    href: "/admin/playbook",
    icon: BookOpen,
    section: "receita",
  },
  {
    label: "Clientes",
    description: "Base de clientes, portais e implantacao.",
    href: "/admin/clientes",
    icon: Building2,
    section: "gestao",
  },
  {
    label: "Projetos",
    description: "Entregas, status e producao de servicos digitais.",
    href: "/admin/projetos",
    icon: FolderKanban,
    section: "entrega",
  },
  {
    label: "Atividades",
    description: "Agenda interna, follow-ups e tarefas do time.",
    href: "/admin/atividades",
    icon: CalendarCheck,
    section: "entrega",
  },
  {
    label: "Orcamentos",
    description: "Propostas, valores e aprovacao comercial.",
    href: "/admin/orcamentos",
    icon: FileText,
    section: "receita",
  },
  {
    label: "Financeiro",
    description: "Receitas, despesas, vencimentos e comissoes.",
    href: "/admin/financeiro",
    icon: DollarSign,
    section: "gestao",
  },
  {
    label: "Pipeline",
    description: "Configuracao dos fluxos comerciais internos.",
    href: "/admin/pipeline",
    icon: Activity,
    adminOnly: true,
    section: "gestao",
  },
  {
    label: "Equipe",
    description: "Pessoas, papeis e operacao interna.",
    href: "/admin/equipe",
    icon: UserCog,
    adminOnly: true,
    section: "gestao",
  },
  {
    label: "Configuracoes",
    description: "Controles avancados da agencia.",
    href: "/admin/config",
    icon: Settings,
    adminOnly: true,
    section: "gestao",
  },
];

export const ADMIN_NAV_SECTIONS: Array<{
  key: AdminNavItem["section"];
  label: string;
  icon: LucideIcon;
}> = [
  { key: "comando", label: "Comando", icon: ShieldCheck },
  { key: "receita", label: "Receita", icon: Target },
  { key: "entrega", label: "Entrega", icon: FolderKanban },
  { key: "gestao", label: "Gestao", icon: Users },
];

export function filterAdminNavItems(isAdmin: boolean) {
  return ADMIN_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}
