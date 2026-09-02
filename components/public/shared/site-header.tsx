import Link from "next/link";
import { ArrowRight, Menu } from "lucide-react";

type SiteHeaderProps = {
  items: ReadonlyArray<{ label: string; href: string }>;
};

export function SiteHeader({ items }: SiteHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-[26px] border border-white/10 bg-[#090909]/78 px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-2xl lg:px-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,110,15,0.65),transparent_32%)] opacity-80" />
            <span className="relative text-lg font-black text-[#f56e0f]">A</span>
          </span>

          <span className="hidden leading-tight sm:block">
            <span className="altum-display block text-sm font-semibold tracking-[0.18em] text-white/90">
              ALTUM
            </span>
            <span className="block text-xs font-medium text-white/42">
              Marketing + Vendas + Operacao
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-white/56 transition hover:bg-white/[0.06] hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/plataforma"
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white/74 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            Conhecer plataforma
          </Link>
          <Link
            href="/diagnostico?entry=header"
            className="group inline-flex items-center gap-2 rounded-full bg-[#f56e0f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_48px_rgba(245,110,15,0.28)] transition hover:bg-[#ff7f26]"
          >
            Fazer quiz estrategico
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <details className="relative md:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 text-white/75">
            <Menu className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 top-14 w-[280px] rounded-[24px] border border-white/10 bg-[#111111] p-4 shadow-2xl">
            <div className="space-y-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-[16px] px-3 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.04] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <Link
              href="/diagnostico?entry=mobile_menu"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f56e0f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ff7f26]"
            >
              Fazer o quiz
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
