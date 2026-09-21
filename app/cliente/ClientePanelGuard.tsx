"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Layers3, LockKeyhole } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/firebaseConfig";
import { ClienteAppOpening } from "@/app/cliente/components/cliente-app-opening";
import { authedFetch } from "@/app/lib/authed-fetch";
import {
  getTenantModuleForClientPath,
  TENANT_MODULE_CATALOG,
  type TenantEntitlementsSnapshot,
  type TenantLimitId,
  type TenantModuleId,
} from "@/lib/tenant-entitlements";
import { getClientBillingRedirect } from "@/lib/client-billing-redirect";
import { getClientRouteAccessRule } from "@/lib/client-route-access";
import { readClientPreference, writeClientPreference } from "@/lib/client-storage";

type TenantSession = {
  userId: string;
  tenantId: string;
  tenantName?: string;
  tenantRole?: string;
  capabilities?: string[];
  entitlements?: TenantEntitlementsSnapshot;
  clientId?: string;
  clientName?: string;
  userName?: string;
  userEmail?: string;
  billingStatus?: string;
  billingProvider?: string | null;
  platformPlan?: string | null;
  pendingPlan?: string | null;
  trialEndsAt?: string | null;
  billingBlockAt?: string | null;
  accessEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  subscriptionId?: string | null;
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
    capabilities?: string[];
    entitlements?: TenantEntitlementsSnapshot;
  };
  error?: string;
  code?: string;
  tenantId?: string;
  billing?: {
    status?: string;
    provider?: string | null;
    planId?: string | null;
    pendingPlanId?: string | null;
    trialEndsAt?: string | null;
    blockAt?: string | null;
    accessEndsAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    subscriptionId?: string | null;
  };
};

const ACTIVE_TENANT_STORAGE_KEY = "altum-client-active-tenant";
const PUBLIC_CLIENT_ROUTES = new Set([
  "/cliente/login",
  "/cliente/assinatura",
  "/cliente/verificar-email",
  "/cliente/esqueci-senha",
  "/cliente/redefinir-senha",
  "/cliente/acao-email",
]);

let cachedTenantSession: TenantSession | null = null;
let cachedTenantUserId = "";

const ClienteTenantContext = createContext<{
  tenant: TenantSession | null;
  hasCapability: (capability: string) => boolean;
  hasModule: (moduleId: TenantModuleId) => boolean;
  getLimit: (limitId: TenantLimitId) => number;
}>({
  tenant: null,
  hasCapability: () => false,
  hasModule: () => false,
  getLimit: () => 0,
});

export function useClienteTenant() {
  return useContext(ClienteTenantContext);
}

export function useClienteCapability(capability: string) {
  const { hasCapability } = useClienteTenant();
  return hasCapability(capability);
}

