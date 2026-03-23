"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import { Loader2, Lock, Mail, ArrowRight, ShieldCheck } from "lucide-react";

export default function ClienteLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = String(searchParams.get("tenantId") || "").trim();
  const next = String(searchParams.get("next") || "").trim();

  const buildPortalEndpoint = useCallback(() => {
    return tenantId
      ? `/api/client-portal/me?tenantId=${encodeURIComponent(tenantId)}`
      : "/api/client-portal/me";
  }, [tenantId]);

  const buildPostLoginHref = useCallback((resolvedTenantId?: string) => {
    if (next.startsWith("/cliente/")) {
      return next;
    }
    const finalTenantId = String(resolvedTenantId || tenantId || "").trim();
    if (finalTenantId) {
      return `/cliente/painel?tenantId=${encodeURIComponent(finalTenantId)}`;
    }
    return "/cliente/painel";
  }, [next, tenantId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        const res = await authedFetch(buildPortalEndpoint());
        const payload = (await res.json()) as {
          portalUser?: { tenantId?: string };
        };
        if (res.ok && payload.portalUser?.tenantId) {
          router.push(buildPostLoginHref(payload.portalUser.tenantId));
          return;
        }
      } catch {
        // noop
      }
      setChecking(false);
    });
    return () => unsub();
  }, [buildPortalEndpoint, buildPostLoginHref, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const res = await authedFetch(buildPortalEndpoint());
      const data = (await res.json()) as {
        error?: string;
        portalUser?: { tenantId?: string };
      };
      if (!res.ok) {
        setError(data.error || "Seu acesso ao portal ainda nao foi liberado.");
        return;
      }

      router.push(buildPostLoginHref(data.portalUser?.tenantId));
    } catch {
      setError("Nao foi possivel entrar. Verifique e-mail e senha.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center text-white">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-[460px] rounded-3xl border border-white/10 bg-[#111] p-8">
        <div className="mb-7 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider text-white/70">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
            Portal do Cliente ALTUM
          </div>
          <h1 className="mt-4 text-3xl font-bold">Acesse seu painel</h1>
          <p className="text-sm text-white/50 mt-2">
            Acompanhe campanhas, contratos, pagamentos e entregas em tempo real.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/55">E-mail</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
              <Mail className="h-4 w-4 text-white/40" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="cliente@empresa.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/55">Senha</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
              <Lock className="h-4 w-4 text-white/40" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Entrar no portal
          </button>
        </form>
      </div>
    </div>
  );
}
