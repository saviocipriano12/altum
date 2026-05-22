"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  CalendarDays,
  Columns3,
  FileText,
  List,
  Sparkles,
} from "lucide-react";

export type CrmTone = "neutral" | "blue" | "green" | "purple" | "orange" | "red";

const toneClasses: Record<CrmTone, string> = {
  neutral: "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)]",
  blue: "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]",
  green: "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]",
  purple: "border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]",
  orange: "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]",
  red: "border-[color:color-mix(in_srgb,var(--cliente-danger)_22%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]",
};

export const CRM_ROUTES = [
  { label: "Lista", href: "/cliente/painel/crm", icon: List },
  { label: "Funil", href: "/cliente/painel/pipeline", icon: Columns3 },
  { label: "Propostas", href: "/cliente/painel/comercial", icon: FileText },
  { label: "Atividades", href: "/cliente/painel/follow-ups", icon: Sparkles },
  { label: "Agenda", href: "/cliente/painel/agenda", icon: CalendarDays },
] as const;

export type CrmRouteLabel = (typeof CRM_ROUTES)[number]["label"];

export function CrmWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="crm-workspace space-y-5 pb-10 text-[var(--cliente-card-text)]">
      {children}
    </div>
  );
}

export function CrmHero({
  active,
  title,
  description,
  children,
  action,
  assistantTitle = "Assistente Altum",
  assistantSubtitle = "Sinais e proximas acoes",
  assistantText = "A IA aparece como apoio de operacao: prioriza contatos, sugere retornos e ajuda o time a vender sem mostrar configuracao tecnica.",
  assistantBadge = "ao vivo",
}: {
  active: CrmRouteLabel;
  title: string;
  description: string;
  children?: ReactNode;
  action?: ReactNode;
  assistantTitle?: string;
  assistantSubtitle?: string;
  assistantText?: string;
  assistantBadge?: string;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[var(--cliente-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-card)_97%,white_3%),color-mix(in_srgb,var(--cliente-primary)_6%,var(--cliente-card))_54%,color-mix(in_srgb,var(--cliente-ai)_6%,var(--cliente-card)))] shadow-[var(--cliente-shadow-soft)]">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-6">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <CrmBadge tone="blue">Operacao comercial com IA</CrmBadge>
            <CrmBadge>CRM Altum</CrmBadge>
          </div>
          <h1 className="max-w-5xl text-[2rem] font-black leading-[1.04] tracking-normal text-[var(--cliente-card-text)] md:text-[2.45rem]">
            {title}
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[var(--cliente-card-text-soft)]">
            {description}
          </p>
          {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
        </div>

        <aside className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[linear-gradient(180deg,var(--cliente-ai-soft),color-mix(in_srgb,var(--cliente-card)_74%,var(--cliente-ai-soft)))] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-[var(--cliente-ai)] text-white">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-[var(--cliente-card-text)]">{assistantTitle}</p>
                <p className="text-xs text-[var(--cliente-card-text-soft)]">{assistantSubtitle}</p>
              </div>
            </div>
            <CrmBadge tone="purple">{assistantBadge}</CrmBadge>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--cliente-card-text)]">
            {assistantText}
          </p>
        </aside>
      </div>

      <div className="border-t border-[var(--cliente-border)] bg-[color:color-mix(in_srgb,var(--cliente-panel-soft)_74%,transparent)] px-3 py-3">
        <CrmTabs active={active} />
      </div>
      {children ? <div className="border-t border-[var(--cliente-border)] p-4 lg:p-5">{children}</div> : null}
    </section>
  );
}

