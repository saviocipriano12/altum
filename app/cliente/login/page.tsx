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

  const buildPostLoginHref = useCallback(
    (resolvedTenantId?: string) => {
      if (next.startsWith("/cliente/")) {
        return next;
      }
      const finalTenantId = String(resolvedTenantId || tenantId || "").trim();
      if (finalTenantId) {
        return `/cliente/painel?tenantId=${encodeURIComponent(finalTenantId)}`;
      }
      return "/cliente/painel";
    },
    [next, tenantId]
  );

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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-[-120px] h-[280px] w-[280px] rounded-full bg-[#2563EB]/25 blur-3xl" />
          <div className="absolute right-[-80px] top-[120px] h-[240px] w-[240px] rounded-full bg-[#7C3AED]/20 blur-3xl" />
          <div className="absolute inset-0 opacity-20 [background:repeating-linear-gradient(90deg,rgba(96,165,250,0.14)_0px,rgba(96,165,250,0.14)_1px,transparent_1px,transparent_10px)]" />
        </div>
        <Loader2 className="relative h-7 w-7 animate-spin text-[#60A5FA]" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] p-4 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-[-140px] h-[340px] w-[340px] rounded-full bg-[#2563EB]/25 blur-3xl" />
        <div className="absolute right-[-120px] top-[130px] h-[300px] w-[300px] rounded-full bg-[#7C3AED]/20 blur-3xl" />
        <div className="absolute inset-0 opacity-20 [background:repeating-linear-gradient(90deg,rgba(96,165,250,0.14)_0px,rgba(96,165,250,0.14)_1px,transparent_1px,transparent_10px)]" />
      </div>

      <div className="relative w-full max-w-[460px] rounded-3xl border border-white/10 bg-black/55 p-8 backdrop-blur-xl">
        <div className="mb-7 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#60A5FA]/30 bg-[#2563EB]/14 px-3 py-1 text-[11px] uppercase tracking-wider text-[#F9F9F9]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#60A5FA]" />
            Portal do Cliente ALTUM
          </div>
          <h1 className="mt-4 text-3xl font-bold">Acesse seu painel</h1>
          <p className="mt-2 text-sm text-white/60">
            Atenda conversas, acompanhe clientes e avance oportunidades com IA em tempo real.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/65">E-mail</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2">
              <Mail className="h-4 w-4 text-[#60A5FA]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="cliente@empresa.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/65">Senha</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2">
              <Lock className="h-4 w-4 text-[#60A5FA]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="********"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#2563EB,#7C3AED)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Entrar no portal
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.16em] text-white/35">ALTUM Operacao Comercial v1.0</p>
      </div>
    </div>
  );
}
