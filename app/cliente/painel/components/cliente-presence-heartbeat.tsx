"use client";

import { useEffect } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

export function ClientePresenceHeartbeat() {
  const { tenant } = useClienteTenant();

  useEffect(() => {
    if (!tenant?.tenantId) return;
    const endpoint = `/api/tenant/${tenant.tenantId}/presence`;
    const send = (state: "online" | "away" | "offline") => {
      void authedFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
        keepalive: state === "offline",
      }).catch(() => undefined);
    };
    const sync = () => send(document.visibilityState === "visible" && navigator.onLine !== false ? "online" : "away");
    const leave = () => send("offline");
    sync();
    const timer = window.setInterval(sync, 45_000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("pagehide", leave);
    };
  }, [tenant?.tenantId]);

  return null;
}
