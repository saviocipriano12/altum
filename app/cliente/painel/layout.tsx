"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ClienteBottomNav } from "@/app/cliente/painel/components/cliente-bottom-nav";
import { ClienteCommandPalette } from "@/app/cliente/painel/components/cliente-command-palette";
import { ClienteSidebar } from "@/app/cliente/painel/components/cliente-sidebar";
import { ClienteShellProvider, useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { ClienteTopbar } from "@/app/cliente/painel/components/cliente-topbar";

function ClientePainelShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { density } = useClienteShell();
  const compact = density === "compact";
  const isAdminSurface = /^\/cliente\/painel\/(ia|automacoes|conhecimento)(\/|$)/.test(pathname || "");
  const clientArea = isAdminSurface ? "admin" : "daily";

  return (
    <div
      data-client-area={clientArea}
      className="relative min-h-screen overflow-hidden bg-[var(--cliente-bg)] text-[var(--cliente-text)] [font-family:var(--cliente-font-family)] transition-[background-color,color] duration-300"
    >
      <div className="client-shell-ambient pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[var(--cliente-bg)]" />
        <div className="absolute inset-x-0 top-0 h-[360px] bg-[linear-gradient(180deg,var(--cliente-accent-glow),transparent_68%)]" />
        <div className="absolute inset-y-0 right-0 w-[42vw] bg-[linear-gradient(90deg,transparent,var(--cliente-accent-secondary-glow))]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,var(--cliente-bg)_78%)]" />
      </div>

      <ClienteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ClienteTopbar onOpenMenu={() => setSidebarOpen(true)} />
      <ClienteCommandPalette />

      <div className="relative transition-[padding] duration-300 lg:pl-[var(--cliente-sidebar-width)]">
        <main className={`min-h-screen transition-[padding] duration-300 ${compact ? "px-3 pb-24 pt-[118px] sm:pb-20 lg:px-5 lg:pb-8 xl:pt-[92px]" : "px-4 pb-28 pt-[130px] sm:pb-24 lg:px-6 lg:pb-10 xl:pt-[96px]"}`}>
          <div className={`mx-auto max-w-[1440px] ${compact ? "space-y-3" : "space-y-4"}`}>
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
      <ClientePainelShell>{children}</ClientePainelShell>
    </ClienteShellProvider>
  );
}

