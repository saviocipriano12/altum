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
  agenda: "Retornos",
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
      title="Vender com contexto, proxima acao e IA trabalhando junto."
      description="Clientes, oportunidades, propostas, retornos e agenda ficam conectados para o time vender sem perder historico."
      action={action}
    />
  );
}
