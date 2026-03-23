"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";

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

export function useTenantReadiness(tenantId?: string) {
  const [data, setData] = useState<TenantReadinessPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setData(null);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await authedFetch(`/api/tenant/${tenantId}/readiness`);
        const payload = (await res.json()) as TenantReadinessPayload;
        if (!mounted) return;
        if (res.ok) {
          setData(payload);
        } else {
          setData(null);
        }
      } catch {
        if (!mounted) return;
        setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenantId]);

  return {
    readiness: data,
    loading,
    pilotReady: data?.summary?.pilotReady === true,
    readinessScore: Number(data?.summary?.readinessScore || 0),
    blockerCount: data?.blockers?.length || 0,
  };
}
