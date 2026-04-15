"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";

export type TenantReadinessPayload = {
  settings?: {
    name?: string;
    niche?: string;
    businessProfileId?: "generic" | "imobiliaria" | "clinica" | "agencia";
    phone?: string;
    website?: string;
    inboxRules?: {
      defaultResponseSlaMinutes?: number;
      mode?: string;
      businessHoursOnly?: boolean;
      defaultTeam?: string;
      teams?: Array<{ id: string; name: string }>;
    };
  };
  summary?: {
    activeUsers?: number;
    onlineUsers?: number;
    activeChannels?: number;
    activeForms?: number;
    activeAutomations?: number;
    knowledgeDocs?: number;
    pilotReady?: boolean;
    readinessScore?: number;
  };
  blockers?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  modules?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    status: "ready" | "partial" | "pending";
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  insights?: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  nextBuildItems?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  error?: string;
};

type ReadinessCacheEntry = {
  data: TenantReadinessPayload | null;
  fetchedAt: number;
  inFlight: Promise<TenantReadinessPayload | null> | null;
};

const READINESS_CACHE_TTL_MS = 8000;
const readinessCache = new Map<string, ReadinessCacheEntry>();

async function fetchReadinessShared(tenantId: string, force = false) {
  const now = Date.now();
  const entry =
    readinessCache.get(tenantId) || {
      data: null,
      fetchedAt: 0,
      inFlight: null,
    };

  if (!force && entry.data && now - entry.fetchedAt < READINESS_CACHE_TTL_MS) {
    return entry.data;
  }

  if (entry.inFlight) {
    return entry.inFlight;
  }

  entry.inFlight = (async () => {
    try {
      const res = await authedFetch(`/api/tenant/${tenantId}/readiness`);
      const payload = (await res.json()) as TenantReadinessPayload;
      entry.data = res.ok ? payload : null;
      entry.fetchedAt = Date.now();
      readinessCache.set(tenantId, entry);
      return entry.data;
    } catch {
      entry.data = null;
      entry.fetchedAt = Date.now();
      readinessCache.set(tenantId, entry);
      return null;
    } finally {
      entry.inFlight = null;
    }
  })();

  readinessCache.set(tenantId, entry);
  return entry.inFlight;
}

export function useTenantReadiness(tenantId?: string) {
  const [data, setData] = useState<TenantReadinessPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReadiness = useCallback(
    async (silent = false, force = false) => {
      if (!tenantId) return;

      try {
        if (!silent) setLoading(true);
        const payload = await fetchReadinessShared(tenantId, force);
        setData(payload);
      } catch {
        setData(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (!tenantId) {
      setData(null);
      setLoading(false);
      return;
    }
    void loadReadiness(false, false);
  }, [loadReadiness, tenantId]);

  useAdaptivePolling({
    enabled: Boolean(tenantId),
    onTick: () => loadReadiness(true, true),
    fastIntervalMs: 30000,
    slowIntervalMs: 120000,
    runOnMount: false,
    source: "topbar-readiness",
  });

  return {
    readiness: data,
    loading,
    pilotReady: data?.summary?.pilotReady === true,
    readinessScore: Number(data?.summary?.readinessScore || 0),
    blockerCount: data?.blockers?.length || 0,
  };
}