export default function ClientePanelGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(() => !cachedTenantSession);
  const [tenant, setTenant] = useState<TenantSession | null>(() => cachedTenantSession);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestedTenantId = String(searchParams.get("tenantId") || "").trim();
  const currentQuery = searchParams.toString();
  const isPublicClientRoute = PUBLIC_CLIENT_ROUTES.has(pathname);

  const buildClienteLoginHref = useCallback(() => {
    const nextPath = pathname + (currentQuery ? `?${currentQuery}` : "");
    const nextParams = new URLSearchParams();
    if (requestedTenantId) {
      nextParams.set("tenantId", requestedTenantId);
    }
    nextParams.set("next", nextPath);
    return `/cliente/login?${nextParams.toString()}`;
  }, [currentQuery, pathname, requestedTenantId]);
  const loginHrefRef = useRef(buildClienteLoginHref());

  useEffect(() => {
    loginHrefRef.current = buildClienteLoginHref();
  }, [buildClienteLoginHref]);

  useEffect(() => {
    if (isPublicClientRoute) {
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        cachedTenantSession = null;
        cachedTenantUserId = "";
        setTenant(null);
        setLoading(false);
        router.replace(loginHrefRef.current);
        return;
      }

      try {
        const storedTenantId =
          typeof window !== "undefined"
            ? String(readClientPreference(ACTIVE_TENANT_STORAGE_KEY) || "").trim()
            : "";
        const tenantHint = requestedTenantId || storedTenantId;
        if (
          cachedTenantSession &&
          cachedTenantUserId === user.uid &&
          (!tenantHint || tenantHint === cachedTenantSession.tenantId)
        ) {
          setTenant(cachedTenantSession);
          setLoading(false);
          return;
        }

        setLoading(true);
        setLoadError(false);
        const endpoint = tenantHint
          ? `/api/client-portal/me?tenantId=${encodeURIComponent(tenantHint)}`
          : "/api/client-portal/me";
        const res = await authedFetch(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        const payload = (await res.json()) as MeResponse;
        if (!active || auth.currentUser?.uid !== user.uid) return;

        const billingHref = getClientBillingRedirect(payload, res.status);
        if (billingHref) {
          cachedTenantSession = null;
          cachedTenantUserId = "";
          setTenant(null);
          router.replace(billingHref);
          return;
        }
        if (res.status === 403 && payload.code === "email_not_verified") {
          setTenant(null);
          router.replace("/cliente/verificar-email");
          return;
        }
        if (res.status === 403 && payload.code === "tenant_billing_blocked") {
          setTenant(null);
          router.replace("/cliente/assinatura?reason=billing_blocked");
          return;
        }

        if (!res.ok || !payload.portalUser?.tenantId) {
          cachedTenantSession = null;
          cachedTenantUserId = "";
          setTenant(null);
          if (res.status === 401 || res.status === 403) router.replace(loginHrefRef.current);
          else setLoadError(true);
          return;
        }

        const nextTenant: TenantSession = {
          userId: user.uid,
          tenantId: payload.portalUser.tenantId,
          tenantName: payload.portalUser.tenantName,
          tenantRole: payload.portalUser.tenantRole,
          capabilities: payload.portalUser.capabilities || [],
          entitlements: payload.portalUser.entitlements,
          clientId: payload.portalUser.clientId,
          clientName: payload.portalUser.clientName,
          userName: payload.portalUser.name,
          userEmail: payload.portalUser.email,
          billingStatus: payload.billing?.status,
          billingProvider: payload.billing?.provider,
          platformPlan: payload.billing?.planId,
          pendingPlan: payload.billing?.pendingPlanId,
          trialEndsAt: payload.billing?.trialEndsAt,
          billingBlockAt: payload.billing?.blockAt,
          accessEndsAt: payload.billing?.accessEndsAt,
          cancelAtPeriodEnd: payload.billing?.cancelAtPeriodEnd,
          subscriptionId: payload.billing?.subscriptionId,
        };

        cachedTenantSession = nextTenant;
        cachedTenantUserId = user.uid;
        setTenant(nextTenant);
        if (typeof window !== "undefined" && nextTenant.tenantId) {
          writeClientPreference(ACTIVE_TENANT_STORAGE_KEY, nextTenant.tenantId);
        }
      } catch {
        if (!active || auth.currentUser?.uid !== user.uid) return;
        cachedTenantSession = null;
        cachedTenantUserId = "";
        setTenant(null);
        setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => { active = false; controller.abort(); unsub(); };
  }, [isPublicClientRoute, requestedTenantId, retryCount, router]);

  if (isPublicClientRoute) return <>{children}</>;
  if (loading) {
    return <ClienteAppOpening />;
  }

  if (loadError) return <main className="grid min-h-[100dvh] place-items-center bg-[#f4f6f9] p-5 text-slate-950">
    <section role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">Não conseguimos carregar sua conta</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Confira sua conexão e tente novamente. Você não precisa digitar sua senha outra vez.</p>
      <button onClick={() => { setLoading(true); setLoadError(false); setRetryCount(value => value + 1); }} className="mt-5 min-h-11 w-full rounded-xl bg-blue-600 px-4 font-semibold text-white">Tentar novamente</button>
      <Link href="/cliente/login" className="mt-4 block py-2 text-center text-sm font-semibold text-blue-700">Voltar ao login</Link>
    </section>
  </main>;
  if (!tenant) return <ClienteAppOpening />;

  const requiredModule = getTenantModuleForClientPath(pathname);
  const moduleAvailable = !requiredModule || Boolean(tenant.entitlements?.modules?.[requiredModule]);
  const moduleDefinition = requiredModule
    ? TENANT_MODULE_CATALOG.find((definition) => definition.id === requiredModule)
    : null;
  const routeAccessRule = getClientRouteAccessRule(pathname);
  const hasRouteAccess = !routeAccessRule || Boolean((tenant.capabilities || []).includes(routeAccessRule.capability));

  if (!moduleAvailable) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] px-5 py-12 text-slate-950">
        <div className="mx-auto max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#EFF6FF,#EEF2FF)] p-6">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_18px_36px_-20px_rgba(37,99,235,0.9)]">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Módulo não disponível neste contrato</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {moduleDefinition?.label || "Este recurso"} não faz parte da oferta ativa de {tenant.tenantName || "sua empresa"}.
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <p className="text-sm leading-6 text-slate-600">
                Fale com o administrador da conta ou com a Altum para incluir este módulo. Seus dados e os demais recursos continuam disponíveis normalmente.
              </p>
            </div>
            <Link href="/cliente/painel" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!hasRouteAccess && routeAccessRule) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] px-5 py-12 text-slate-950">
        <div className="mx-auto max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#EFF6FF,#F5F3FF)] p-6">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><LockKeyhole className="h-5 w-5" /></span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{routeAccessRule.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{routeAccessRule.description}</p>
          </div>
          <div className="p-6">
            <p className="text-sm leading-6 text-slate-600">Peça ao administrador de {tenant.tenantName || "sua empresa"} para alterar seu perfil ou liberar essa responsabilidade.</p>
            <Link href="/cliente/painel" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">Voltar ao início</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ClienteTenantContext.Provider
      value={{
        tenant,
        hasCapability: (capability: string) => Boolean((tenant.capabilities || []).includes(capability)),
        hasModule: (moduleId: TenantModuleId) => Boolean(tenant.entitlements?.modules?.[moduleId]),
        getLimit: (limitId: TenantLimitId) => Number(tenant.entitlements?.limits?.[limitId] || 0),
      }}
    >
      <div data-tenant-id={tenant.tenantId}>{children}</div>
    </ClienteTenantContext.Provider>
  );
}
