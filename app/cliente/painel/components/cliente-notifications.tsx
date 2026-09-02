"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "danger" | "warning" | "info" | "success";
  occurredAt: string;
  read: boolean;
};

type NotificationsPayload = {
  items?: NotificationItem[];
  unread?: number;
  error?: string;
};

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "agora";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(time).toLocaleDateString("pt-BR");
}

const toneClass = {
  danger: "bg-[var(--cliente-danger)]",
  warning: "bg-[var(--cliente-warning)]",
  info: "bg-[var(--cliente-primary)]",
  success: "bg-[var(--cliente-success)]",
};

export function ClienteNotifications() {
  const { tenant } = useClienteTenant();
  const tenantId = tenant?.tenantId || "";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async (silent = true) => {
    if (!tenantId) return;
    if (!silent) setLoading(true);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/notifications`);
      const payload = await response.json().catch(() => ({})) as NotificationsPayload;
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar avisos.");
      setItems(payload.items || []);
      setUnread(Number(payload.unread || 0));
      setError("");
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar avisos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenantId]);

  const markRead = useCallback(async (notificationIds: string[]) => {
    if (!tenantId || !notificationIds.length) return;
    setItems((current) => current.map((item) => notificationIds.includes(item.id) ? { ...item, read: true } : item));
    setUnread((current) => Math.max(0, current - notificationIds.length));
    await authedFetch(`/api/tenant/${tenantId}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds }),
    }).catch(() => undefined);
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    void loadNotifications(false);
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [loadNotifications, open]);

  useAdaptivePolling({
    enabled: Boolean(tenantId),
    onTick: () => loadNotifications(true),
    fastIntervalMs: 120_000,
    slowIntervalMs: 600_000,
    runOnMount: true,
    source: "cliente-notifications",
  });

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unread ? `Notificacoes: ${unread} nao lidas` : "Notificacoes"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-text-muted)] transition hover:border-[var(--cliente-primary)]/25 hover:bg-[var(--cliente-surface-hover)] hover:text-[var(--cliente-text)]"
      >
        <Bell className="h-4 w-4" />
        {unread ? <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--cliente-danger)] px-1 text-[10px] font-black text-white">{Math.min(unread, 9)}{unread > 9 ? "+" : ""}</span> : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Central de notificacoes" className="client-popover absolute right-0 top-12 z-[70] w-[min(92vw,390px)] overflow-hidden rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[0_24px_70px_-24px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--cliente-border)] px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-[var(--cliente-text)]">O que precisa de atenção</p>
              <p className="mt-0.5 text-xs text-[var(--cliente-text-soft)]">{unread ? `${unread} aviso(s) novo(s)` : "Tudo acompanhado"}</p>
            </div>
            {unread ? (
              <button type="button" onClick={() => void markRead(items.filter((item) => !item.read).map((item) => item.id))} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--cliente-primary)] transition hover:bg-[var(--cliente-surface-hover)]">
                <CheckCheck className="h-3.5 w-3.5" /> Marcar como lidas
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
            {loading ? <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[var(--cliente-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Atualizando avisos...</div> : null}
            {!loading && error ? <div className="m-2 rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-danger)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--cliente-danger)_8%,var(--cliente-card))] px-3 py-3 text-sm text-[var(--cliente-danger)]">{error}</div> : null}
            {!loading && !error && !items.length ? <div className="px-5 py-10 text-center"><p className="text-sm font-semibold text-[var(--cliente-text)]">Nenhuma pendencia agora</p><p className="mt-1 text-xs text-[var(--cliente-text-soft)]">Novas conversas, oportunidades e canais aparecerão aqui.</p></div> : null}
            {!loading && !error ? items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => {
                  if (!item.read) void markRead([item.id]);
                  setOpen(false);
                }}
                className={`flex gap-3 rounded-[16px] px-3 py-3 transition hover:bg-[var(--cliente-surface-hover)] ${item.read ? "opacity-65" : "bg-[color:color-mix(in_srgb,var(--cliente-primary)_4%,transparent)]"}`}
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass[item.tone]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--cliente-text)]">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--cliente-text-muted)]">{item.description}</span>
                  <span className="mt-1.5 block text-[11px] font-medium text-[var(--cliente-text-soft)]">{relativeTime(item.occurredAt)}</span>
                </span>
              </Link>
            )) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
