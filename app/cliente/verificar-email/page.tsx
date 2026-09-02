"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, reload, signOut } from "firebase/auth";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { auth } from "@/firebaseConfig";
import { firebaseAuthErrorMessage } from "@/lib/firebase-auth-errors";

type Notice = { tone: "success" | "warning" | "error"; text: string } | null;

export default function VerificarEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailHint = String(searchParams.get("email") || "").trim();
  const [email, setEmail] = useState(emailHint);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(
    searchParams.get("sent") === "1"
      ? { tone: "success", text: "Conta criada. Enviamos o link de confirmacao para o seu e-mail." }
      : searchParams.get("sent") === "0"
        ? { tone: "warning", text: "Sua conta foi criada, mas o primeiro envio nao foi concluido. Use o botao Reenviar e-mail abaixo." }
        : null
  );
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(0);

  const finishVerification = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/cliente/login");
      return false;
    }

    await reload(user);
    await user.getIdToken(true);
    if (!user.emailVerified) return false;

    const token = await user.getIdToken(true);
    await fetch("/api/auth/verification", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
    router.replace("/cliente/painel?welcome=1&emailVerified=1");
    return true;
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingAuth(false);
        router.replace("/cliente/login");
        return;
      }
      setEmail(user.email || emailHint);
      if (user.emailVerified) {
        await finishVerification();
        return;
      }
      setCheckingAuth(false);
    });
    return () => unsubscribe();
  }, [emailHint, finishVerification, router]);

  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void finishVerification();
    };
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [finishVerification]);

  useEffect(() => {
    if (!resendAvailableAt) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  async function verify() {
    setLoading(true);
    setNotice(null);
    try {
      const verified = await finishVerification();
      if (!verified) {
        setNotice({
          tone: "warning",
          text: "Ainda nao identificamos a confirmacao. Abra o link do e-mail e volte para esta pagina.",
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: firebaseAuthErrorMessage(error, "Nao foi possivel verificar agora.") });
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    const user = auth.currentUser;
    if (!user || resendAvailableAt > Date.now()) return;
    setLoading(true);
    setNotice(null);
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/auth/email/verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nao foi possivel reenviar o e-mail agora.");
      setResendAvailableAt(Date.now() + 60_000);
      setNotice({ tone: "success", text: "Novo e-mail enviado. Confira tambem Spam, Lixo eletronico e Promocoes." });
    } catch (error) {
      const message = error instanceof Error ? error.message : firebaseAuthErrorMessage(error, "Aguarde alguns minutos antes de reenviar.");
      setNotice({ tone: "error", text: message });
    } finally {
      setLoading(false);
    }
  }

  async function handleUseAnotherAccount() {
    await signOut(auth);
    router.replace("/cliente/login");
  }

  if (checkingAuth) {
    return <main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></main>;
  }

  const secondsToResend = Math.max(0, Math.ceil((resendAvailableAt - now) / 1_000));
  const noticeClass = notice?.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : notice?.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0,transparent_38%),#f8fafc] px-4 py-10 text-slate-950 sm:py-16">
      <section className="mx-auto w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_32px_100px_-50px_rgba(15,23,42,.5)]">
        <div className="bg-[linear-gradient(135deg,#0f172a,#172554_58%,#5b21b6)] px-7 py-8 text-white sm:px-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold">
            <ShieldCheck className="h-4 w-4" /> Ultima etapa de seguranca
          </span>
          <span className="mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-blue-100">
            <MailCheck className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-3xl font-black tracking-tight">Confirme seu e-mail</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100">
            Sua conta foi criada. Para proteger sua empresa, confirme que este e-mail realmente pertence a voce.
          </p>
        </div>

        <div className="p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Link enviado para</p>
          <p className="mt-2 break-all rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900">
            {email || "seu e-mail cadastrado"}
          </p>

          <ol className="mt-6 space-y-3 text-sm text-slate-600">
            {[
              "Abra o e-mail enviado pela Altum.",
              "Clique em Verificar meu e-mail.",
              "Volte para esta pagina; o acesso sera liberado automaticamente.",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-black text-white">{index + 1}</span>
                <span className="pt-0.5 leading-5">{step}</span>
              </li>
            ))}
          </ol>

          {notice ? <p role="status" className={`mt-5 rounded-xl border p-3 text-xs font-semibold leading-5 ${noticeClass}`}>{notice.text}</p> : null}

          <button onClick={() => void verify()} disabled={loading} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Ja confirmei meu e-mail
          </button>
          <button onClick={() => void resend()} disabled={loading || secondsToResend > 0} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-blue-700 transition hover:bg-blue-50 disabled:text-slate-400">
            <RefreshCw className="h-4 w-4" />
            {secondsToResend > 0 ? `Reenviar em ${secondsToResend}s` : "Reenviar e-mail"}
          </button>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-slate-800"><Check className="h-4 w-4 text-emerald-600" /> Nao encontrou?</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Pesquise por “Altum”, confira Spam, Lixo eletronico e a aba Promocoes. O link pode levar alguns minutos para chegar.</p>
          </div>

          <button onClick={() => void handleUseAnotherAccount()} className="mt-5 flex w-full items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900">
            <LogOut className="h-3.5 w-3.5" /> Usar outro e-mail
          </button>
          <Link href="/" className="mt-3 flex items-center justify-center gap-1 text-xs font-bold text-blue-700">
            Voltar ao site <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </main>
  );
}
