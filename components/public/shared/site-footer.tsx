import Link from "next/link";

type SiteFooterProps = {
  items: ReadonlyArray<{ label: string; href: string }>;
};

export function SiteFooter({ items }: SiteFooterProps) {
  return (
    <footer className="border-t border-white/10 bg-[#050505] px-5 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg font-black text-[#f56e0f]">
            A
          </span>
          <div>
            <p className="altum-display text-sm font-semibold tracking-[0.18em] text-white">
              ALTUM
            </p>
            <p className="text-xs text-white/42">Marketing + Vendas + Operacao</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-5 text-sm font-medium text-white/46">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-white">
              {item.label}
            </Link>
          ))}
          <Link href="/diagnostico" className="hover:text-white">
            Diagnostico
          </Link>
        </div>

        <p className="text-sm text-white/34">2026 Altum. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
