import Link from "next/link";

const OPTIONS = [
  {
    id: "a",
    title: "Modelo A / Command Dark",
    subtitle: "Visual premium escuro com painel de comando.",
    href: "/preview/a",
  },
  {
    id: "b",
    title: "Modelo B / Clear Light",
    subtitle: "Layout claro empresarial, familiar para o mercado.",
    href: "/preview/b",
  },
  {
    id: "c",
    title: "Modelo C / Hibrido ALTUM",
    subtitle: "Equilibrio entre inovacao visual e uso diario simples.",
    href: "/preview/c",
  },
];

export default function PreviewModelosPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-5xl">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">ALTUM / Preview</p>
        <h1 className="mt-2 text-3xl font-semibold">Escolha o modelo visual</h1>
        <p className="mt-2 text-sm text-slate-300">
          Compare os 3 caminhos de design antes de aplicar na plataforma real.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {OPTIONS.map((option) => (
            <Link
              key={option.id}
              href={option.href}
              className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 transition hover:border-cyan-300"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{option.id}</p>
              <h2 className="mt-2 text-lg font-semibold">{option.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{option.subtitle}</p>
              <p className="mt-4 text-xs text-cyan-300">Abrir preview</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

