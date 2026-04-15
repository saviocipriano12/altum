"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

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

export function ClienteNetworkBanner() {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [slowMode, setSlowMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      const info = getNetworkInfo();
      const effectiveType = String(info?.effectiveType || "").toLowerCase();
      const isSlow = Boolean(info?.saveData || effectiveType.includes("2g") || effectiveType === "slow-2g");
      setOnline(navigator.onLine !== false);
      setSlowMode(isSlow);
    };

    const info = getNetworkInfo();

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    info?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      info?.removeEventListener?.("change", update);
    };
  }, []);

  const state = useMemo(() => {
    if (!online) {
      return {
        label: "Sem conexao: exibindo o ultimo estado disponivel.",
        className: "border-red-500/30 bg-red-500/10 text-red-100",
      };
    }

    if (slowMode) {
      return {
        label: "Rede lenta: atualizacao em tempo real pode ficar mais espaçada.",
        className: "border-amber-400/30 bg-amber-400/10 text-amber-100",
      };
    }

    return null;
  }, [online, slowMode]);

  if (pathname?.startsWith("/cliente/painel")) return null;
  if (!state) return null;

  return (
    <div className={`fixed inset-x-3 top-[86px] z-[60] rounded-xl border px-3 py-2 text-xs font-medium shadow-[var(--cliente-shadow-soft)] lg:top-5 lg:left-[calc(var(--cliente-sidebar-width)+1.5rem)] lg:right-5 ${state.className}`}>
      {state.label}
    </div>
  );
}
