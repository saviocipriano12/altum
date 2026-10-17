import Link from "next/link";

type CTABoxProps = {
  variant?: "inline" | "final";
};

export default function CTABox({ variant = "final" }: CTABoxProps) {
  const isInline = variant === "inline";

  return (
    <section
      className={`rounded-2xl border p-6 md:p-8 ${
        isInline
          ? "my-10 border-slate-200 bg-white"
          : "border-[#ed782f]/30 bg-[#ed782f]/10"
      }`}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#292a2d]">
        {isInline ? "Da ideia para a operação" : "Próximo passo"}
      </p>
      <h3 className="mb-3 text-2xl font-bold">
        {isInline
          ? "Quer aplicar esse modelo na sua operação?"
          : "Veja a Altum trabalhando no seu cenário comercial"}
      </h3>
      <p className="mb-5 max-w-2xl text-slate-600">
        {isInline
          ? "Conecte atendimento, CRM, agenda, campanhas e IA em um fluxo que continua depois da primeira conversa."
          : "Em uma demonstração, mostramos como a plataforma atende, acompanha oportunidades e transforma dados da operação em próxima ação."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/contato?interest=demonstracao"
          className="rounded-full bg-[#292a2d] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#424346]"
        >
          Agendar demonstração
        </Link>
        <Link
          href="/plataforma"
          className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-white"
        >
          Explorar a plataforma
        </Link>
      </div>
    </section>
  );
}