export function CrmTabs({ active }: { active: CrmRouteLabel }) {
  const searchParams = useSearchParams();
  const preservedQuery = useMemo(() => {
    const next = new URLSearchParams();
    const leadId = searchParams.get("leadId");
    if (leadId) next.set("leadId", leadId);
    return next.toString();
  }, [searchParams]);

  return (
    <nav className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {CRM_ROUTES.map((item) => {
        const href = preservedQuery ? `${item.href}?${preservedQuery}` : item.href;
        const Icon = item.icon;
        const isActive = active === item.label;

        return (
          <Link
            key={item.href}
            href={href}
            className={`inline-flex items-center justify-center gap-2 rounded-[16px] px-3 py-3 text-sm font-bold transition ${
              isActive
                ? "bg-[var(--cliente-primary)] text-white shadow-[0_16px_28px_-24px_var(--cliente-accent-glow)]"
                : "text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-card)] hover:text-[var(--cliente-card-text)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function CrmPanel({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)] ${padded ? "p-5" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function CrmSectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-black uppercase text-[var(--cliente-primary)]">{eyebrow}</p> : null}
        <h2 className="mt-1 text-xl font-black tracking-normal text-[var(--cliente-card-text)] md:text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-soft)]">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function CrmMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
  tone?: CrmTone;
}) {
  return (
    <CrmPanel className="min-h-[116px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-3 truncate text-2xl font-black text-[var(--cliente-card-text)]">{value}</p>
          {detail ? <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{detail}</p> : null}
        </div>
        {Icon ? (
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border ${toneClasses[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </CrmPanel>
  );
}

export function CrmBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: CrmTone }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneClasses[tone]}`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

export function CrmButton({
  children,
  tone = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "green" | "purple" | "danger";
}) {
  const classes = {
    primary: "border-transparent bg-[var(--cliente-primary)] text-white hover:bg-[var(--cliente-primary-hover)]",
    secondary: "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]",
    green: "border-transparent bg-[var(--cliente-success)] text-white hover:brightness-95",
    purple: "border-transparent bg-[var(--cliente-ai)] text-white hover:brightness-95",
    danger: "border-transparent bg-[var(--cliente-danger)] text-white hover:brightness-95",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${classes[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function CrmLinkButton({
  href,
  children,
  tone = "secondary",
  className = "",
  target,
}: {
  href: string;
  children: ReactNode;
  tone?: "primary" | "secondary" | "green" | "purple" | "danger";
  className?: string;
  target?: string;
}) {
  const classes = {
    primary: "border-transparent bg-[var(--cliente-primary)] text-white hover:bg-[var(--cliente-primary-hover)]",
    secondary: "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]",
    green: "border-transparent bg-[var(--cliente-success)] text-white hover:brightness-95",
    purple: "border-transparent bg-[var(--cliente-ai)] text-white hover:brightness-95",
    danger: "border-transparent bg-[var(--cliente-danger)] text-white hover:brightness-95",
  };

  return (
    <Link
      href={href}
      target={target}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-bold transition ${classes[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function CrmNotice({ children, tone = "blue" }: { children: ReactNode; tone?: CrmTone }) {
  const noticeTone: Record<CrmTone, string> = {
    neutral: "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text)]",
    blue: "border-[color:color-mix(in_srgb,var(--cliente-primary)_24%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]",
    green: "border-[color:color-mix(in_srgb,var(--cliente-success)_24%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]",
    purple: "border-[color:color-mix(in_srgb,var(--cliente-ai)_24%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]",
    orange: "border-[color:color-mix(in_srgb,var(--cliente-warning)_24%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]",
    red: "border-[color:color-mix(in_srgb,var(--cliente-danger)_24%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]",
  };

  return (
    <div className={`rounded-[18px] border px-4 py-3 text-sm font-bold ${noticeTone[tone]}`}>
      {children}
    </div>
  );
}

export function CrmAvatar({ name, subtitle, size = "md" }: { name?: string | null; subtitle?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-9 w-9 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-14 w-14 text-base",
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--cliente-primary-soft)] font-black text-[var(--cliente-primary)] ${sizes[size]}`}>
        {initials(name || subtitle || "Altum")}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{name || "Contato sem nome"}</p>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function CrmEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-6 text-center">
      <p className="text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[var(--cliente-card-text-soft)]">{description}</p> : null}
    </div>
  );
}

export function CrmInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 text-sm text-[var(--cliente-card-text)] outline-none transition placeholder:text-[var(--cliente-card-text-muted)] focus:border-[var(--cliente-primary)] ${props.className || ""}`}
    />
  );
}

export function CrmSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 text-sm font-semibold text-[var(--cliente-card-text)] outline-none transition focus:border-[var(--cliente-primary)] ${props.className || ""}`}
    />
  );
}

export function CrmTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm text-[var(--cliente-card-text)] outline-none transition placeholder:text-[var(--cliente-card-text-muted)] focus:border-[var(--cliente-primary)] ${props.className || ""}`}
    />
  );
}

export function toCrmDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "object" && value && "_seconds" in value && typeof (value as { _seconds?: number })._seconds === "number") {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

export function formatCrmDate(value: unknown, fallback = "Sem data") {
  const date = toCrmDate(value);
  if (!date) return fallback;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatCrmMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function initials(value?: string | null) {
  const text = String(value || "A").trim();
  const parts = text.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "A";
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return `${first || "A"}${second || ""}`.toUpperCase();
}
