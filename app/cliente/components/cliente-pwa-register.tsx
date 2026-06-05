"use client";

import { useEffect } from "react";

export function ClientePwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const clientScope = `${window.location.origin}/cliente/`;
        const rootScope = `${window.location.origin}/`;

        for (const registration of registrations) {
          const scriptUrl = String(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "");
          const isAltumWorker = scriptUrl.endsWith("/sw.js") && (registration.scope === rootScope || registration.scope === clientScope);
          if (isAltumWorker) {
            await registration.unregister();
          }
        }

        if (process.env.NODE_ENV !== "production") {
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key.includes("altum-client")).map((key) => caches.delete(key)));
          }
          return;
        }

        await navigator.serviceWorker.register("/sw.js", { scope: "/cliente/" });
      } catch (error) {
        console.warn("Falha ao registrar Service Worker do portal cliente:", error);
      }
    };

    if (document.readyState === "complete") {
      void register();
      return;
    }

    const onLoad = () => void register();
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
