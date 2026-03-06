"use client";

import { useState } from "react";
import { ClienteSidebar } from "@/app/cliente/painel/components/cliente-sidebar";
import { ClienteTopbar } from "@/app/cliente/painel/components/cliente-topbar";

export default function ClientePainelLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#060b14] text-white [font-family:var(--font-sans)]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-20%] top-[-25%] h-[34rem] w-[34rem] rounded-full bg-cyan-500/8 blur-3xl" />
        <div className="absolute right-[-15%] top-[10%] h-[28rem] w-[28rem] rounded-full bg-blue-500/8 blur-3xl" />
        <div className="absolute bottom-[-25%] left-[15%] h-[32rem] w-[32rem] rounded-full bg-indigo-500/8 blur-3xl" />
      </div>

      <ClienteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ClienteTopbar onOpenMenu={() => setSidebarOpen(true)} />

      <div className="lg:pl-[270px]">
        <main className="px-4 pb-8 pt-[92px] lg:px-6 lg:pt-[94px]">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
