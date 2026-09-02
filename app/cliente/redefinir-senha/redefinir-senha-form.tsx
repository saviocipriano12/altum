"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { auth } from "@/firebaseConfig";
import { firebaseAuthErrorMessage } from "@/lib/firebase-auth-errors";

function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function RedefinirSenhaForm({ oobCode }: { oobCode: string }) {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const checks = passwordChecks(password);
  const strongPassword = Object.values(checks).every(Boolean);

  useEffect(() => {
    let active = true;
    if (!oobCode) {
      setError("Este link de redefinicao esta incompleto.");
      setChecking(false);
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (active) setEmail(resolvedEmail);
      })
      .catch((caught) => {
        if (active) setError(firebaseAuthErrorMessage(caught, "Este link e invalido ou expirou. Solicite um novo e-mail."));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [oobCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!strongPassword) return setError("Crie uma senha que atenda a todos os requisitos.");
    if (password !== confirmation) return setError("As duas senhas precisam ser iguais.");
    setError("");
    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setCompleted(true);
    } catch (caught) {
      setError(firebaseAuthErrorMessage(caught, "Nao foi possivel redefinir a senha. Solicite um novo link."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ddd6fe_0,transparent_38%),#f8fafc] px-4 py-10 text-slate-950 sm:py-16">
      <section className="mx-auto w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_32px_100px_-50px_rgba(15,23,42,.5)]">
        <div className="bg-[linear-gradient(135deg,#0f172a,#172554_58%,#5b21b6)] px-7 py-8 text-white sm:px-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold"><ShieldCheck className="h-4 w-4" /> Link protegido e de uso unico</span>
          <span className="mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-violet-100"><LockKeyhole className="h-7 w-7" /></span>
          <h1 className="mt-5 text-3xl font-black tracking-tight">Crie uma nova senha</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100">Use pelo menos 8 caracteres e combine letras, numero e simbolo.</p>
        </div>

        <div className="p-7 sm:p-9">
          {checking ? <div className="flex items-center justify-center gap-3 py-10 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Validando seu link...</div> : completed ? (
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></span>
              <h2 className="mt-5 text-2xl font-black">Senha atualizada</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Sua nova senha ja pode ser usada para acessar a Altum.</p>
              <Link href="/cliente/login?passwordReset=1" className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700">Entrar na plataforma</Link>
            </div>
          ) : email ? (
            <form onSubmit={submit}>
              <p className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">Redefinindo a senha de <strong>{email}</strong></p>
              <PasswordField id="new-password" label="Nova senha" value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                {[[checks.length, "8 caracteres"], [checks.upper && checks.lower, "Maiuscula e minuscula"], [checks.number, "Um numero"], [checks.special, "Um simbolo"]].map(([ok, label]) => <span key={String(label)} className={ok ? "text-emerald-700" : ""}>{ok ? "✓" : "○"} {label}</span>)}
              </div>
              <div className="mt-5"><PasswordField id="confirm-password" label="Confirme a nova senha" value={confirmation} onChange={setConfirmation} show={showPassword} onToggle={() => setShowPassword((value) => !value)} /></div>
              {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
              <button disabled={loading} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Salvar nova senha</button>
            </form>
          ) : (
            <div className="text-center">
              <h2 className="text-xl font-black">Nao foi possivel usar este link</h2>
              <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
              <Link href="/cliente/esqueci-senha" className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700">Solicitar novo link</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PasswordField({ id, label, value, onChange, show, onToggle }: { id: string; label: string; value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void }) {
  return <div><label htmlFor={id} className="text-xs font-bold text-slate-600">{label}</label><div className="mt-1 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"><LockKeyhole className="h-4 w-4 text-slate-400" /><input id={id} required minLength={8} type={show ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /> <button type="button" onClick={onToggle} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="text-slate-400">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>;
}
