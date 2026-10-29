"use client";

import { useRef } from "react";
import { Download, X } from "lucide-react";

export function MessageImagePreview({ src, name, onError }: { src: string; name?: string | null; onError: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="block w-full cursor-zoom-in" aria-label="Ampliar imagem" onClick={() => dialog.current?.showModal()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name || "Imagem da conversa"} className="max-h-[360px] w-full object-contain" loading="lazy" onError={onError} />
    </button>
    <dialog ref={dialog} aria-label="Imagem ampliada" className="m-auto max-h-[95dvh] max-w-[95vw] rounded-xl bg-slate-950 p-3 text-white backdrop:bg-black/80"
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="mb-2 flex items-center justify-end gap-2">
        <a href={src} download={name || "imagem"} className="flex h-11 w-11 items-center justify-center rounded-full" aria-label="Baixar imagem"><Download className="h-5 w-5" /></a>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full" aria-label="Fechar imagem" onClick={() => dialog.current?.close()}><X className="h-5 w-5" /></button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name || "Imagem da conversa"} className="max-h-[78dvh] max-w-full object-contain" />
    </dialog>
  </>;
}
