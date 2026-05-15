"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

type CustomerProfileDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function CustomerProfileDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: CustomerProfileDrawerProps) {
  return (
    <div
      className={`fixed inset-0 z-[70] 2xl:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/48 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Fechar detalhes do cliente"
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col border-l border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-hard)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cliente-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-panel-soft)_95%,white_5%),color-mix(in_srgb,var(--cliente-card)_100%,transparent))] px-5 py-4">
          <div className="min-w-0">
            <p className="text-base font-semibold text-[var(--cliente-card-text)]">{title}</p>
            {subtitle ? <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-card-text)]"
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="client-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {children}
        </div>
      </aside>
    </div>
  );
}
