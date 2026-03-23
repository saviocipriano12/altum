"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-card-text-muted)]",
  success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-500 dark:text-emerald-100",
  warning: "border-amber-400/20 bg-amber-500/10 text-amber-600 dark:text-amber-100",
  danger: "border-rose-400/20 bg-rose-500/10 text-rose-600 dark:text-rose-100",
  info: "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]",
};

export function PanelCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`client-glass rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)] ${className}`}
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
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--cliente-card-text)] md:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
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
    <PanelCard className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-[var(--cliente-card-text)]">{value}</p>
          {trend ? <p className="mt-2 text-[11px] text-[var(--cliente-card-text-soft)]">{trend}</p> : null}
        </div>
        {Icon ? (
          <span className="inline-flex rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] p-2.5 text-[var(--cliente-accent)]">
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
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${BADGE_TONE[tone]}`}
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
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{subtitle}</p> : null}
    </div>
  );
}

