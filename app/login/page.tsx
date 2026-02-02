

"use client";

import { useState, useEffect } from "react";
import { auth } from "@/firebaseConfig"; // Usando @ para garantir o caminho
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Lock, Mail, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Se o usuário já estiver logado, manda direto para o dashboard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/admin/dashboard");
      }
      setCheckingAuth(false);
    });
    return () => unsub();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin/dashboard");
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("E-mail ou senha incorretos.");
      } else {
        setError("Erro ao conectar com o servidor.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] p-4 text-white font-sans">
      {/* Detalhes de fundo para estética Premium */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/60 mb-6 uppercase tracking-widest font-semibold">
            <ShieldCheck size={14} className="text-blue-400" />
            Altum OS • Acesso Restrito
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            Bem-vindo
          </h1>
          <p className="text-sm text-white/40 mt-3 font-medium">Insira suas credenciais para gerenciar a agência</p>
        </div>

        <div className="bg-[#111111] border border-white/5 rounded-3xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-wider text-white/40 ml-1 font-bold">E-mail Corporativo</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-500 transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@altum.com"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-white/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-wider text-white/40 ml-1 font-bold">Senha de Acesso</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-white/20"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-3 px-4 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-1">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-600/20 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Entrar no Console
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-[11px] text-white/20 uppercase tracking-[0.2em] font-medium">
          Powered by Altum Infrastructure v1.0
        </p>
      </div>
    </div>
  );
}