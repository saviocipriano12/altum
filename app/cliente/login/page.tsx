"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getClientBillingRedirect } from "@/lib/client-billing-redirect";
import { auth } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import { firebaseAuthErrorMessage } from "@/lib/firebase-auth-errors";
import { Loader2, Lock, Mail, ArrowRight, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function ClienteLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = String(searchParams.get("tenantId") || "").trim();
  const next = String(searchParams.get("next") || "").trim();
  const passwordReset = searchParams.get("passwordReset") === "1";

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

      const usesPassword = user.providerData.some((provider) => provider.providerId === "password");
      if (usesPassword && !user.emailVerified) {
        setChecking(false);
        router.replace(`/cliente/verificar-email?email=${encodeURIComponent(user.email || "")}`);
        return;
      }

      try {
        const res = await authedFetch(buildPortalEndpoint(), { signal: AbortSignal.timeout(20_000) });
        const payload = (await res.json()) as {
          code?: string; tenantId?: string;
          portalUser?: { tenantId?: string };
        };
        const billingHref = getClientBillingRedirect(payload, res.status);
        if (billingHref) { router.replace(billingHref); return; }
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
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!credential.user.emailVerified) {
        router.replace(`/cliente/verificar-email?email=${encodeURIComponent(credential.user.email || email)}`);
        return;
      }
      const res = await authedFetch(buildPortalEndpoint(), { signal: AbortSignal.timeout(20_000) });
      const data = (await res.json()) as {
        error?: string; code?: string; tenantId?: string;
        portalUser?: { tenantId?: string };
      };
      const billingHref = getClientBillingRedirect(data, res.status);
      if (billingHref) { router.replace(billingHref); return; }
      if (!res.ok) {
        setError(data.error || "Seu acesso ao portal ainda nao foi liberado.");
        return;
      }

      router.push(buildPostLoginHref(data.portalUser?.tenantId));
    } catch (caught) {
      setError(firebaseAuthErrorMessage(caught, "Nao foi possivel entrar. Verifique e-mail e senha."));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      const res = await authedFetch(buildPortalEndpoint(), { signal: AbortSignal.timeout(20_000) });
      const data = (await res.json().catch(() => ({}))) as { portalUser?: { tenantId?: string }; code?: string; tenantId?: string };
      const billingHref = getClientBillingRedirect(data, res.status);
      if (billingHref) { router.replace(billingHref); return; }
      if (res.ok && data.portalUser?.tenantId) {
        router.push(buildPostLoginHref(data.portalUser.tenantId));
        return;
      }
      if (data.code === "portal_user_not_found") {
        router.push("/cadastro?google=1");
        return;
      }
      setError("Sua conta Google ainda nao esta vinculada a uma empresa.");
    } catch (caught) {
      setError(firebaseAuthErrorMessage(caught, "Nao foi possivel entrar com Google."));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main className="client-mobile-login grid place-items-center p-5"><div role="status" className="flex items-center gap-3 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-blue-600" />Abrindo sua conta…</div></main>;
  }

  return <main className="client-mobile-login flex flex-col items-center justify-center px-4 sm:px-6">
    <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold tracking-wider text-slate-950"><ShieldCheck className="h-5 w-5 text-blue-600" /> ALTUM</Link>
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">Entre na sua conta</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Suas conversas, clientes e próximos passos em um só lugar.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div><label htmlFor="client-email" className="text-sm font-semibold text-slate-700">E-mail</label>
          <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><input id="client-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="min-w-0 w-full bg-transparent py-3 text-base text-slate-950 outline-none" placeholder="voce@empresa.com" /></div>
        </div>
        <div><label htmlFor="client-password" className="text-sm font-semibold text-slate-700">Senha</label>
          <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white pl-3 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100"><Lock className="h-4 w-4 shrink-0 text-slate-400" /><input id="client-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="min-w-0 w-full bg-transparent py-3 text-base text-slate-950 outline-none" placeholder="Sua senha" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-slate-500">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
        </div>
        {passwordReset && !error ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Senha atualizada. Entre usando sua nova senha.</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p> : null}
        <button type="submit" disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{loading ? "Entrando…" : "Entrar"}</button>
        <Link href={email.trim() ? `/cliente/esqueci-senha?email=${encodeURIComponent(email.trim())}` : "/cliente/esqueci-senha"} className="flex min-h-11 items-center justify-center text-sm font-semibold text-blue-700">Esqueci minha senha</Link>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />ou<span className="h-px flex-1 bg-slate-200" /></div>
      <button type="button" onClick={() => void handleGoogleLogin()} disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-60"><span aria-hidden="true" className="text-lg font-bold text-blue-600">G</span>Continuar com Google</button>
    </section>
    <p className="mt-6 text-center text-sm leading-6 text-slate-600">Ainda não tem conta? <Link href="/cadastro" className="font-bold text-blue-700">Teste grátis por 7 dias</Link></p>
    <Link href="/" className="mt-3 flex min-h-11 items-center text-sm text-slate-500">Voltar ao site</Link>
  </main>;
}
