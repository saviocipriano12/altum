"use client";

import Link from "next/link";
export default function ClientError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-[#f4f6f9] p-5 text-slate-950">
    <section role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">Não conseguimos abrir esta página</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Tente novamente. Se a conexão caiu ou o app foi atualizado, recarregue a página.</p>
      <div className="mt-5 grid gap-3">
        <button onClick={retry} className="min-h-11 rounded-xl bg-blue-600 px-4 font-semibold text-white">Tentar novamente</button>
        <button onClick={() => window.location.reload()} className="min-h-11 rounded-xl border border-slate-200 px-4 font-semibold">Recarregar página</button>
        <Link href="/cliente/painel" className="py-2 text-center text-sm font-semibold text-blue-700">Voltar ao início</Link>
      </div>
    </section>
  </main>;
}
