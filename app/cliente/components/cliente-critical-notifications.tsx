"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";

type AutomationSummaryPayload = {
  summary?: {
    waitingReplyBacklog?: number;
    slaBreached?: number;
    queue?: {
      deadLetter?: number;
    };
    aiHealth?: {
      riskLevel?: "stable" | "warning" | "high";
    };
    commercial?: {
      overdueFollowUps?: number;
    };
    finance?: {
      dueSoonCount?: number;
    };
  };
};

type CriticalSnapshot = {
  slaBreached: number;
  deadLetter: number;
  overdueFollowUps: number;
  waitingReplyBacklog: number;
  financeDueSoon: number;
  aiRiskLevel: "stable" | "warning" | "high";
};

const DISMISS_PROMPT_KEY = "altum-client-notify-prompt-dismissed";
const SNAPSHOT_KEY_PREFIX = "altum-client-notify-snapshot";
const TEST_SENT_KEY_PREFIX = "altum-client-push-test-sent";
const ENDPOINT_KEY_PREFIX = "altum-client-push-endpoint";
const MIN_NOTIFY_INTERVAL_MS = 10 * 60 * 1000;

function snapshotStorageKey(tenantId: string) {
  return `${SNAPSHOT_KEY_PREFIX}:${tenantId}`;
}

function notifyCooldownKey(tenantId: string, tag: string) {
  return `${SNAPSHOT_KEY_PREFIX}:${tenantId}:cooldown:${tag}`;
}

function pushTestStorageKey(tenantId: string) {
  return `${TEST_SENT_KEY_PREFIX}:${tenantId}`;
}

