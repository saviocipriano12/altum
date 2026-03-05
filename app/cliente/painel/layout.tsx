"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { BarChart3, Bot, Cable, MessageSquare, Settings, Target, Users, LogOut } from "lucide-react";
import { auth } from "@/firebaseConfig";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

const NAV_ITEMS = [
  { href: "/cliente/painel", label: "Overview", icon: BarChart3 },
  { href: "/cliente/painel/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/cliente/painel/crm", label: "CRM", icon: Users },
  { href: "/cliente/painel/ia", label: "IA", icon: Bot },
  { href: "/cliente/painel/automacoes", label: "Automacoes", icon: Cable },
  { href: "/cliente/painel/metricas", label: "Metricas", icon: Target },
  { href: "/cliente/painel/configuracoes", label: "Configuracoes", icon: Settings },
];

export default function ClientePainelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant } = useClienteTenant();

  async function handleLogout() {
    await signOut(auth);
    router.push("/cliente/login");
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d0d0d]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/45">Painel do Cliente ALTUM</p>
            <h1 className="text-lg font-semibold">{tenant?.tenantName || tenant?.clientName || "Cliente"}</h1>
            <p className="text-[11px] text-blue-300/90">Tenant: {tenant?.tenantId || "-"}</p>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs whitespace-nowrap transition ${
                    active
                      ? "border-blue-500/40 bg-blue-500/15 text-blue-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
