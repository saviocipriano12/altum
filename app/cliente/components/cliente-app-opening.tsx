"use client";

import { LoaderCircle } from "lucide-react";

export function ClienteAppOpening() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6f9] px-6 text-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-blue-100/70 blur-3xl" />
        <div className="absolute bottom-[-20rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-slate-200/80 blur-3xl" />
      </div>

      <div className="client-opening-content relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="client-opening-mark relative">
          <div className="absolute inset-0 scale-150 rounded-[28px] bg-blue-500/10 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border border-slate-200/80 bg-white p-3 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.28)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="Altum" className="h-full w-full rounded-[18px] object-contain" />
          </div>
        </div>

        <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Altum</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[1.75rem]">
          Sua operacao comercial
        </h1>
        <p className="mt-2 text-sm text-slate-500">Conversas, clientes e vendas em um só lugar.</p>

        <div className="mt-8 flex items-center gap-2 text-xs font-medium text-slate-500" role="status" aria-live="polite">
          <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
          Preparando seu dia
        </div>
      </div>
    </div>
  );
}
