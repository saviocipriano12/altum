"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";

type TenantSession = {
  tenantId: string;
  tenantName?: string;
  tenantRole?: string;
  clientId?: string;
  clientName?: string;
  userName?: string;
  userEmail?: string;
};

type MeResponse = {
  portalUser?: {
    name?: string;
    email?: string;
    tenantId?: string;
    tenantName?: string;
    tenantRole?: string;
    clientId?: string;
    clientName?: string;
  };
  error?: string;
};

const ClienteTenantContext = createContext<{ tenant: TenantSession | null }>({ tenant: null });

export function useClienteTenant() {
  return useContext(ClienteTenantContext);
}

export default function ClientePanelGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantSession | null>(null);

  useEffect(() => {
    if (pathname === "/cliente/login") {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        router.replace("/cliente/login");
        return;
      }

      try {
        const res = await authedFetch("/api/client-portal/me");
        const payload = (await res.json()) as MeResponse;

        if (!res.ok || !payload.portalUser?.tenantId) {
          setTenant(null);
          router.replace("/cliente/login");
          return;
        }

        const nextTenant: TenantSession = {
          tenantId: payload.portalUser.tenantId,
          tenantName: payload.portalUser.tenantName,
          tenantRole: payload.portalUser.tenantRole,
          clientId: payload.portalUser.clientId,
          clientName: payload.portalUser.clientName,
          userName: payload.portalUser.name,
          userEmail: payload.portalUser.email,
        };

        setTenant(nextTenant);
      } catch {
        setTenant(null);
        router.replace("/cliente/login");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center text-white">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  if (pathname === "/cliente/login") return <>{children}</>;
  if (!tenant) return null;

  return (
    <ClienteTenantContext.Provider value={{ tenant }}>
      <div data-tenant-id={tenant.tenantId}>{children}</div>
    </ClienteTenantContext.Provider>
  );
}
