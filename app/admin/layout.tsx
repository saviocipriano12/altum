"use client";

import { useEffect, useState } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminHeader from "@/components/AdminHeader";
import CommandPalette from "@/components/CommandPalette";


export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    const saved = localStorage.getItem("altum_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("altum_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex h-screen w-screen bg-[#0B0B0B] text-white overflow-hidden">
      {/* Sidebar */}
      <AdminSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
<CommandPalette />

      {/* Conteúdo */}
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
