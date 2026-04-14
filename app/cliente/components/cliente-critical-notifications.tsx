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
  };
};

type CriticalSnapshot = {
  slaBreached: number;
  deadLetter: number;
  overdueFollowUps: number;
  waitingReplyBacklog: number;
  aiRiskLevel: "stable" | "warning" | "high";
};

const DISMISS_PROMPT_KEY = "altum-client-notify-prompt-dismissed";
const SNAPSHOT_KEY_PREFIX = "altum-client-notify-snapshot";
const MIN_NOTIFY_INTERVAL_MS = 10 * 60 * 1000;

function snapshotStorageKey(tenantId: string) {
  return `${SNAPSHOT_KEY_PREFIX}:${tenantId}`;
}

function notifyCooldownKey(tenantId: string, tag: string) {
  return `${SNAPSHOT_KEY_PREFIX}:${tenantId}:cooldown:${tag}`;
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
  const baselineRef = useRef<CriticalSnapshot | null>(null);

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
          title: "SLA em risco no inbox",
          body: `${current.slaBreached} conversa(s) com SLA estourado. Priorize atendimento agora.`,
          tag: "sla_breached",
          url: "/cliente/painel/inbox?queue=sla_breached",
        });
      }

      if (current.deadLetter > previous.deadLetter) {
        notifications.push({
          title: "Fila da IA com falhas",
          body: `${current.deadLetter} job(s) em dead-letter. Revisar automacoes agora.`,
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

      if (current.aiRiskLevel === "high" && previous.aiRiskLevel !== "high") {
        notifications.push({
          title: "Risco alto no motor de IA",
          body: "Foram detectados sinais de risco alto na fila da IA.",
          tag: "ai_risk_high",
          url: "/cliente/painel/ia",
        });
      }

      if (permission === "granted") {
        for (const item of notifications) {
          if (!canNotifyNow(tenantId, item.tag)) continue;
          await showPortalNotification(item);
        }
      }
    }

    baselineRef.current = current;
    saveSnapshot(tenantId, current);
  }, [permission, tenantId]);

  useAdaptivePolling({
    enabled: Boolean(tenantId) && permission === "granted",
    onTick: refreshSignals,
    fastIntervalMs: 45000,
    slowIntervalMs: 180000,
    runOnMount: true,
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
    } finally {
      setRequesting(false);
    }
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10.7rem)] z-[65] rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-panel-solid)] p-3 shadow-[var(--cliente-shadow-hard)] md:inset-x-auto md:bottom-5 md:right-[410px] md:w-[360px]">
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Ative alertas criticos</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
        Receba avisos quando SLA estourar, follow-ups vencerem ou a fila da IA entrar em risco alto.
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
