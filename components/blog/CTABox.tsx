import Link from "next/link";

type CTABoxProps = {
  variant?: "inline" | "final";
};

export default function CTABox({ variant = "final" }: CTABoxProps) {
  const isInline = variant === "inline";

  return (
    <section
      className={`rounded-2xl border p-6 md:p-8 ${
        isInline ? "my-10 border-white/20 bg-white/5" : "border-[#F56E0F]/30 bg-[#F56E0F]/10"
      }`}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#F56E0F]">
        {isInline ? "Diagnostico rapido" : "Proximo passo"}
      </p>
      <h3 className="mb-3 text-2xl font-bold">
        {isInline ? "Quer aplicar esse modelo na sua operacao?" : "Estruture uma maquina de vendas previsivel com IA"}
      </h3>
      <p className="mb-5 max-w-2xl text-white/80">
        {isInline
          ? "Podemos mapear gargalos de captacao e qualificacao em poucos passos e priorizar as melhorias de maior impacto."
          : "Receba um plano com prioridades de captacao, qualificacao e operacao comercial para reduzir ruido e aumentar conversao."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="rounded-full bg-[#F56E0F] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ff8e44]">
          Solicitar diagnostico
        </Link>
        <Link
          href="/solucoes"
          className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold text-white/90 transition-colors hover:border-white"
        >
          Ver solucoes por vertical
        </Link>
      </div>
    </section>
  );
}
