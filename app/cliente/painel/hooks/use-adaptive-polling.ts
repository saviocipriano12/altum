"use client";

import { useEffect, useRef } from "react";
import {
  CLIENTE_REALTIME_REFRESH_EVENT,
  emitClienteRealtimePollEvent,
  type ClienteRealtimeRefreshEventDetail,
} from "@/app/cliente/painel/hooks/realtime-poll-events";

type PollingOptions = {
  enabled: boolean;
  onTick: () => Promise<void> | void;
  fastIntervalMs?: number;
  slowIntervalMs?: number;
  runOnMount?: boolean;
  source?: string;
};

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

function getNetworkInfo(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

export function useAdaptivePolling({
  enabled,
  onTick,
  fastIntervalMs = 20000,
  slowIntervalMs = 90000,
  runOnMount = true,
  source,
}: PollingOptions) {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    let inFlight = false;
    let timer: number | null = null;

    const networkInfo = getNetworkInfo();
    const sourceLabel = String(source || window.location.pathname || "polling");

    const parseErrorMessage = (error: unknown) => {
      if (error instanceof Error) return error.message;
      if (typeof error === "string") return error;
      return "Falha ao atualizar em segundo plano.";
    };

    const computeDelay = () => {
      const hidden = document.visibilityState !== "visible";
      const online = navigator.onLine !== false;
      let delay = hidden || !online ? slowIntervalMs : fastIntervalMs;

      const effectiveType = String(networkInfo?.effectiveType || "").toLowerCase();
      if (networkInfo?.saveData || effectiveType.includes("2g")) {
        delay = Math.max(delay, slowIntervalMs);
      }

      return delay;
    };

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void run();
      }, computeDelay());
    };

    const run = async (forced = false) => {
      if (cancelled) return;

      const isVisible = document.visibilityState === "visible";
      const isOnline = navigator.onLine !== false;
      const canPoll = isOnline && (forced || isVisible);

      if (!canPoll) {
        emitClienteRealtimePollEvent({
          phase: "skipped",
          at: Date.now(),
          source: sourceLabel,
          reason: isOnline ? "hidden" : "offline",
        });
        schedule();
        return;
      }

      if (inFlight) {
        emitClienteRealtimePollEvent({
          phase: "skipped",
          at: Date.now(),
          source: sourceLabel,
          reason: "in_flight",
        });
        schedule();
        return;
      }

      inFlight = true;
      emitClienteRealtimePollEvent({
        phase: "start",
        at: Date.now(),
        source: sourceLabel,
      });

      try {
        await onTickRef.current();
        emitClienteRealtimePollEvent({
          phase: "success",
          at: Date.now(),
          source: sourceLabel,
        });
      } catch (error) {
        emitClienteRealtimePollEvent({
          phase: "error",
          at: Date.now(),
          source: sourceLabel,
          error: parseErrorMessage(error),
        });
      } finally {
        inFlight = false;
      }

      schedule();
    };

    const onEnvironmentChange = () => {
      schedule();
    };

    const onManualRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<ClienteRealtimeRefreshEventDetail>;
      const target = String(customEvent.detail?.target || "all");
      if (target !== "all" && target !== sourceLabel) return;
      clearTimer();
      void run(true);
    };

    document.addEventListener("visibilitychange", onEnvironmentChange);
    window.addEventListener("online", onEnvironmentChange);
    window.addEventListener("offline", onEnvironmentChange);
    window.addEventListener(CLIENTE_REALTIME_REFRESH_EVENT, onManualRefresh as EventListener);
    networkInfo?.addEventListener?.("change", onEnvironmentChange);

    if (runOnMount) {
      void run();
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onEnvironmentChange);
      window.removeEventListener("online", onEnvironmentChange);
      window.removeEventListener("offline", onEnvironmentChange);
      window.removeEventListener(CLIENTE_REALTIME_REFRESH_EVENT, onManualRefresh as EventListener);
      networkInfo?.removeEventListener?.("change", onEnvironmentChange);
    };
  }, [enabled, fastIntervalMs, runOnMount, slowIntervalMs, source]);
}
