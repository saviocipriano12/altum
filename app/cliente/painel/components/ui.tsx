"use client";

import { ReactNode, useEffect, useState } from "react";
import { LucideIcon, UserRound } from "lucide-react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "ai";
type ActionButtonTone = "primary" | "secondary" | "ghost" | "success" | "ai" | "danger";
type CardTone = "neutral" | "brand" | "ai" | "success" | "warning" | "danger" | "spotlight";
export type BrandIconId =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "meta"
  | "google"
  | "shopify"
  | "nuvemshop"
  | "woocommerce"
  | "vtex"
  | "tray"
  | "loja_integrada"
  | "altum"
  | "generic";

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
    "border-[color:color-mix(in_srgb,var(--cliente-primary)_22%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-primary)_14%,var(--cliente-card)),var(--cliente-card))] text-[var(--cliente-card-text)]",
  ai:
    "border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-ai)_14%,var(--cliente-card)),var(--cliente-card))] text-[var(--cliente-card-text)]",
  success:
    "border-[color:color-mix(in_srgb,var(--cliente-success)_22%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-success)_14%,var(--cliente-card)),var(--cliente-card))] text-[var(--cliente-card-text)]",
  warning:
    "border-[color:color-mix(in_srgb,var(--cliente-warning)_22%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-warning)_14%,var(--cliente-card)),var(--cliente-card))] text-[var(--cliente-card-text)]",
  danger:
    "border-[color:color-mix(in_srgb,var(--cliente-danger)_22%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-danger)_14%,var(--cliente-card)),var(--cliente-card))] text-[var(--cliente-card-text)]",
  spotlight:
    "border-transparent bg-[linear-gradient(135deg,#16243b_0%,#203b63_62%,#315b8f_100%)] text-white shadow-[0_28px_54px_-34px_rgba(15,23,42,0.56)]",
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
      className={`client-glass client-panel-card rounded-[24px] border shadow-[var(--cliente-shadow-soft)] ${CARD_TONE[tone]} ${className}`}
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
        <h2 className="client-section-title text-[1.35rem] font-extrabold text-[var(--cliente-card-text)] md:text-[1.62rem]">{title}</h2>
        {subtitle ? <p className="client-context-copy mt-1.5 max-w-2xl text-sm leading-5 text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
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
          <p className={`client-metric-label text-[11px] font-bold ${tone === "spotlight" ? "text-white/80" : "text-[var(--cliente-card-text-soft)]"}`}>{label}</p>
          <p className={`client-metric-value mt-2 text-[1.85rem] font-extrabold leading-none md:text-[2rem] ${tone === "spotlight" ? "text-white" : "text-[var(--cliente-card-text)]"}`}>{value}</p>
          {trend ? <p className={`mt-2 text-xs ${tone === "spotlight" ? "text-white/74" : "text-[var(--cliente-card-text-soft)]"}`}>{trend}</p> : null}
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
      className={`client-state-badge inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-normal ${BADGE_TONE[tone]}`}
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
      <h3 className="client-card-title-text text-[11px] font-bold text-[var(--cliente-card-text-soft)]">{title}</h3>
      {subtitle ? <p className="client-context-copy mt-1.5 max-w-2xl text-sm leading-5 text-[var(--cliente-card-text-muted)]">{subtitle}</p> : null}
    </div>
  );
}

