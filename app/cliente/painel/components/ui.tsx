"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)]",
  success: "border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100",
  warning: "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]",
  danger: "border-rose-400/25 bg-rose-500/10 text-rose-700 dark:text-rose-100",
  info: "border-[var(--cliente-border)] bg-[var(--cliente-accent-alt-soft)] text-[var(--cliente-accent-alt)]",
};

export function PanelCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`client-glass client-panel-card rounded-[10px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)] ring-1 ring-white/[0.02] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="client-section-header mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="client-section-title text-lg font-semibold text-[var(--cliente-card-text)] md:text-[1.28rem]">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: string;
}) {
  return (
    <PanelCard className="client-metric-card space-y-2 border-l-2 border-l-[var(--cliente-border-strong)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="client-metric-label text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="client-metric-value mt-2 text-2xl font-semibold leading-none text-[var(--cliente-card-text)]">{value}</p>
          {trend ? <p className="mt-2 text-[11px] text-[var(--cliente-card-text-soft)]">{trend}</p> : null}
        </div>
        {Icon ? (
          <span className="client-metric-icon inline-flex rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-2.5 text-[var(--cliente-accent)]">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </PanelCard>
  );
}

export function StateBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`client-state-badge inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${BADGE_TONE[tone]}`}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <PanelCard className="p-6 text-center">
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-xl text-sm text-[var(--cliente-card-text-soft)]">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </PanelCard>
  );
}

export function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="client-card-title">
      <h3 className="client-card-title-text text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{subtitle}</p> : null}
    </div>
  );
}

