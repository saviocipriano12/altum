"use client";

import { ReactNode, useEffect, useState } from "react";
import { LucideIcon, UserRound } from "lucide-react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "ai";
type ActionButtonTone = "primary" | "secondary" | "ghost" | "success" | "ai" | "danger";
type CardTone = "neutral" | "brand" | "ai" | "success" | "warning" | "danger" | "spotlight";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)]",
  success: "border-[color:color-mix(in_srgb,var(--cliente-success)_22%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]",
  warning: "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]",
  danger: "border-[color:color-mix(in_srgb,var(--cliente-danger)_22%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]",
  info: "border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]",
  ai: "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]",
};

const CARD_TONE: Record<CardTone, string> = {
  neutral: "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)]",
  brand:
    "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-primary)_10%,var(--cliente-card)),color-mix(in_srgb,var(--cliente-card)_92%,var(--cliente-panel-soft)_8%))] text-[var(--cliente-card-text)]",
  ai:
    "border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-ai)_10%,var(--cliente-card)),color-mix(in_srgb,var(--cliente-card)_92%,var(--cliente-panel-soft)_8%))] text-[var(--cliente-card-text)]",
  success:
    "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-success)_10%,var(--cliente-card)),color-mix(in_srgb,var(--cliente-card)_92%,var(--cliente-panel-soft)_8%))] text-[var(--cliente-card-text)]",
  warning:
    "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-warning)_10%,var(--cliente-card)),color-mix(in_srgb,var(--cliente-card)_92%,var(--cliente-panel-soft)_8%))] text-[var(--cliente-card-text)]",
  danger:
    "border-[color:color-mix(in_srgb,var(--cliente-danger)_20%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-danger)_10%,var(--cliente-card)),color-mix(in_srgb,var(--cliente-card)_92%,var(--cliente-panel-soft)_8%))] text-[var(--cliente-card-text)]",
  spotlight:
    "border-transparent bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_84%,white_16%),color-mix(in_srgb,var(--cliente-ai)_88%,white_12%))] text-white shadow-[0_28px_54px_-34px_color-mix(in_srgb,var(--cliente-primary)_55%,transparent)]",
};

