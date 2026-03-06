"use client";

import { useState } from "react";
import { ClienteSidebar } from "@/app/cliente/painel/components/cliente-sidebar";
import { ClienteTopbar } from "@/app/cliente/painel/components/cliente-topbar";

export default function ClientePainelLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white [font-family:var(--font-sans)]">
      <ClienteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ClienteTopbar onOpenMenu={() => setSidebarOpen(true)} />

      <div className="lg:pl-[270px]">
        <main className="min-h-screen px-4 pb-8 pt-[92px] lg:px-6 lg:pt-[94px] bg-gradient-to-br from-[#0B0B0B] via-[#0E0E0E] to-black">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

