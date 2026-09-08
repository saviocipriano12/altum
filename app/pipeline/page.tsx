import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Clock3, Route, Tags, Target, UserRoundCheck } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pipeline de Vendas com IA e CRM",
  description: "Acompanhe oportunidades, etapas, responsáveis, valor, tarefas e próximas ações em um pipeline de vendas conectado ao CRM e à IA da ALTUM.",
  path: "/pipeline",
});

const features = [
  [Target, "Etapa comercial clara", "Cada oportunidade mostra onde está e qual movimento precisa acontecer para continuar avançando."],
  [UserRoundCheck, "Responsável definido", "A oportunidade tem dono, histórico e contexto para reduzir perda por falta de acompanhamento."],
  [Clock3, "Próxima ação", "Tarefa, prazo, reunião ou follow-up ficam visíveis para que a venda não desapareça da rotina."],
  [Tags, "Origem e contexto", "Canal, campanha, tags e informações do lead ajudam a comparar qualidade e prioridade."],
  [BarChart3, "Leitura do funil", "A operação enxerga volume, avanço, gargalos e resultado por etapa em vez de trabalhar no escuro."],
  [Route, "Pipeline conectado", "Inbox, CRM, IA e automações alimentam o funil e mantêm o contexto vivo durante a negociação."],
] as const;

export default function PipelinePage() {
  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto grid max-w-[1280px] gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Pipeline de vendas</p>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Veja onde cada venda está — e o que precisa acontecer para ela avançar.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">O pipeline da ALTUM conecta oportunidade, responsável, valor, histórico e próxima ação ao mesmo contexto que começou na conversa.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">Ver o pipeline em ação <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/crm" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">Conhecer o CRM</Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
            <Image src="/images/platform/marketing/platform-crm-pipeline.png" alt="Pipeline de vendas da ALTUM" width={1586} height={992} priority sizes="(min-width:1280px) 58vw, 96vw" className="h-auto w-full rounded-[1.15rem]" />
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Controle do funil</p>
            <h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">Um pipeline útil mostra mais do que cartões em colunas.</h2>
            <p className="mt-6 text-lg leading-8 text-white/52">Ele precisa mostrar prioridade, responsável, contexto e próxima ação. É isso que transforma visualização em execução comercial.</p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Do pipeline à próxima ação</p>
            <h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">Oportunidade parada precisa virar sinal, não silêncio.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-black/56">A ALTUM conecta etapa e histórico a tarefas, follow-up e automações para que o time perceba a oportunidade antes que ela esfrie.</p>
            <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/automacoes" className="inline-flex items-center gap-2 text-[#c84500]">Ver automações <ArrowRight className="h-4 w-4" /></Link><Link href="/ia-para-vendas" className="inline-flex items-center gap-2 text-[#c84500]">Ver IA para vendas <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_rgba(20,20,20,0.08)]"><Image src="/images/platform/marketing/platform-dashboard.png" alt="Visão comercial da ALTUM conectada ao pipeline" width={1586} height={992} sizes="(min-width:1024px) 55vw, 96vw" className="h-auto w-full rounded-[1rem]" /></div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Pipeline + execução</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Descubra onde sua operação perde oportunidades entre uma etapa e outra.</h2><div className="mt-8 flex flex-wrap gap-3 text-sm text-white/62">{["CRM", "Pipeline", "Follow-up", "Automação", "IA", "Relatórios"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>
    </SiteShell>
  );
}