function endpointStorageKey(tenantId: string) {
  return `${ENDPOINT_KEY_PREFIX}:${tenantId}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function readStoredSnapshot(tenantId: string): CriticalSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(snapshotStorageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CriticalSnapshot>;
    if (!parsed) return null;
    return {
      slaBreached: Number(parsed.slaBreached || 0),
      deadLetter: Number(parsed.deadLetter || 0),
      overdueFollowUps: Number(parsed.overdueFollowUps || 0),
      waitingReplyBacklog: Number(parsed.waitingReplyBacklog || 0),
      financeDueSoon: Number(parsed.financeDueSoon || 0),
      aiRiskLevel:
        parsed.aiRiskLevel === "high" || parsed.aiRiskLevel === "warning" ? parsed.aiRiskLevel : "stable",
    };
  } catch {
    return null;
  }
}

function saveSnapshot(tenantId: string, snapshot: CriticalSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(snapshotStorageKey(tenantId), JSON.stringify(snapshot));
}

function canNotifyNow(tenantId: string, tag: string) {
  if (typeof window === "undefined") return false;
  const key = notifyCooldownKey(tenantId, tag);
  const last = Number(window.localStorage.getItem(key) || 0);
  const now = Date.now();
  if (now - last < MIN_NOTIFY_INTERVAL_MS) return false;
  window.localStorage.setItem(key, String(now));
  return true;
}

async function showPortalNotification(input: {
  title: string;
  body: string;
  tag: string;
  url: string;
}) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration && "showNotification" in registration) {
      await registration.showNotification(input.title, {
        body: input.body,
        tag: input.tag,
        icon: "/pwa/icon-192.png",
        badge: "/pwa/icon-192.png",
        data: { url: input.url },
      });
      return;
    }
  } catch {
    // Fallback para Notification API direta.
  }

  const direct = new Notification(input.title, {
    body: input.body,
    tag: input.tag,
    icon: "/pwa/icon-192.png",
  });
  direct.onclick = () => {
    window.focus();
    window.location.href = input.url;
    direct.close();
  };
}

function toSnapshot(payload: AutomationSummaryPayload): CriticalSnapshot {
  const summary = payload.summary || {};
  return {
    slaBreached: Number(summary.slaBreached || 0),
    deadLetter: Number(summary.queue?.deadLetter || 0),
    overdueFollowUps: Number(summary.commercial?.overdueFollowUps || 0),
    waitingReplyBacklog: Number(summary.waitingReplyBacklog || 0),
    financeDueSoon: Number(summary.finance?.dueSoonCount || 0),
    aiRiskLevel: summary.aiHealth?.riskLevel === "high" || summary.aiHealth?.riskLevel === "warning"
      ? summary.aiHealth.riskLevel
      : "stable",
  };
}

export function ClienteCriticalNotifications() {
  const { tenant } = useClienteTenant();
  const tenantId = tenant?.tenantId || "";
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [promptDismissed, setPromptDismissed] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
  const [hasOwnServerSubscription, setHasOwnServerSubscription] = useState(false);
  const baselineRef = useRef<CriticalSnapshot | null>(null);
  const endpointRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);
    setPromptDismissed(window.localStorage.getItem(DISMISS_PROMPT_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!tenantId) {
      baselineRef.current = null;
      return;
    }
    baselineRef.current = readStoredSnapshot(tenantId);
  }, [tenantId]);

  const loadPushStatus = useCallback(async () => {
    if (!tenantId) {
      setPushEnabled(false);
      setPushPublicKey(null);
      setHasOwnServerSubscription(false);
      endpointRef.current = "";
      return;
    }

    try {
      const res = await authedFetch("/api/client-portal/push/subscription");
      const payload = (await res.json()) as {
        enabled?: boolean;
        publicKey?: string | null;
        hasOwnSubscription?: boolean;
      };
      setPushEnabled(payload.enabled === true);
      setPushPublicKey(typeof payload.publicKey === "string" ? payload.publicKey : null);
      setHasOwnServerSubscription(payload.hasOwnSubscription === true);
    } catch {
      setPushEnabled(false);
      setPushPublicKey(null);
      setHasOwnServerSubscription(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadPushStatus();
  }, [loadPushStatus]);

  const syncPushSubscription = useCallback(async () => {
    if (!tenantId) return;
    if (permission !== "granted") return;
    if (!pushEnabled || !pushPublicKey) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.pushManager) return;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
        });
      }

      const endpoint = String(subscription.endpoint || "");
      if (!endpoint) return;
      const endpointKey = endpointStorageKey(tenantId);
      const previousEndpoint = window.localStorage.getItem(endpointKey) || "";

      const shouldSync = endpointRef.current !== endpoint || !hasOwnServerSubscription;
      endpointRef.current = endpoint;

      if (shouldSync) {
        const saveRes = await authedFetch("/api/client-portal/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        if (saveRes.ok) setHasOwnServerSubscription(true);
      }

      if (previousEndpoint && previousEndpoint !== endpoint) {
        await authedFetch("/api/client-portal/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: previousEndpoint }),
        });
      }

      window.localStorage.setItem(endpointKey, endpoint);

      const testKey = pushTestStorageKey(tenantId);
      if (window.localStorage.getItem(testKey) !== endpoint) {
        await authedFetch("/api/client-portal/push/test", {
          method: "POST",
        });
        window.localStorage.setItem(testKey, endpoint);
      }
    } catch (error) {
      console.warn("Falha ao sincronizar push do portal cliente:", error);
    }
  }, [hasOwnServerSubscription, permission, pushEnabled, pushPublicKey, tenantId]);

  const clearPushSubscription = useCallback(async () => {
    if (!tenantId) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.pushManager) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        await authedFetch("/api/client-portal/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        endpointRef.current = "";
        setHasOwnServerSubscription(false);
        return;
      }

      const endpoint = String(subscription.endpoint || "");
      await subscription.unsubscribe();

      if (endpoint) {
        await authedFetch("/api/client-portal/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }

      window.localStorage.removeItem(endpointStorageKey(tenantId));
      endpointRef.current = "";
      setHasOwnServerSubscription(false);
    } catch (error) {
      console.warn("Falha ao limpar subscription push do portal cliente:", error);
    }
  }, [tenantId]);

  useEffect(() => {
    void syncPushSubscription();
  }, [syncPushSubscription]);

  useEffect(() => {
    if (permission !== "denied") return;
    void clearPushSubscription();
  }, [clearPushSubscription, permission]);

  const useLocalFallback = permission === "granted" && (!pushEnabled || !hasOwnServerSubscription);

  const refreshSignals = useCallback(async () => {
    if (!tenantId) return;
    const res = await authedFetch(`/api/tenant/${tenantId}/automation-summary`);
    const payload = (await res.json()) as AutomationSummaryPayload;
    if (!res.ok) return;

    const current = toSnapshot(payload);
    const previous = baselineRef.current;

    if (previous) {
      const notifications: Array<{ title: string; body: string; tag: string; url: string }> = [];

      if (current.slaBreached > previous.slaBreached) {
        notifications.push({
          title: "Atendimento atrasado",
          body: `${current.slaBreached} conversa(s) passaram do prazo combinado. Priorize atendimento agora.`,
          tag: "sla_breached",
          url: "/cliente/painel/inbox?queue=sla_breached",
        });
      }

      if (current.deadLetter > previous.deadLetter) {
        notifications.push({
          title: "Assistente precisa de revisão",
          body: `${current.deadLetter} conversa(s) precisam de revisão antes de voltar ao fluxo normal.`,
          tag: "ai_dead_letter",
          url: "/cliente/painel/automacoes",
        });
      }

      if (current.overdueFollowUps > previous.overdueFollowUps) {
        notifications.push({
          title: "Follow-ups vencidos",
          body: `${current.overdueFollowUps} tarefa(s) comercial(is) atrasada(s).`,
          tag: "overdue_followups",
          url: "/cliente/painel/follow-ups",
        });
      }

      if (current.financeDueSoon > previous.financeDueSoon) {
        notifications.push({
          title: "Faturas proximas do vencimento",
          body: `${current.financeDueSoon} cobranca(s) vencem nos proximos 5 dias.`,
          tag: "finance_due_soon",
          url: "/cliente/painel/comercial?financeStatus=pendente",
        });
      }

      if (current.aiRiskLevel === "high" && previous.aiRiskLevel !== "high") {
        notifications.push({
          title: "Assistente em atenção",
          body: "Foram detectados sinais de risco alto no atendimento automatizado.",
          tag: "ai_risk_high",
          url: "/cliente/painel/ia",
        });
      }

      if (useLocalFallback) {
        for (const item of notifications) {
          if (!canNotifyNow(tenantId, item.tag)) continue;
          await showPortalNotification(item);
        }
      }
    }

    baselineRef.current = current;
    saveSnapshot(tenantId, current);
  }, [tenantId, useLocalFallback]);

  useAdaptivePolling({
    enabled: Boolean(tenantId) && useLocalFallback,
    onTick: refreshSignals,
    fastIntervalMs: 45000,
    slowIntervalMs: 180000,
    runOnMount: true,
    source: "critical-notifications",
  });

  const showPrompt = useMemo(() => {
    return (
      permission === "default" &&
      !promptDismissed &&
      Boolean(tenantId)
    );
  }, [permission, promptDismissed, tenantId]);

  function dismissPrompt() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_PROMPT_KEY, "true");
    }
    setPromptDismissed(true);
  }

  async function requestPermission() {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "default") {
        dismissPrompt();
      }
      if (result === "granted") {
        await syncPushSubscription();
      }
    } finally {
      setRequesting(false);
    }
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10.7rem)] z-[65] rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-panel-solid)] p-3 shadow-[var(--cliente-shadow-hard)] md:inset-x-auto md:bottom-5 md:right-[410px] md:w-[360px]">
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Ative alertas criticos</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
        Receba avisos quando o atendimento atrasar, follow-ups vencerem ou o assistente precisar de revisão.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void requestPermission()}
          disabled={requesting}
          className="inline-flex min-w-[130px] items-center justify-center rounded-xl bg-[var(--cliente-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {requesting ? "Ativando..." : "Ativar alertas"}
        </button>
        <button
          type="button"
          onClick={dismissPrompt}
          className="inline-flex items-center justify-center rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
        >
          Agora nao
        </button>
      </div>
    </div>
  );
}
