import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, History, MessageCircleMore, Route, Tags, UserRoundCheck } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Inbox Unificada para WhatsApp, Instagram e Vendas",
  description: "Centralize conversas de WhatsApp, Instagram e equipe em uma inbox comercial conectada ao CRM, IA, responsáveis e histórico do cliente.",
  path: "/inbox",
});

const features = [
  [MessageCircleMore, "Conversas em uma fila comercial", "Canais e atendimentos deixam de ficar espalhados entre celulares, abas e pessoas."],
  [History, "Histórico preservado", "A equipe enxerga o que já aconteceu com o cliente antes de responder ou assumir a conversa."],
  [UserRoundCheck, "Responsável claro", "Cada conversa pode ter dono, prioridade e transferência sem perder contexto."],
  [Bot, "IA junto da equipe", "A IA pode responder, resumir, sugerir ações e escalar para uma pessoa quando necessário."],
  [Tags, "Origem e contexto", "Canal, tags, origem e dados comerciais ajudam a entender por que aquele contato chegou."],
  [Route, "Da mensagem ao CRM", "A conversa pode alimentar lead, oportunidade, tarefa, follow-up e próxima ação no mesmo fluxo."],
] as const;

export default function InboxPage() {
  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto grid max-w-[1280px] gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Inbox unificada</p>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">
              Todas as conversas em uma fila que sabe o que precisa acontecer depois.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">
              WhatsApp, Instagram, equipe e IA compartilham histórico, responsável, prioridade e contexto comercial — sem transformar atendimento em uma coleção de abas.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">Ver a inbox em ação <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/crm" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">Conhecer o CRM</Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
            <Image src="/images/platform/marketing/platform-conversations.png" alt="Inbox unificada da ALTUM com conversas e contexto comercial" width={1586} height={992} priority sizes="(min-width:1280px) 58vw, 96vw" className="h-auto w-full rounded-[1.15rem]" />
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-3 text-sm text-white/58">
          {["WhatsApp", "Instagram", "IA", "Equipe", "CRM", "Follow-up"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Atendimento com continuidade</p>
            <h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">Responder rápido ajuda. Saber o que fazer depois vende mais.</h2>
            <p className="mt-6 text-lg leading-8 text-white/52">A inbox da ALTUM não termina na mensagem respondida. Ela conecta atendimento ao cliente, oportunidade, responsável, prioridade e próxima ação.</p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map(([Icon, title, text]) => (
              <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6">
                <Icon className="h-5 w-5 text-[#ff6a1f]" />
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/48">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Inbox + IA + CRM</p>
            <h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">A conversa vira contexto comercial sem copiar tudo à mão.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-black/56">A IA pode identificar intenção, resumir, extrair sinais e ajudar a encaminhar o próximo passo. O CRM mantém esse contexto vivo quando a venda sai da conversa e entra no pipeline.</p>
            <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold">
              <Link href="/ia-para-vendas" className="inline-flex items-center gap-2 text-[#c84500]">Ver IA para vendas <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/crm" className="inline-flex items-center gap-2 text-[#c84500]">Ver CRM <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_rgba(20,20,20,0.08)]">
            <Image src="/images/platform/marketing/platform-crm-pipeline.png" alt="Pipeline comercial conectado à inbox da ALTUM" width={1586} height={992} sizes="(min-width:1024px) 55vw, 96vw" className="h-auto w-full rounded-[1rem]" />
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Centralize sem perder contexto</p>
          <h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como sua operação pode atender, qualificar e continuar a venda no mesmo sistema.</h2>
          <Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </SiteShell>
  );
}
