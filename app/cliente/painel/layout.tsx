"use client";

import { useState } from "react";
import { ClienteSidebar } from "@/app/cliente/painel/components/cliente-sidebar";
import { ClienteShellProvider } from "@/app/cliente/painel/components/cliente-shell";
import { ClienteTopbar } from "@/app/cliente/painel/components/cliente-topbar";

function ClientePainelShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--cliente-bg)] text-[var(--cliente-text)] [font-family:var(--font-sans)] transition-[background-color,color] duration-300">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[-120px] h-[320px] w-[320px] rounded-full bg-[var(--cliente-accent-glow)] blur-3xl" />
        <div className="absolute right-[-100px] top-[120px] h-[280px] w-[280px] rounded-full bg-[var(--cliente-accent-secondary-glow)] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,var(--cliente-accent-soft),transparent_58%)] opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--cliente-surface-muted))]" />
      </div>

      <ClienteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ClienteTopbar onOpenMenu={() => setSidebarOpen(true)} />

      <div className="relative transition-[padding] duration-300 lg:pl-[var(--cliente-sidebar-width)]">
        <main className="min-h-screen px-4 pb-10 pt-[132px] transition-[padding] duration-300 lg:px-6 xl:pt-[98px]">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
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

