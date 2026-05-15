"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { SectionHeader } from "@/app/cliente/painel/components/ui";

type OpportunitiesView = "list" | "kanban" | "agenda" | "proposals";

const VIEW_ITEMS: Array<{ value: OpportunitiesView; label: string; href: string }> = [
  { value: "list", label: "Lista", href: "/cliente/painel/crm" },
  { value: "kanban", label: "Kanban", href: "/cliente/painel/pipeline" },
  { value: "agenda", label: "Agenda", href: "/cliente/painel/follow-ups" },
  { value: "proposals", label: "Propostas", href: "/cliente/painel/comercial" },
];

export function ClientOpportunitiesHeader({
  activeView,
  action,
}: {
  activeView: OpportunitiesView;
  action?: ReactNode;
}) {
  const searchParams = useSearchParams();

  const preservedQuery = useMemo(() => {
    const next = new URLSearchParams();
    const leadId = searchParams.get("leadId");
    if (leadId) next.set("leadId", leadId);
    return next.toString();
  }, [searchParams]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Clientes & Oportunidades"
        subtitle="CRM, funil, agenda e propostas do mesmo relacionamento comercial."
        action={action}
      />

      <div className="client-glass rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-1.5 shadow-[var(--cliente-shadow-soft)]">
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          {VIEW_ITEMS.map((item) => {
            const active = item.value === activeView;
            const href = preservedQuery ? `${item.href}?${preservedQuery}` : item.href;

            return (
              <Link
                key={item.value}
                href={href}
                className={`inline-flex items-center justify-center rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--cliente-primary)] text-white shadow-[0_16px_30px_-24px_var(--cliente-accent-glow)]"
                    : "text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
