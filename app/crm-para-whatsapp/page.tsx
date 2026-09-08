import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, Clock3, MessageCircleMore, Route, Target, UserRoundCheck } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "CRM para WhatsApp com IA e Pipeline de Vendas",
  description: "Use WhatsApp conectado ao CRM, pipeline, IA, tarefas e follow-up. A ALTUM transforma conversas em oportunidades com contexto comercial.",
  path: "/crm-para-whatsapp",
});

const benefits = [
  [MessageCircleMore, "WhatsApp ligado ao histórico", "A conversa acompanha o contato e evita que o vendedor precise reconstruir contexto em outra ferramenta."],
  [Target, "Conversa vira oportunidade", "O contato pode seguir para pipeline com etapa, valor, responsável e próxima ação."],
  [Bot, "IA ajuda a qualificar", "A IA pode identificar intenção, sinais e informações úteis antes de a equipe assumir."],
  [Clock3, "Follow-up conectado", "Prazos e tarefas ficam ligados ao lead para reduzir vendas esquecidas depois da primeira conversa."],
  [UserRoundCheck, "Handoff com contexto", "Quando uma pessoa assume, recebe histórico e dados comerciais já organizados."],
  [Route, "Fluxo comercial contínuo", "Inbox, CRM, automação e pipeline compartilham o mesmo contexto ao longo da venda."],
] as const;

export default function CrmParaWhatsappPage() {
  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto grid max-w-[1280px] gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">CRM para WhatsApp</p>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Transforme conversa no WhatsApp em processo de venda — sem copiar tudo para outro lugar.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">A ALTUM conecta WhatsApp, CRM, IA, pipeline e follow-up para que o atendimento continue até a próxima ação e o fechamento.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">Ver no meu processo <ArrowRight className="h-4 w-4" /></Link><Link href="/crm" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">Conhecer o CRM</Link></div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]"><Image src="/images/platform/marketing/platform-conversations.png" alt="WhatsApp conectado ao CRM da ALTUM" width={1586} height={992} priority sizes="(min-width:1280px) 58vw, 96vw" className="h-auto w-full rounded-[1.15rem]" /></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-[1180px] flex-wrap gap-3 text-sm text-white/58">{["WhatsApp", "Inbox", "CRM", "Pipeline", "IA", "Follow-up"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-32"><div className="mx-auto max-w-[1180px]"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Além da caixa de entrada</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">O problema não é só responder mensagens. É não perder o que acontece depois delas.</h2><p className="mt-6 text-lg leading-8 text-white/52">Quando WhatsApp e CRM trabalham separados, histórico, prioridade e próxima ação se perdem entre ferramentas. A ALTUM mantém a conversa dentro do processo comercial.</p></div><div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{benefits.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div></div></section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28"><div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Do WhatsApp ao pipeline</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">O atendimento vira dado comercial útil sem criar trabalho duplicado.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">Contexto, intenção, responsável e próxima ação podem acompanhar a oportunidade. Assim o CRM deixa de ser uma planilha que alguém precisa alimentar depois.</p><div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/pipeline" className="inline-flex items-center gap-2 text-[#c84500]">Ver pipeline <ArrowRight className="h-4 w-4" /></Link><Link href="/qualificacao-de-leads-com-ia" className="inline-flex items-center gap-2 text-[#c84500]">Ver qualificação com IA <ArrowRight className="h-4 w-4" /></Link></div></div><div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_rgba(20,20,20,0.08)]"><Image src="/images/platform/marketing/platform-crm-pipeline.png" alt="Pipeline conectado ao WhatsApp na ALTUM" width={1586} height={992} sizes="(min-width:1024px) 55vw, 96vw" className="h-auto w-full rounded-[1rem]" /></div></div></section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">WhatsApp + CRM de verdade</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como a ALTUM conecta atendimento e vendas no seu fluxo real.</h2><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>
    </SiteShell>
  );
}
