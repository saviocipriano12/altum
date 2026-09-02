"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  type User,
} from "firebase/auth";
import { ArrowRight, Building2, Check, Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
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

export default function CadastroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const checks = passwordChecks(password);
  const strongPassword = Object.values(checks).every(Boolean);

  useEffect(() => {
    if (auth.currentUser) {
      setName(auth.currentUser.displayName || "");
      setEmail(auth.currentUser.email || "");
    }
  }, []);

  async function bootstrap(user: User) {
    const token = await user.getIdToken(true);
    const response = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, companyName, acceptedTerms }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel preparar sua conta.");
  }

  async function finish(user: User) {
    if (name && user.displayName !== name) await updateProfile(user, { displayName: name });
    await bootstrap(user);
    let verificationSent = false;
    if (!user.emailVerified && user.providerData.some((item) => item.providerId === "password")) {
      try {
        const token = await user.getIdToken(true);
        const response = await fetch("/api/auth/email/verification", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        verificationSent = response.ok;
      } catch {
        // A conta ja existe. A tela seguinte permite reenviar sem repetir o cadastro.
      }
    }
    router.replace(
      user.emailVerified
        ? "/cliente/painel?welcome=1"
        : `/cliente/verificar-email?sent=${verificationSent ? "1" : "0"}&email=${encodeURIComponent(user.email || email)}`
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!strongPassword) return setError("Crie uma senha que atenda a todos os requisitos.");
    if (!acceptedTerms) return setError("Aceite os termos para continuar.");
    setLoading(true);
    setError("");
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await finish(credential.user);
    } catch (caught) {
      setError(firebaseAuthErrorMessage(caught, "Nao foi possivel criar sua conta. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!companyName.trim()) return setError("Informe o nome da empresa antes de continuar com Google.");
    if (!acceptedTerms) return setError("Aceite os termos para continuar.");
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      if (!name) setName(credential.user.displayName || "");
      const resolvedName = name || credential.user.displayName || "Responsavel";
      const token = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: resolvedName, companyName, acceptedTerms }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nao foi possivel preparar sua conta.");
      router.replace("/cliente/painel?welcome=1");
    } catch (caught) {
      setError(firebaseAuthErrorMessage(caught, "Nao foi possivel continuar com Google."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 sm:py-12">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_100px_-50px_rgba(15,23,42,.45)] lg:grid-cols-[.9fr_1.1fr]">
        <section className="hidden bg-[linear-gradient(145deg,#0f172a,#172554_55%,#5b21b6)] p-10 text-white lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold"><ShieldCheck className="h-4 w-4" /> ALTUM segura desde o primeiro acesso</div>
          <h1 className="mt-10 text-4xl font-black leading-tight">Sua operacao comercial com IA, pronta para testar.</h1>
          <p className="mt-5 text-sm leading-7 text-blue-100">Crie sua empresa sem depender do admin. Voce tera 7 dias gratuitos e so escolhe um plano ao final do teste.</p>
          <div className="mt-10 space-y-4 text-sm text-white/85">
            {["7 dias gratis, sem informar cartao", "Dados separados por empresa", "Login por Google ou e-mail", "Cancelamento e plano sob seu controle"].map((item) => <div key={item} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400/20"><Check className="h-4 w-4 text-emerald-300" /></span>{item}</div>)}
          </div>
        </section>

        <section className="p-6 sm:p-9">
          <p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">Criar conta</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Comece seus 7 dias gratis</h2>
          <p className="mt-2 text-sm text-slate-500">Sem cartao agora. Depois do cadastro, voce confirma seu e-mail para liberar o acesso.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field icon={UserRound} label="Seu nome" value={name} onChange={setName} placeholder="Nome completo" autoComplete="name" />
            <Field icon={Building2} label="Empresa" value={companyName} onChange={setCompanyName} placeholder="Nome da sua empresa" autoComplete="organization" />
            <Field icon={Mail} label="E-mail profissional" value={email} onChange={setEmail} placeholder="voce@empresa.com" type="email" autoComplete="email" />
            <div>
              <label className="text-xs font-bold text-slate-600">Senha</label>
              <div className="mt-1 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                <LockKeyhole className="h-4 w-4 text-slate-400" />
                <input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Crie uma senha forte" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                {[[checks.length, "8 caracteres"], [checks.upper && checks.lower, "Maiuscula e minuscula"], [checks.number, "Um numero"], [checks.special, "Um simbolo"]].map(([ok, label]) => <span key={String(label)} className={ok ? "text-emerald-700" : ""}>{ok ? "✓" : "○"} {label}</span>)}
              </div>
            </div>
              <label className="flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" /> <span>Li e aceito os <Link href="/termos" className="font-bold text-blue-700">Termos de Uso</Link> e a <Link href="/politica-de-privacidade" className="font-bold text-blue-700">Politica de Privacidade</Link>.</span></label>
            {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
            <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Criar minha conta</button>
          </form>
          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />ou<span className="h-px flex-1 bg-slate-200" /></div>
          <button type="button" disabled={loading} onClick={() => void handleGoogle()} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><span className="text-lg font-black text-blue-600">G</span> Continuar com Google</button>
          <p className="mt-6 text-center text-sm text-slate-500">Ja tem conta? <Link href="/cliente/login" className="font-bold text-blue-700">Entrar</Link></p>
        </section>
      </div>
    </main>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, type = "text", autoComplete }: { icon: typeof UserRound; label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; autoComplete?: string }) {
  return <div><label className="text-xs font-bold text-slate-600">{label}</label><div className="mt-1 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"><Icon className="h-4 w-4 text-slate-400" /><input required type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></div>;
}
