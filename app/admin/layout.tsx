"use client";

import { useEffect, useState } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminHeader from "@/components/AdminHeader";
import CommandPalette from "@/components/CommandPalette";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 1. Proteção de Rota
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // 2. Persistência da Sidebar
  useEffect(() => {
    const saved = localStorage.getItem("altum_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("altum_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Tela de carregamento enquanto verifica o usuário
  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#0B0B0B] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  // Se não estiver logado, não renderiza nada (o useEffect redirecionará)
  if (!user) return null;

  // 3. Renderização do Layout Protegido
  return (
    <div className="flex h-screen w-screen bg-[#0B0B0B] text-white overflow-hidden">
      <AdminSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <CommandPalette />

      <div className="flex flex-col flex-1 min-w-0">
        <AdminHeader
          onOpenSidebar={() => setMobileOpen(true)}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />

        <main className="flex-1 overflow-y-auto px-6 md:px-8 py-6 bg-gradient-to-br from-[#0B0B0B] via-[#0E0E0E] to-black">
          {children}
        </main>
      </div>
    </div>
  );
}