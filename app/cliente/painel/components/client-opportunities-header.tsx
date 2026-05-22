"use client";

import type { ReactNode } from "react";
import {
  CrmHero,
  type CrmRouteLabel,
} from "@/app/cliente/painel/components/crm-workspace";

type OpportunitiesView = "list" | "kanban" | "agenda" | "proposals";

const viewToRoute: Record<OpportunitiesView, CrmRouteLabel> = {
  list: "Lista",
  kanban: "Funil",
  agenda: "Atividades",
  proposals: "Propostas",
};

export function ClientOpportunitiesHeader({
  activeView,
  action,
}: {
  activeView: OpportunitiesView;
  action?: ReactNode;
}) {
  return (
    <CrmHero
      active={viewToRoute[activeView]}
      title="Clientes, oportunidades, conversas e propostas em um CRM familiar."
      description="A Altum organiza a operacao comercial como um CRM tradicional, com IA aplicada ao que o time precisa fazer agora."
      action={action}
    />
  );
}