export function PanelCard({
  children,
  className = "",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: CardTone;
}) {
  return (
    <section
      className={`client-glass client-panel-card rounded-[28px] border shadow-[var(--cliente-shadow-soft)] ring-1 ring-white/[0.03] ${CARD_TONE[tone]} ${className}`}
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
        <h2 className="client-section-title text-[1.5rem] font-extrabold text-[var(--cliente-card-text)] md:text-[1.75rem]">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
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
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: string;
  tone?: CardTone;
}) {
  return (
    <PanelCard tone={tone} className="client-metric-card space-y-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`client-metric-label text-[10px] font-bold uppercase tracking-[0.16em] ${tone === "spotlight" ? "text-white/78" : "text-[var(--cliente-card-text-soft)]"}`}>{label}</p>
          <p className={`client-metric-value mt-3 text-[2rem] font-extrabold leading-none md:text-[2.15rem] ${tone === "spotlight" ? "text-white" : "text-[var(--cliente-card-text)]"}`}>{value}</p>
          {trend ? <p className={`mt-3 text-xs ${tone === "spotlight" ? "text-white/72" : "text-[var(--cliente-card-text-soft)]"}`}>{trend}</p> : null}
        </div>
        {Icon ? (
          <span
            className={`client-metric-icon inline-flex rounded-[20px] border p-3 ${
              tone === "spotlight"
                ? "border-white/18 bg-white/14 text-white"
                : tone === "ai"
                  ? "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]"
                  : tone === "success"
                    ? "border-[color:color-mix(in_srgb,var(--cliente-success)_18%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]"
                    : tone === "warning"
                      ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
                      : tone === "danger"
                        ? "border-[color:color-mix(in_srgb,var(--cliente-danger)_18%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
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
      className={`client-state-badge inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] ${BADGE_TONE[tone]}`}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: CardTone;
}) {
  return (
    <PanelCard tone={tone} className="p-6 text-center">
      <p className={`text-sm font-semibold ${tone === "spotlight" ? "text-white" : "text-[var(--cliente-card-text)]"}`}>{title}</p>
      {description ? <p className={`mx-auto mt-1 max-w-xl text-sm ${tone === "spotlight" ? "text-white/74" : "text-[var(--cliente-card-text-soft)]"}`}>{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </PanelCard>
  );
}

export function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="client-card-title">
      <h3 className="client-card-title-text text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{title}</h3>
      {subtitle ? <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{subtitle}</p> : null}
    </div>
  );
}

const ACTION_BUTTON_TONE: Record<ActionButtonTone, string> = {
  primary: "border-transparent bg-[var(--cliente-primary)] text-white hover:bg-[var(--cliente-primary-hover)] hover:border-[var(--cliente-primary-hover)]",
  secondary: "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text)] hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)]",
  ghost: "border-transparent bg-transparent text-[var(--cliente-card-text-muted)] hover:border-[var(--cliente-border)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]",
  success: "border-transparent bg-[var(--cliente-success)] text-white hover:brightness-95",
  ai: "border-transparent bg-[var(--cliente-ai)] text-white hover:brightness-95",
  danger: "border-transparent bg-[var(--cliente-danger)] text-white hover:brightness-95",
};

export function ClientActionButton({
  children,
  tone = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ActionButtonTone;
}) {
  return (
    <button
      {...props}
      className={`client-action-button inline-flex items-center justify-center gap-2 rounded-[16px] border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_BUTTON_TONE[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function ClientTabs({
  items,
  value,
  onChange,
  className = "",
}: {
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`client-tabs inline-flex flex-wrap items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-1 ${className}`}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`rounded-[14px] px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-[var(--cliente-primary)] text-white shadow-[0_12px_24px_-16px_color-mix(in_srgb,var(--cliente-primary)_50%,transparent)]"
                : "text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-card-text)]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function ClientCard(props: { children: ReactNode; className?: string }) {
  return <PanelCard {...props} />;
}

export function ClientBadge(props: { label: string; tone?: BadgeTone }) {
  return <StateBadge {...props} />;
}

export function ClientEmptyState(props: { title: string; description?: string; action?: ReactNode }) {
  return <EmptyState {...props} />;
}

export function ClientSection(props: { title: string; subtitle?: string; action?: ReactNode }) {
  return <SectionHeader {...props} />;
}

export function ClientPageHeader(props: { title: string; subtitle?: string; action?: ReactNode }) {
  return <SectionHeader {...props} />;
}

function getAvatarInitials(value?: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function looksLikePhone(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return normalized.replace(/\D/g, "").length >= 8 && !/[a-zA-ZÀ-ÿ]/.test(normalized);
}

export function ClientContactAvatar({
  name,
  phone,
  photoUrl,
  size = "md",
  className = "",
}: {
  name?: string;
  phone?: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = String(photoUrl || "").trim();
  const canRenderImage = src && !imageFailed;
  const displayName = String(name || "").trim();
  const fallbackInitials = looksLikePhone(displayName || phone) ? "" : getAvatarInitials(displayName || phone);
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 text-xs"
      : size === "lg"
        ? "h-16 w-16 text-sm"
        : "h-12 w-12 text-xs";

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (canRenderImage) {
    return (
      <div className={`overflow-hidden rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] shadow-[0_16px_28px_-22px_rgba(15,23,42,0.18)] ${sizeClass} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name || phone || "Contato"}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),color-mix(in_srgb,var(--cliente-ai)_12%,var(--cliente-panel-soft)))] font-black text-[var(--cliente-primary)] shadow-[0_16px_28px_-22px_var(--cliente-primary-glow)] ${sizeClass} ${className}`}
    >
      {fallbackInitials || <UserRound className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />}
    </div>
  );
}