const ACTION_BUTTON_TONE: Record<ActionButtonTone, string> = {
  primary: "border-transparent bg-[var(--cliente-primary)] text-white hover:bg-[var(--cliente-primary-hover)] hover:border-[var(--cliente-primary-hover)]",
  secondary: "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)] hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)]",
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

const BRAND_ICON_META: Record<
  BrandIconId,
  {
    label: string;
    short: string;
    className: string;
    mark?: "whatsapp" | "instagram" | "messenger" | "meta" | "google" | "shopify" | "commerce";
  }
> = {
  whatsapp: {
    label: "WhatsApp",
    short: "W",
    mark: "whatsapp",
    className: "bg-[#25D366] text-white border-[#25D366]/30",
  },
  instagram: {
    label: "Instagram",
    short: "IG",
    mark: "instagram",
    className: "bg-[linear-gradient(135deg,#feda75_0%,#fa7e1e_26%,#d62976_52%,#962fbf_76%,#4f5bd5_100%)] text-white border-white/20",
  },
  messenger: {
    label: "Messenger",
    short: "M",
    mark: "messenger",
    className: "bg-[linear-gradient(135deg,#00B2FF,#006AFF,#A033FF,#FF5280)] text-white border-white/20",
  },
  meta: {
    label: "Meta",
    short: "∞",
    mark: "meta",
    className: "bg-[#0866FF] text-white border-[#0866FF]/30",
  },
  google: {
    label: "Google",
    short: "G",
    mark: "google",
    className: "bg-white text-slate-900 border-slate-200",
  },
  shopify: {
    label: "Shopify",
    short: "S",
    mark: "shopify",
    className: "bg-[#95BF47] text-white border-[#95BF47]/30",
  },
  nuvemshop: {
    label: "Nuvemshop",
    short: "N",
    className: "bg-[#2D6CDF] text-white border-[#2D6CDF]/30",
  },
  woocommerce: {
    label: "WooCommerce",
    short: "Woo",
    className: "bg-[#7F54B3] text-white border-[#7F54B3]/30",
  },
  vtex: {
    label: "VTEX",
    short: "VT",
    className: "bg-[#ED125F] text-white border-[#ED125F]/30",
  },
  tray: {
    label: "Tray",
    short: "T",
    className: "bg-[#0EA5E9] text-white border-[#0EA5E9]/30",
  },
  loja_integrada: {
    label: "Loja Integrada",
    short: "LI",
    className: "bg-[#0F9D58] text-white border-[#0F9D58]/30",
  },
  altum: {
    label: "Altum",
    short: "A",
    className: "bg-[linear-gradient(135deg,var(--cliente-primary),var(--cliente-ai))] text-white border-white/20",
  },
  generic: {
    label: "Integracao",
    short: "I",
    className: "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)] border-[var(--cliente-border)]",
  },
};

export function BrandIcon({
  id = "generic",
  size = "md",
  className = "",
}: {
  id?: BrandIconId | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const brand = BRAND_ICON_META[(id as BrandIconId) || "generic"] || BRAND_ICON_META.generic;
  const sizeClass = size === "sm" ? "h-9 w-9 text-[11px]" : size === "lg" ? "h-14 w-14 text-base" : "h-11 w-11 text-sm";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[16px] border font-black shadow-[0_16px_28px_-20px_rgba(15,23,42,0.45)] ${sizeClass} ${brand.className} ${className}`}
      title={brand.label}
      aria-label={brand.label}
    >
      {brand.mark === "whatsapp" ? (
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" aria-hidden="true">
          <path fill="currentColor" d="M12.05 3.5a8.35 8.35 0 0 0-7.1 12.75l-.95 3.45 3.55-.92a8.32 8.32 0 0 0 4.5 1.3h.01a8.3 8.3 0 0 0-.01-16.58Zm4.88 11.72c-.2.56-1.15 1.06-1.61 1.13-.41.06-.93.09-1.5-.09-.34-.11-.78-.25-1.35-.49-2.37-1.02-3.92-3.4-4.04-3.56-.12-.16-.97-1.29-.97-2.46 0-1.17.61-1.74.83-1.98.22-.24.48-.3.64-.3h.46c.15 0 .35-.06.55.42.2.49.69 1.68.75 1.8.06.12.1.27.02.43-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.25-.1.49.14.24.61 1.01 1.31 1.64.9.8 1.66 1.05 1.9 1.17.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.55-.12.22.08 1.43.67 1.67.79.24.12.4.18.46.28.06.1.06.6-.14 1.16Z" />
        </svg>
      ) : brand.mark === "instagram" ? (
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" aria-hidden="true">
          <path fill="currentColor" d="M8 3.8h8A4.2 4.2 0 0 1 20.2 8v8a4.2 4.2 0 0 1-4.2 4.2H8A4.2 4.2 0 0 1 3.8 16V8A4.2 4.2 0 0 1 8 3.8Zm0 1.8A2.4 2.4 0 0 0 5.6 8v8A2.4 2.4 0 0 0 8 18.4h8a2.4 2.4 0 0 0 2.4-2.4V8A2.4 2.4 0 0 0 16 5.6H8Zm4 3.05A3.35 3.35 0 1 1 12 15.35 3.35 3.35 0 0 1 12 8.65Zm0 1.8A1.55 1.55 0 1 0 12 13.55 1.55 1.55 0 0 0 12 10.45Zm4.05-2.75a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z" />
        </svg>
      ) : brand.mark === "messenger" ? (
        <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" aria-hidden="true">
          <path fill="currentColor" d="M12 3.2c-5.1 0-9 3.72-9 8.65 0 2.58 1.07 4.82 2.82 6.37v3.18l3.1-1.7c.98.27 2.02.42 3.08.42 5.1 0 9-3.72 9-8.66S17.1 3.2 12 3.2Zm.9 11.65-2.3-2.45-4.48 2.45 4.93-5.24 2.36 2.45 4.42-2.45-4.93 5.24Z" />
        </svg>
      ) : brand.mark === "meta" ? (
        <svg viewBox="0 0 28 18" className="h-[58%] w-[70%]" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M2.2 14.8C4.6 7.5 7 3.2 10.1 3.2c4 0 6.7 11.6 10.5 11.6 2.5 0 4.2-2.7 5.2-5.7-1.8-4-3.7-5.9-5.8-5.9-3.8 0-6.2 11.6-10.5 11.6-2.7 0-4.7-3.1-6-6" />
        </svg>
      ) : brand.mark === "google" ? (
        <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" aria-hidden="true">
          <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
          <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z" />
          <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
        </svg>
      ) : brand.mark === "shopify" ? (
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" aria-hidden="true">
          <path fill="currentColor" d="M7.8 7.3c.3-2.2 1.8-4.1 3.7-4.1 1.2 0 2.1.8 2.4 2.2l1.7.5c.1 0 .2.1.2.3l1.5 13.1c0 .3-.2.5-.4.5H6.1c-.3 0-.5-.2-.4-.5L7.2 7.7c0-.2.2-.3.3-.3l.3-.1Zm1.5-.4 3.1-.9c-.2-.8-.6-1.2-1-1.2-.8 0-1.7.9-2.1 2.1Zm4.4-1.2c-.3-1.1-1-1.8-2.1-1.8-1.6 0-2.8 1.5-3.1 3.2l.7-.2c.5-2.1 1.6-2.9 2.5-2.9.8 0 1.4.6 1.7 1.8l.3-.1Zm-1.3 5.1c-.5-.3-.9-.4-1.4-.4-.7 0-1.1.4-1.1.8 0 1.3 3.5 1.1 3.5 3.7 0 1.5-1.2 2.7-3.1 2.7-1 0-1.9-.3-2.5-.8l.5-1.5c.6.4 1.2.6 1.9.6.7 0 1.1-.3 1.1-.8 0-1.4-3.4-1.2-3.4-3.6 0-1.5 1.2-2.8 3.2-2.8.8 0 1.5.2 2.1.5l-.3 1.6Z" />
        </svg>
      ) : (
        <span>{brand.short}</span>
      )}
    </span>
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

