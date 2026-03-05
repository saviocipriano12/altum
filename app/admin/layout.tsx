"use client";

import { useEffect, useMemo, useState } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminHeader from "@/components/AdminHeader";
import CommandPalette from "@/components/CommandPalette";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const ADMIN_ONLY_PREFIXES = [
  "/admin/equipe",
  "/admin/config",
  "/admin/pipeline",
  "/admin/prospeccao/gerar",
  "/admin/campanhas",
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const needsAdmin = useMemo(
    () => ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
    [pathname]
  );

  useEffect(() => {
    if (loading) return;

    if (!user || !profile) {
      router.push("/login");
      return;
    }

    if (profile.role === "client") {
      router.push("/cliente/painel");
      return;
    }

    if (needsAdmin && !isAdmin) {
      router.push("/admin/dashboard");
    }
  }, [loading, user, profile, needsAdmin, isAdmin, router]);

  useEffect(() => {
    const saved = localStorage.getItem("altum_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("altum_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#0B0B0B] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  if (!user || !profile) return null;
  if (profile.role === "client") return null;
  if (needsAdmin && !isAdmin) return null;

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
