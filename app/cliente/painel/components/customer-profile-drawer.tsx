"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
import { CrmAvatar, CrmBadge } from "@/app/cliente/painel/components/crm-workspace";

type CustomerProfileDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  status?: string;
  children: ReactNode;
};

export function CustomerProfileDrawer({
  open,
  onClose,
  title,
  subtitle,
  status,
  children,
}: CustomerProfileDrawerProps) {
  return (
    <div className={`fixed inset-0 z-[70] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/44 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Fechar ficha"
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[34rem] flex-col border-l border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-hard)] transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="border-b border-[var(--cliente-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-card)_94%,white_6%),color-mix(in_srgb,var(--cliente-primary)_8%,var(--cliente-card)))] px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <CrmAvatar name={title} subtitle={subtitle} size="lg" />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] transition hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]"
              aria-label="Fechar painel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {status ? (
            <div className="mt-4">
              <CrmBadge tone="blue">{status}</CrmBadge>
            </div>
          ) : null}
        </header>

        <div className="client-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </aside>
    </div>
  );
}
