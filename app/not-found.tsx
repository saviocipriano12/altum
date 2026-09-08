import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";

export default function NotFound() {
  return (
    <SiteShell>
      <section className="grid min-h-[68vh] place-items-center px-5 py-16">
        <div className="max-w-xl text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-blue-300"><SearchX className="h-7 w-7" /></span>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-300">Erro 404</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight">Esta página não existe</h1>
          <p className="mt-4 text-base leading-7 text-slate-400">O endereço pode ter mudado ou estar incompleto.</p>
          <Link href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[var(--altum-primary)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--altum-primary-hover)]"><ArrowLeft className="h-4 w-4" /> Voltar ao início</Link>
        </div>
      </section>
    </SiteShell>
  );
}
