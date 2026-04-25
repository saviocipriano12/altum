import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exclusao de Dados | ALTUM",
  description: "Canal oficial da ALTUM para solicitacoes e comprovacao de exclusao de dados.",
};

type PageProps = {
  searchParams?: Promise<{ code?: string }>;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export default async function DataDeletionPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const code = clean(searchParams?.code, 120);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto max-w-3xl px-4 py-16">
        <header className="mb-10 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
            ALTUM - Dados e Privacidade
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Exclusao de Dados</h1>
          <p className="mt-3 text-sm text-slate-300">
            Esta pagina confirma o recebimento de solicitacoes de exclusao e orienta o titular sobre o fluxo de atendimento.
          </p>
        </header>

        <div className="space-y-6 text-sm leading-relaxed text-slate-200">
          {code ? (
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-100/80">Codigo de confirmacao</p>
              <p className="mt-2 font-mono text-base text-emerald-100">{code}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4 text-slate-300">
              Nenhum codigo de confirmacao foi informado na URL.
            </div>
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-amber-300">Como solicitar</h2>
            <p>
              Envie sua solicitacao para <span className="font-semibold text-slate-100">suporte.altum@gmail.com</span> com os dados de identificacao da conta e o contexto da integracao.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-amber-300">Prazo e retorno</h2>
            <p>
              A ALTUM registra e processa pedidos de exclusao conforme LGPD. O status da solicitacao e comunicado pelo canal oficial de suporte.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
