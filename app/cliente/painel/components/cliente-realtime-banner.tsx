"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import {
  CLIENTE_REALTIME_POLL_EVENT,
  emitClienteRealtimeRefreshEvent,
  type ClienteRealtimePollEventDetail,
} from "@/app/cliente/painel/hooks/realtime-poll-events";

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

type RealtimeSnapshot = {
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  inFlight: boolean;
  lastSource: string | null;
};

const STORAGE_KEY = "altum:cliente:realtime-status";
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const STALE_WARNING_MS = 90 * 1000;
const STALE_CRITICAL_MS = 3 * 60 * 1000;

function getNetworkInfo(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

function readStoredSnapshot(): RealtimeSnapshot {
  if (typeof window === "undefined") {
    return {
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      inFlight: false,
      lastSource: null,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<RealtimeSnapshot> & { updatedAt?: number };
    const updatedAt = Number(parsed.updatedAt || 0);
    if (!updatedAt || Date.now() - updatedAt > SNAPSHOT_MAX_AGE_MS) throw new Error("expired");

    return {
      lastSuccessAt: typeof parsed.lastSuccessAt === "number" ? parsed.lastSuccessAt : null,
      lastErrorAt: typeof parsed.lastErrorAt === "number" ? parsed.lastErrorAt : null,
      lastErrorMessage: typeof parsed.lastErrorMessage === "string" ? parsed.lastErrorMessage : null,
      inFlight: false,
      lastSource: typeof parsed.lastSource === "string" ? parsed.lastSource : null,
    };
  } catch {
    return {
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      inFlight: false,
      lastSource: null,
    };
  }
}

function formatSince(timestamp: number | null, nowMs: number) {
  if (!timestamp) return "agora";
  const diffSec = Math.max(0, Math.round((nowMs - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}min`;
  return `${Math.round(diffSec / 3600)}h`;
}

export function ClienteRealtimeBanner() {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot>(() => readStoredSnapshot());
  const [online, setOnline] = useState(true);
  const [slowMode, setSlowMode] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      ...snapshot,
      inFlight: false,
      updatedAt: Date.now(),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignora falhas de storage (modo privado / quota).
    }
  }, [snapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateNetwork = () => {
      const info = getNetworkInfo();
      const effectiveType = String(info?.effectiveType || "").toLowerCase();
      const isSlow = Boolean(info?.saveData || effectiveType.includes("2g") || effectiveType === "slow-2g");
      setOnline(navigator.onLine !== false);
      setSlowMode(isSlow);
    };

    const info = getNetworkInfo();
    updateNetwork();

    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    info?.addEventListener?.("change", updateNetwork);

    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      info?.removeEventListener?.("change", updateNetwork);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPollEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ClienteRealtimePollEventDetail>;
      const detail = customEvent.detail;
      if (!detail) return;

      setSnapshot((current) => {
        if (detail.phase === "start") {
          return {
            ...current,
            inFlight: true,
            lastSource: detail.source || current.lastSource,
          };
        }

        if (detail.phase === "success") {
          return {
            ...current,
            inFlight: false,
            lastSuccessAt: detail.at,
            lastSource: detail.source || current.lastSource,
          };
        }

        if (detail.phase === "error") {
          return {
            ...current,
            inFlight: false,
            lastErrorAt: detail.at,
            lastErrorMessage: detail.error || "Falha ao sincronizar em segundo plano.",
            lastSource: detail.source || current.lastSource,
          };
        }

        return {
          ...current,
          inFlight: false,
          lastSource: detail.source || current.lastSource,
        };
      });
    };

    window.addEventListener(CLIENTE_REALTIME_POLL_EVENT, onPollEvent as EventListener);
    return () => {
      window.removeEventListener(CLIENTE_REALTIME_POLL_EVENT, onPollEvent as EventListener);
    };
  }, []);

  const state = useMemo(() => {
    if (!online) {
      return {
        tone: "danger",
        staleLevel: "critical",
        title: "Sem conexao",
        description: "Mostrando o ultimo estado carregado ate a rede voltar.",
      } as const;
    }

    if (snapshot.inFlight) {
      return {
        tone: "info",
        staleLevel: "none",
        title: "Sincronizando em tempo real",
        description: "Atualizando operacao agora.",
      } as const;
    }

    const newestEventAt = Math.max(snapshot.lastSuccessAt || 0, snapshot.lastErrorAt || 0);
    const hasRecentError =
      Boolean(snapshot.lastErrorAt) &&
      (snapshot.lastSuccessAt || 0) <= (snapshot.lastErrorAt || 0) &&
      nowMs - newestEventAt < 5 * 60 * 1000;

    if (hasRecentError) {
      return {
        tone: "warning",
        staleLevel: "warning",
        title: "Instabilidade na sincronizacao",
        description: snapshot.lastErrorMessage || "Falha temporaria. Nova tentativa automatica em andamento.",
      } as const;
    }

    const ageMs = snapshot.lastSuccessAt ? nowMs - snapshot.lastSuccessAt : Number.POSITIVE_INFINITY;
    if (ageMs > STALE_CRITICAL_MS) {
      return {
        tone: "danger",
        staleLevel: "critical",
        title: "Dados desatualizados",
        description: "Ultima atualizacao ha mais de 3 minutos.",
      } as const;
    }

    if (ageMs > STALE_WARNING_MS || slowMode) {
      return {
        tone: "warning",
        staleLevel: "warning",
        title: "Atualizacao com atraso",
        description: slowMode
          ? "Rede lenta detectada. O refresh pode ficar mais espacado."
          : "Sincronizacao em segundo plano mais lenta do que o normal.",
      } as const;
    }

    if (!snapshot.lastSuccessAt) {
      return {
        tone: "info",
        staleLevel: "warning",
        title: "Preparando tempo real",
        description: "Aguardando primeira sincronizacao desta sessao.",
      } as const;
    }

    return {
      tone: "success",
      staleLevel: "none",
      title: "Tempo real ativo",
      description: "Operacao sincronizada em segundo plano.",
    } as const;
  }, [
    nowMs,
    online,
    slowMode,
    snapshot.inFlight,
    snapshot.lastErrorAt,
    snapshot.lastErrorMessage,
    snapshot.lastSuccessAt,
  ]);

  const toneClass =
    state.tone === "danger"
      ? "border-red-500/30 bg-red-500/10 text-red-100"
      : state.tone === "warning"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : state.tone === "success"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          : "border-sky-400/30 bg-sky-400/10 text-sky-100";

  const Icon =
    state.tone === "danger"
      ? CloudOff
      : state.tone === "warning"
        ? AlertTriangle
        : state.tone === "success"
          ? CheckCircle2
          : RefreshCw;

  const isCriticalFallback = state.staleLevel === "critical" && !snapshot.inFlight;
  const canManualSync = online && !snapshot.inFlight;
  const sourceLabel = snapshot.lastSource
    ? snapshot.lastSource.replace("/cliente/painel/", "")
    : "painel";

  return (
    <div className="sticky top-[88px] z-20 space-y-2 lg:top-[86px]">
      <div className={`rounded-2xl border px-3 py-2 shadow-[var(--cliente-shadow-soft)] ${toneClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <Icon className={`h-3.5 w-3.5 ${snapshot.inFlight ? "animate-spin" : ""}`} />
              {state.title}
            </p>
            <p className="mt-1 truncate text-xs opacity-95">{state.description}</p>
          </div>
          <div className="text-right text-[11px] uppercase tracking-[0.12em] opacity-90">
            <p>{snapshot.lastSuccessAt ? `sync ${formatSince(snapshot.lastSuccessAt, nowMs)}` : "sem sync"}</p>
            <p className="mt-1 truncate">{sourceLabel}</p>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => emitClienteRealtimeRefreshEvent({ target: "all" })}
            disabled={!canManualSync}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${snapshot.inFlight ? "animate-spin" : ""}`} />
            Sincronizar agora
          </button>
        </div>
      </div>

      {isCriticalFallback ? (
        <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
            Exibindo modo cache temporario
          </p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
            Alguns blocos podem refletir o ultimo snapshot. Estamos tentando reconectar automaticamente.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-2 animate-pulse rounded-full bg-[var(--cliente-border)]" />
            <div className="h-2 animate-pulse rounded-full bg-[var(--cliente-border)] [animation-delay:120ms]" />
            <div className="h-2 animate-pulse rounded-full bg-[var(--cliente-border)] [animation-delay:240ms]" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
