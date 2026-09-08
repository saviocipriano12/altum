"use client";

export const CLIENTE_REALTIME_POLL_EVENT = "altum:cliente-realtime-poll";
export const CLIENTE_REALTIME_REFRESH_EVENT = "altum:cliente-realtime-refresh";

export type ClienteRealtimePollEventDetail = {
  phase: "start" | "success" | "error" | "skipped";
  at: number;
  source: string;
  reason?: "offline" | "hidden" | "in_flight";
  error?: string;
};

export type ClienteRealtimeRefreshEventDetail = {
  at: number;
  target?: string | "all";
};

export function emitClienteRealtimePollEvent(detail: ClienteRealtimePollEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLIENTE_REALTIME_POLL_EVENT, { detail }));
}

export function emitClienteRealtimeRefreshEvent(detail?: Partial<ClienteRealtimeRefreshEventDetail>) {
  if (typeof window === "undefined") return;
  const payload: ClienteRealtimeRefreshEventDetail = {
    at: Date.now(),
    target: detail?.target || "all",
  };
  window.dispatchEvent(new CustomEvent(CLIENTE_REALTIME_REFRESH_EVENT, { detail: payload }));
}
