"use client";

import { useEffect } from "react";

export function ClientePwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const rootScope = `${window.location.origin}/`;

        for (const registration of registrations) {
          const scriptUrl = String(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "");
          if (registration.scope === rootScope && scriptUrl.endsWith("/sw.js")) {
            await registration.unregister();
          }
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
