"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyActionCode, reload } from "firebase/auth";
import { CheckCircle2, Loader2, MailCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import { auth } from "@/firebaseConfig";
import { firebaseAuthErrorMessage } from "@/lib/firebase-auth-errors";

type State = "working" | "success" | "error";

export function AcaoEmailClient({ mode, oobCode }: { mode: string; oobCode: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("working");
  const [message, setMessage] = useState("Validando sua solicitacao...");

  useEffect(() => {
    let active = true;
    if (mode === "resetPassword") {
      router.replace(`/cliente/redefinir-senha?oobCode=${encodeURIComponent(oobCode)}`);
      return;
    }
    if (!oobCode || !["verifyEmail", "recoverEmail", "verifyAndChangeEmail", "revertSecondFactorAddition"].includes(mode)) {
      setState("error");
      setMessage("Este link de seguranca esta incompleto ou nao e reconhecido.");
      return;
    }

    applyActionCode(auth, oobCode)
      .then(async () => {
        if (!active) return;
        if (auth.currentUser) {
          await reload(auth.currentUser).catch(() => undefined);
          const token = await auth.currentUser.getIdToken(true).catch(() => "");
          if (token && mode === "verifyEmail") {
            await fetch("/api/auth/verification", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
          }
        }
        setState("success");
        setMessage(mode === "verifyEmail" ? "Seu e-mail foi confirmado com sucesso." : mode === "recoverEmail" ? "Seu endereco de e-mail foi recuperado com sucesso." : "A alteracao de seguranca foi concluida.");
      })
      .catch((caught) => {
        if (!active) return;
        setState("error");
        setMessage(firebaseAuthErrorMessage(caught, "Este link e invalido ou expirou. Solicite um novo e-mail."));
      });
    return () => {
      active = false;
    };
  }, [mode, oobCode, router]);

  const Icon = state === "working" ? Loader2 : state === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#dbeafe_0,transparent_38%),#f8fafc] px-4 py-10 text-slate-950">
      <section className="w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_32px_100px_-50px_rgba(15,23,42,.5)]">
        <div className="bg-[linear-gradient(135deg,#0f172a,#172554_58%,#5b21b6)] px-7 py-8 text-white sm:px-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold"><ShieldCheck className="h-4 w-4" /> Seguranca Altum</span>
          <MailCheck className="mt-7 h-10 w-10 text-blue-100" />
          <h1 className="mt-5 text-3xl font-black tracking-tight">Confirmacao de seguranca</h1>
        </div>
        <div className="p-8 text-center">
          <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${state === "success" ? "bg-emerald-100 text-emerald-700" : state === "error" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}><Icon className={`h-7 w-7 ${state === "working" ? "animate-spin" : ""}`} /></span>
          <p role="status" className="mt-5 text-sm font-semibold leading-6 text-slate-700">{message}</p>
          {state !== "working" ? <Link href={state === "success" ? "/cliente/login" : "/cliente/esqueci-senha"} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700">{state === "success" ? "Entrar na Altum" : "Solicitar novo link"}</Link> : null}
        </div>
      </section>
    </main>
  );
}
