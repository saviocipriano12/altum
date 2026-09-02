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
  Video,
} from "lucide-react";
import { ClientContactAvatar } from "@/app/cliente/painel/components/ui";

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
  { label: "Agenda", href: "/cliente/painel/agenda", icon: CalendarDays },
  { label: "Reunioes IA", href: "/cliente/painel/reunioes-assistidas", icon: Video, hidden: true },
  { label: "Retornos", href: "/cliente/painel/follow-ups", icon: Sparkles, hidden: true },
] as const;

export type CrmRouteLabel = (typeof CRM_ROUTES)[number]["label"];

export function CrmWorkspace({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`crm-workspace crm-refined client-daily-page space-y-5 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pb-10 text-[var(--cliente-card-text)] ${className}`}>
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
  assistantTitle = "Altum na venda",
  assistantSubtitle = "Sinais e proximas acoes",
  assistantText = "A IA aparece como apoio pratico: prioriza contatos, sugere retornos e ajuda o time a vender sem abrir configuracao tecnica.",
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
    <section className="overflow-hidden rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)]">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CrmBadge tone="neutral">{active}</CrmBadge>
            <CrmBadge tone="blue">Operacao comercial</CrmBadge>
          </div>
          <h1 className="max-w-4xl text-[1.55rem] font-extrabold leading-tight tracking-normal text-[var(--cliente-card-text)] sm:text-[1.85rem]">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--cliente-card-text-soft)]">
            {description}
          </p>
        </div>
        {action ? <div className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">{action}</div> : null}
      </div>

      <div className="border-t border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-5 py-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[var(--cliente-card-text)]">{assistantTitle}</p>
                <span className="text-xs text-[var(--cliente-card-text-soft)]">{assistantSubtitle}</span>
              </div>
              <p className="mt-1 hidden text-xs leading-5 text-[var(--cliente-card-text-soft)] sm:block">{assistantText}</p>
            </div>
          </div>
          <CrmBadge tone="purple">{assistantBadge}</CrmBadge>
        </div>
      </div>

      <div className="border-t border-[var(--cliente-border)] px-3 py-3">
        <CrmTabs active={active} />
      </div>
      {children ? <div className="border-t border-[var(--cliente-border)] p-3 lg:p-4">{children}</div> : null}
    </section>
  );
}

export function CrmTabs({ active }: { active: CrmRouteLabel }) {
  const searchParams = useSearchParams();
  const visibleRoutes = useMemo(() => CRM_ROUTES.filter((item) => !("hidden" in item && item.hidden)), []);
  const preservedQuery = useMemo(() => {
    const next = new URLSearchParams();
    const leadId = searchParams.get("leadId");
    if (leadId) next.set("leadId", leadId);
    return next.toString();
  }, [searchParams]);

  return (
    <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
      {visibleRoutes.map((item) => {
        const href = preservedQuery ? `${item.href}?${preservedQuery}` : item.href;
        const Icon = item.icon;
        const isActive = active === item.label;

        return (
          <Link
            key={item.href}
            href={href}
            className={`inline-flex min-w-max items-center justify-center gap-2 rounded-[12px] border px-3 py-2.5 text-sm font-bold transition ${
              isActive
                ? "border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"
                : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]"
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
    <section className={`rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)] ${padded ? "p-4" : ""} ${className}`}>
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
        {eyebrow ? <p className="text-[11px] font-bold text-[var(--cliente-primary)]">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-extrabold tracking-normal text-[var(--cliente-card-text)] md:text-xl">{title}</h2>
        {description ? <p className="client-context-copy mt-1 max-w-2xl text-sm leading-5 text-[var(--cliente-card-text-soft)]">{description}</p> : null}
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
    <CrmPanel className="min-h-[96px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-2 truncate text-xl font-extrabold text-[var(--cliente-card-text)]">{value}</p>
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

export function CrmAvatar({
  name,
  subtitle,
  photoUrl,
  size = "md",
}: {
  name?: string | null;
  subtitle?: string | null;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ClientContactAvatar name={name || undefined} phone={subtitle || undefined} photoUrl={photoUrl} size={size} />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{name || "Contato sem nome"}</p>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function CrmEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-6 text-center">
      <p className="text-sm font-bold text-[var(--cliente-card-text)]">{title}</p>
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
