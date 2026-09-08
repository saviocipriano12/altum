import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, DatabaseZap, MessageCircleMore, Route, Target, Workflow } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { toJsonLdScript } from "@/lib/schema";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://altumia.com.br").trim().replace(/\/+$/, "");

export const metadata: Metadata = buildMarketingMetadata({
  title: "Sobre a ALTUM | Plataforma de vendas e relacionamento com IA",
  description: "Conheça a ALTUM, plataforma que conecta atendimento, CRM, pipeline, automações e inteligência artificial para dar continuidade à operação comercial.",
  path: "/sobre",
});

const pillars = [
  [MessageCircleMore, "Atendimento conectado", "Conversas e contexto comercial ficam ligados ao cliente em vez de separados por canal."],
  [Target, "CRM e pipeline", "Oportunidades, etapas, responsáveis, tarefas e próximas ações compartilham o mesmo processo."],
  [Bot, "Inteligência artificial", "A IA pode apoiar resposta, qualificação, contexto, priorização e handoff sem funcionar como uma camada isolada."],
  [Workflow, "Automações", "Gatilhos e ações ajudam a manter follow-ups, tarefas e rotinas comerciais em movimento."],
  [DatabaseZap, "Memória operacional", "Histórico de conversa, dados do CRM e sinais comerciais permanecem acessíveis ao longo da jornada."],
  [Route, "Continuidade", "A proposta central da ALTUM é reduzir perdas entre mensagem, atendimento, CRM, pipeline e próxima ação."],
] as const;

export default function SobrePage() {
  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${SITE_URL}/sobre#about`,
    url: `${SITE_URL}/sobre`,
    name: "Sobre a ALTUM",
    description: "ALTUM é uma plataforma de vendas e relacionamento com inteligência artificial que conecta atendimento, CRM, pipeline, automações e métricas comerciais.",
    about: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "ALTUM",
      url: SITE_URL,
    },
  };

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Sobre a ALTUM</p>
          <h1 className="mt-6 max-w-[13ch] text-[clamp(3.2rem,6.5vw,6.5rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Uma plataforma para a venda não se perder entre conversas e sistemas.</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-white/60">A ALTUM é uma plataforma de vendas e relacionamento com inteligência artificial. Ela conecta atendimento, CRM, pipeline, follow-ups, automações e métricas para que o contexto continue acompanhando a oportunidade do primeiro contato à próxima ação.</p>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[980px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Definição</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">O que é a ALTUM?</h2>
          <p className="mt-5 text-lg leading-8 text-white/68">ALTUM é um sistema comercial que reúne conversas, clientes, oportunidades, pipeline, próximas ações, automações e inteligência artificial. O objetivo é manter dados e contexto juntos para que atendimento e vendas trabalhem como uma única operação, em vez de depender de ferramentas desconectadas.</p>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Como a plataforma é organizada</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">A conversa é uma entrada. A operação continua depois dela.</h2></div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pillars.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div>
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Principais áreas</p>
          <h2 className="mt-5 max-w-[13ch] text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">Entenda a ALTUM pelo trabalho que ela ajuda a executar.</h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
            ["CRM", "/crm"],
            ["CRM para WhatsApp", "/crm-para-whatsapp"],
            ["Inbox", "/inbox"],
            ["Pipeline", "/pipeline"],
            ["Follow-up", "/follow-up"],
            ["IA para vendas", "/ia-para-vendas"],
            ["Automações", "/automacoes"],
            ["Integrações", "/integracoes"],
          ].map(([label, href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-black/25">{label}<ArrowRight className="h-4 w-4" /></Link>)}</div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Conheça o produto</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como as partes da operação comercial trabalham juntas na ALTUM.</h2><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/plataforma" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Explorar a plataforma <ArrowRight className="h-4 w-4" /></Link><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88">Agendar demonstração</Link></div></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(aboutSchema)} />
    </SiteShell>
  );
}
