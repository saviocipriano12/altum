"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { CrmAvatar, CrmBadge } from "@/app/cliente/painel/components/crm-workspace";

type CustomerProfileDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  photoUrl?: string | null;
  status?: string;
  meta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function CustomerProfileDrawer({
  open,
  onClose,
  title,
  subtitle,
  photoUrl,
  status,
  meta,
  footer,
  children,
}: CustomerProfileDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusDrawer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusDrawer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <div className={`client-drawer-root fixed inset-0 z-[70] ${open ? "is-open" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        onClick={onClose}
        className={`client-drawer-backdrop absolute inset-0 bg-slate-950/44 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Fechar ficha"
      />

      <aside
        ref={drawerRef}
        className={`client-customer-drawer absolute right-0 flex w-full max-w-[34rem] flex-col border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-hard)] transition-transform duration-300 max-sm:inset-0 max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:inset-y-0 sm:border-l ${open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="border-b border-[var(--cliente-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-card)_94%,white_6%),color-mix(in_srgb,var(--cliente-primary)_8%,var(--cliente-card)))] px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <CrmAvatar name={title} subtitle={subtitle} photoUrl={photoUrl} size="lg" />
            <button
              ref={closeButtonRef}
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

        <div className={`client-scrollbar min-h-0 flex-1 overflow-y-auto p-4 ${footer ? "pb-24" : ""}`}>
          {meta ? <div className="mb-4">{meta}</div> : null}
          {children}
        </div>
        {footer ? (
          <div className="border-t border-[var(--cliente-border)] bg-[color:color-mix(in_srgb,var(--cliente-card)_92%,white)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
