"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Erro inesperado na interface pública:", error);
  }, [error]);

  return (
    <main data-altum-surface="public" className="grid min-h-screen place-items-center px-5 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[var(--altum-public-panel)] p-8 text-center shadow-2xl sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-300">
          <TriangleAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-6 text-3xl font-extrabold">Não foi possível carregar esta página</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">A falha pode ser temporária. Tente novamente ou volte para o início.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={retry} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--altum-primary)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--altum-primary-hover)]">
            <RefreshCcw className="h-4 w-4" /> Tentar novamente
          </button>
          <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-5 py-3 text-sm font-bold text-white hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}
