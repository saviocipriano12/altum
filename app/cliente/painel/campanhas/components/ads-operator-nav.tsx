"use client";

import Link from "next/link";
import { BarChart3, Crosshair, RadioTower, Search } from "lucide-react";

const items = [
  { id: "overview", label: "Visão geral", href: "/cliente/painel/campanhas", icon: BarChart3 },
  { id: "google", label: "Google Ads", href: "/cliente/painel/campanhas/google-ads", icon: Search },
  { id: "meta", label: "Meta Ads", href: "/cliente/painel/campanhas/meta-ads", icon: RadioTower },
  { id: "tracking", label: "Rastreamento", href: "/cliente/painel/campanhas/rastreamento", icon: Crosshair },
] as const;

export function AdsOperatorNav({ active }: { active: (typeof items)[number]["id"] }) {
  return (
    <nav aria-label="Áreas de campanhas" className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-1.5 shadow-[var(--cliente-shadow-soft)]">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${active === item.id ? "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]" : "text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)] hover:text-[var(--cliente-card-text)]"}`}>
            <Icon className="h-4 w-4" />{item.label}
          </Link>
        );
      })}
    </nav>
  );
}
