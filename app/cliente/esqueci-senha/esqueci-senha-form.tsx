"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";

export function EsqueciSenhaForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/email/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nao foi possivel enviar o link agora.");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel enviar o link agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0,transparent_38%),#f8fafc] px-4 py-10 text-slate-950 sm:py-16">
      <section className="mx-auto w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_32px_100px_-50px_rgba(15,23,42,.5)]">
        <div className="bg-[linear-gradient(135deg,#0f172a,#172554_58%,#5b21b6)] px-7 py-8 text-white sm:px-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold"><ShieldCheck className="h-4 w-4" /> Recuperacao segura</span>
          <span className="mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-blue-100"><KeyRound className="h-7 w-7" /></span>
          <h1 className="mt-5 text-3xl font-black tracking-tight">Redefina sua senha</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100">Enviaremos um link de uso unico para confirmar sua identidade e criar uma nova senha.</p>
        </div>

        <div className="p-7 sm:p-9">
          {sent ? (
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span>
              <h2 className="mt-5 text-xl font-black">Confira seu e-mail</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Se existir uma conta para <strong>{email.trim().toLowerCase()}</strong>, enviaremos as instrucoes. Confira tambem Spam, Lixo eletronico e Promocoes.</p>
              <button type="button" onClick={() => setSent(false)} className="mt-5 text-sm font-bold text-blue-700 hover:text-blue-900">Usar outro e-mail</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="reset-email" className="text-xs font-bold text-slate-600">E-mail da sua conta</label>
              <div className="mt-1 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                <Mail className="h-4 w-4 text-slate-400" />
                <input id="reset-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="voce@empresa.com" />
              </div>
              {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
              <button disabled={loading} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar link de redefinicao
              </button>
            </form>
          )}
          <Link href="/cliente/login" className="mt-7 flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Voltar para o login</Link>
        </div>
      </section>
    </main>
  );
}
