"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ClienteBottomNav } from "@/app/cliente/painel/components/cliente-bottom-nav";
import { ClienteCommandPalette } from "@/app/cliente/painel/components/cliente-command-palette";
import { ClienteSidebar } from "@/app/cliente/painel/components/cliente-sidebar";
import { ClienteShellProvider, useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { ClienteTopbar } from "@/app/cliente/painel/components/cliente-topbar";

function ClientAppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { density } = useClienteShell();
  const compact = density === "compact";
  const isAssistantSurface = /^\/cliente\/painel\/(ia|automacoes|conhecimento|perguntar-altum)(\/|$)/.test(pathname || "");
  const clientArea = isAssistantSurface ? "assistant" : "daily";

  return (
    <div
      data-client-area={clientArea}
      className="relative min-h-screen overflow-hidden bg-[var(--cliente-bg)] text-[var(--cliente-text)] [font-family:var(--cliente-font-family)] transition-[background-color,color] duration-300"
    >
      <div className="client-shell-ambient pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[var(--cliente-bg)]" />
        <div className="absolute inset-x-0 top-0 h-[460px] bg-[linear-gradient(180deg,var(--cliente-accent-glow),transparent_74%)]" />
        <div className="absolute right-[-8vw] top-[9vh] h-[30rem] w-[30rem] rounded-full bg-[var(--cliente-accent-glow)] blur-3xl" />
        <div className="absolute left-[-11vw] top-[42vh] h-[24rem] w-[24rem] rounded-full bg-[var(--cliente-accent-secondary-glow)] blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-[48vw] bg-[linear-gradient(90deg,transparent,var(--cliente-accent-secondary-glow))]" />
        <div className="absolute left-[14vw] top-[12vh] h-[18rem] w-[18rem] rounded-full bg-[color-mix(in_srgb,var(--cliente-accent-soft)_58%,transparent)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,var(--cliente-bg)_78%)]" />
      </div>

      <ClienteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ClienteTopbar onOpenMenu={() => setSidebarOpen(true)} />
      <ClienteCommandPalette />

      <div className="relative transition-[padding] duration-300 lg:pl-[var(--cliente-sidebar-width)]">
        <main className={`min-h-screen transition-[padding] duration-300 ${compact ? "px-3 pb-24 pt-[88px] sm:pb-20 sm:pt-[122px] lg:px-6 lg:pb-8 xl:pt-[102px]" : "px-3 pb-28 pt-[88px] sm:px-4 sm:pb-24 sm:pt-[136px] lg:px-7 lg:pb-10 xl:pt-[108px]"}`}>
          <div className={`mx-auto max-w-[1560px] ${compact ? "space-y-3.5" : "space-y-5"}`}>
            {children}
          </div>
        </main>
      </div>

      <ClienteBottomNav />
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

