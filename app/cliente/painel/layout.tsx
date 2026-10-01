"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ClienteBottomNav } from "@/app/cliente/painel/components/cliente-bottom-nav";
import { ClienteSidebar } from "@/app/cliente/painel/components/cliente-sidebar";
import { ClienteShellProvider, useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { ClienteTopbar } from "@/app/cliente/painel/components/cliente-topbar";
import { ClienteTrialBanner } from "@/app/cliente/components/cliente-trial-banner";

// These tools are useful after the workspace is ready, but should not delay the
// first interaction with Conversas, Clientes or Agenda on slower devices.
const ClienteCommandPalette = dynamic(() => import("@/app/cliente/painel/components/cliente-command-palette").then((mod) => mod.ClienteCommandPalette), { ssr: false });
const ClientePresenceHeartbeat = dynamic(() => import("@/app/cliente/painel/components/cliente-presence-heartbeat").then((mod) => mod.ClientePresenceHeartbeat), { ssr: false });
const ClienteActivationCenter = dynamic(() => import("@/app/cliente/painel/components/cliente-activation-center").then((mod) => mod.ClienteActivationCenter), { ssr: false });
const ClienteGuidedTour = dynamic(() => import("@/app/cliente/painel/components/cliente-guided-tour").then((mod) => mod.ClienteGuidedTour), { ssr: false });
const ClienteCriticalNotifications = dynamic(() => import("@/app/cliente/components/cliente-critical-notifications").then((mod) => mod.ClienteCriticalNotifications), { ssr: false });

function ClientAppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [enhancementsReady, setEnhancementsReady] = useState(false);
  const pathname = usePathname();
  const { density } = useClienteShell();
  const compact = density === "compact";
  const isAssistantSurface = /^\/cliente\/painel\/(ia|automacoes|conhecimento|perguntar-altum)(\/|$)/.test(pathname || "");
  const isInboxSurface = /^\/cliente\/painel\/inbox(\/|$)/.test(pathname || "");
  const isCrmSurface = /^\/cliente\/painel\/(crm|pipeline|comercial)(\/|$)/.test(pathname || "");
  const clientArea = isInboxSurface ? "inbox" : isAssistantSurface ? "assistant" : "daily";
  const mainPaddingClass = isInboxSurface
    ? "px-0 pb-0 pt-0 lg:px-7 lg:pb-10 xl:pt-[104px]"
    : compact
      ? "px-3 pb-[calc(env(safe-area-inset-bottom)+5.75rem)] pt-[76px] sm:pb-20 sm:pt-[102px] lg:px-6 lg:pb-8 xl:pt-[104px]"
      : "px-3 pb-[calc(env(safe-area-inset-bottom)+6.25rem)] pt-[76px] sm:px-4 sm:pb-24 sm:pt-[108px] lg:px-7 lg:pb-10 xl:pt-[104px]";

  useEffect(() => {
    const openSidebar = () => setSidebarOpen(true);
    window.addEventListener("altum:cliente-sidebar-open", openSidebar);
    return () => window.removeEventListener("altum:cliente-sidebar-open", openSidebar);
  }, []);

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 700) as unknown as number);
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const task = schedule(() => setEnhancementsReady(true), { timeout: 1_500 });
    return () => cancel(task);
  }, []);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div
      data-client-area={clientArea}
      className="relative min-h-screen overflow-x-clip bg-[var(--cliente-bg)] pb-[env(safe-area-inset-bottom)] text-[var(--cliente-text)] [font-family:var(--cliente-font-family)] transition-[background-color,color] duration-300"
    >
      <div className="client-shell-ambient pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[var(--cliente-bg)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,var(--cliente-bg-elevated),transparent)] opacity-70" />
      </div>

      <ClienteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={isInboxSurface ? "max-xl:hidden" : ""}>
        <ClienteTopbar onOpenMenu={() => setSidebarOpen(true)} />
      </div>
      <ClienteCommandPalette />
      {enhancementsReady ? (
        <>
          <ClientePresenceHeartbeat />
          <ClienteActivationCenter />
          <ClienteGuidedTour />
        </>
      ) : null}

      <div className="relative transition-[padding] duration-300 lg:pl-[var(--cliente-sidebar-width)]">
        <main id="client-main" className={`min-h-[100dvh] min-w-0 transition-[padding] duration-300 ${mainPaddingClass}`}>
          <ClienteTrialBanner />
          <div
            data-tour-key="page-content"
            className={`client-route-stage ${isInboxSurface || isCrmSurface ? "mx-0 max-w-none" : "mx-auto max-w-[1520px]"} ${compact ? "space-y-3" : "space-y-4"}`}
          >
            {children}
          </div>
        </main>
      </div>

      <Suspense fallback={null}>
        <ClienteBottomNav />
        {enhancementsReady ? <ClienteCriticalNotifications /> : null}
      </Suspense>
    </div>
  );
}

export default function ClientePainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClienteShellProvider>
      <ClientAppShell>{children}</ClientAppShell>
    </ClienteShellProvider>
  );
}

