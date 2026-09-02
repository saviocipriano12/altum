import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Menu } from "lucide-react";
import { ALTUM_EMAIL } from "@/lib/public-site";

const navigation = [
  { href: "/", label: "Início" },
  { href: "/plataforma", label: "Plataforma" },
  { href: "/precos", label: "Planos" },
  { href: "/implantacao", label: "Implantação" },
  { href: "/blog", label: "Conteúdos" },
] as const;

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-[#f9f9f9]">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-black/88 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-6 px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Altum — página inicial">
            <Image src="/logo-a.png" alt="Logo Altum" width={44} height={44} className="h-11 w-11 rounded-xl" />
            <div>
              <p className="text-sm font-extrabold tracking-[0.2em] text-white">ALTUM</p>
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34 sm:block">Operação comercial com IA</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-4 py-2 text-sm font-semibold text-white/50 transition hover:bg-white/5 hover:text-white">{item.label}</Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link href="/cliente/login" className="rounded-lg px-4 py-2.5 text-sm font-bold text-white/62 transition hover:text-white">Entrar</Link>
            <Link href="/contato?interest=demonstracao" className="inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#ff5c0b]">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
          </div>

          <details className="relative md:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-white/10 text-white" aria-label="Abrir menu"><Menu className="h-5 w-5" /></summary>
            <div className="absolute right-0 top-13 w-72 rounded-2xl border border-white/10 bg-[#0b0b0b] p-3 shadow-2xl">
              {navigation.map((item) => <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-3 text-sm font-semibold text-white/62 hover:bg-white/5 hover:text-white">{item.label}</Link>)}
              <Link href="/contato?interest=demonstracao" className="mt-2 flex items-center justify-between rounded-lg bg-[#e85002] px-4 py-3 text-sm font-bold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </details>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/8 bg-[#080808] px-5 py-10 lg:px-8">
        <div className="mx-auto grid max-w-[1280px] gap-9 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3"><Image src="/logo-a.png" alt="Logo Altum" width={44} height={44} className="h-11 w-11 rounded-xl" /><span className="font-extrabold tracking-[0.2em] text-white">ALTUM</span></div>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/38">O sistema comercial que conecta conversas, CRM, agenda, campanhas, e-commerce e IA em uma única operação.</p>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/26">Produto</p>
            <div className="mt-4 space-y-3 text-sm font-semibold text-white/44">{navigation.slice(1).map((item) => <div key={item.href}><Link href={item.href} className="hover:text-white">{item.label}</Link></div>)}</div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/26">Contato</p>
            <div className="mt-4 space-y-3 text-sm font-semibold text-white/44"><div><Link href="/contato" className="hover:text-white">Falar com a Altum</Link></div><div><a href={`mailto:${ALTUM_EMAIL}`} className="hover:text-white">{ALTUM_EMAIL}</a></div><div><Link href="/politica-de-privacidade" className="hover:text-white">Privacidade</Link></div></div>
          </div>
        </div>
        <div className="mx-auto mt-9 max-w-[1280px] border-t border-white/8 pt-6 text-xs text-white/22">© 2026 Altum. Todos os direitos reservados.</div>
      </footer>
    </div>
  );
}
