"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-white/15 bg-white/5 text-white/80",
  success: "border-emerald-300/30 bg-emerald-400/12 text-emerald-100",
  warning: "border-amber-300/30 bg-amber-400/12 text-amber-100",
  danger: "border-rose-300/30 bg-rose-400/12 text-rose-100",
  info: "border-cyan-300/30 bg-cyan-400/12 text-cyan-100",
};

export function PanelCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/12 bg-[#0f1522]/88 ${className}`}>
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
        <h2 className="text-lg font-semibold tracking-tight text-white md:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/58">{subtitle}</p> : null}
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
    <PanelCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">{label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-white">{value}</p>
          {trend ? <p className="mt-2 text-xs text-white/62">{trend}</p> : null}
        </div>
        {Icon ? (
          <span className="inline-flex rounded-lg border border-white/15 bg-white/[0.04] p-2 text-cyan-100">
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
      <p className="text-sm font-semibold text-white/90">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-xl text-sm text-white/55">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </PanelCard>
  );
}

export function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/66">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-white/48">{subtitle}</p> : null}
    </div>
  );
}
