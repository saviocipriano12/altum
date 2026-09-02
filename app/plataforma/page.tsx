import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  FileText,
  Megaphone,
  MessageCircleMore,
  Mic2,
  PackageSearch,
  RefreshCcw,
  ShoppingBag,
  Target,
  UsersRound,
  Video,
  Workflow,
} from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Plataforma",
  description: "Conheça a Altum: conversas, CRM, agenda, campanhas, e-commerce, relatórios, automações e inteligência artificial conectados em uma única operação comercial.",
  path: "/plataforma",
});

const groups = [
  {
    eyebrow: "Atender e vender",
    title: "O trabalho comercial começa na conversa e continua até o fechamento.",
    description: "A equipe atende com contexto, transforma o contato em oportunidade e mantém proposta, agenda e próxima ação no mesmo histórico.",
    image: "/images/platform/marketing/platform-conversations.png",
    alt: "Conversas com contexto comercial na Altum",
    items: [
      [MessageCircleMore, "Conversas", "WhatsApp, Instagram e entradas do site em uma fila organizada."],
      [UsersRound, "Clientes", "Dados, histórico, notas, tarefas e relacionamento em um único perfil."],
      [Target, "Oportunidades", "Pipeline, valor, etapa, responsável e próximo passo."],
      [FileText, "Propostas e financeiro", "A negociação continua dentro do contexto da venda."],
    ],
  },
  {
    eyebrow: "IA aplicada",
    title: "Uma inteligência que trabalha na linha de frente e nos bastidores.",
    description: "A Altum pode atender, apoiar pessoas, analisar a operação, responder em voz e participar de reuniões sem esconder o controle do time.",
    image: "/images/platform/marketing/platform-ai-assistant.png",
    alt: "Assistente Altum analisando a operação",
    items: [
      [Bot, "Assistente Altum", "Respostas, resumos, prioridade e próxima melhor ação."],
      [Workflow, "Automações", "Gatilhos, retomadas e ações comerciais executadas continuamente."],
      [Mic2, "Voz no WhatsApp", "Respostas em áudio quando esse formato ajuda a venda."],
      [Video, "Reuniões assistidas", "Contexto, apoio ao vivo e resumo comercial depois da conversa."],
    ],
  },
  {
    eyebrow: "Crescimento conectado",
    title: "A Altum liga aquisição, venda, entrega e recompra.",
    description: "Campanhas e e-commerce deixam de ser dados paralelos. A operação enxerga origem, custo, pedido, receita e próximas oportunidades.",
    image: "/images/platform/marketing/platform-dashboard.png",
    alt: "Visão de crescimento e receita na Altum",
    items: [
      [Megaphone, "Campanhas e captação", "Meta, Google, UTMs, formulários, públicos e disparos."],
      [ShoppingBag, "Commerce", "Produtos, pedidos, estoque, carrinho, rastreio e atendimento."],
      [RefreshCcw, "Retenção", "Pós-venda, recompra, reativação e upsell com contexto."],
      [BarChart3, "Relatórios", "Conversão, receita, equipe, canais e campanhas na mesma leitura."],
    ],
  },
] as const;

const operationModes = [
  { title: "Equipe no controle", text: "A IA apenas apoia, resume e recomenda enquanto pessoas conduzem o atendimento." },
  { title: "IA assistida", text: "A IA responde e trabalha até o momento em que uma pessoa precisa assumir." },
  { title: "IA primeiro", text: "A IA conduz a maior parte do fluxo com regras claras de escalada e supervisão." },
] as const;

export default function PlataformaPage() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="absolute left-1/2 top-0 h-[34rem] w-[58rem] -translate-x-1/2 rounded-full bg-[#e85002]/14 blur-[150px]" />
        <div className="relative mx-auto max-w-[1280px] text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">Altum Plataforma</p>
          <h1 className="mx-auto mt-6 max-w-[15ch] text-[clamp(3.3rem,7vw,7rem)] font-extrabold leading-[0.9] tracking-[-0.07em] text-white">
            O sistema que faz sua operação comercial
            <span className="block bg-gradient-to-r from-[#ffb54a] via-[#ff5a0a] to-[#d90c3a] bg-clip-text text-transparent">entender, agir e evoluir.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-white/54">Conversas, clientes, agenda, campanhas, pedidos, receita e IA compartilham o mesmo contexto. Sua equipe para de reconstruir informação e começa a operar.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e85002] px-7 py-4 text-sm font-extrabold text-white transition hover:bg-[#ff5c0b]">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/precos" className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.035] px-7 py-4 text-sm font-extrabold text-white transition hover:bg-white/[0.07]">Ver planos</Link>
          </div>

          <div className="relative mx-auto mt-16 max-w-[1120px]">
            <div className="absolute -inset-8 rounded-full bg-[#e85002]/13 blur-[100px]" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b] p-3 shadow-[0_40px_110px_rgba(0,0,0,0.7)]"><Image src="/images/platform/marketing/platform-hero-ecosystem.png" alt="Ecossistema da plataforma Altum" width={1586} height={992} priority sizes="(min-width: 1280px) 1120px, 96vw" className="h-auto w-full rounded-[1.35rem]" /></div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-7 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-bold text-white/42">
          {["Conversas", "CRM", "Agenda", "Campanhas", "Commerce", "Relatórios", "IA"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#e85002]" />{item}</span>)}
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1280px] space-y-28">
          {groups.map((group, index) => (
            <article key={group.eyebrow} className="grid gap-12 xl:grid-cols-[0.8fr_1.2fr] xl:items-center">
              <div className={index % 2 ? "xl:order-2" : ""}>
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">{group.eyebrow}</p>
                <h2 className="mt-5 max-w-[12ch] text-[clamp(2.7rem,5vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.06em] text-white">{group.title}</h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-white/48">{group.description}</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {group.items.map(([Icon, title, text]) => <div key={title} className="rounded-2xl border border-white/8 bg-[#0b0b0b] p-5"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-4 font-bold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-white/42">{text}</p></div>)}
                </div>
              </div>
              <div className={`relative ${index % 2 ? "xl:order-1" : ""}`}><div className="absolute -inset-8 rounded-full bg-[#e85002]/10 blur-[90px]" /><div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b] p-3 shadow-[0_35px_90px_rgba(0,0,0,0.62)]"><Image src={group.image} alt={group.alt} width={1586} height={992} sizes="(min-width: 1280px) 60vw, 96vw" className="h-auto w-full rounded-[1.35rem]" /></div></div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#e85002]">Seu modelo de operação</p><h2 className="mt-5 max-w-[11ch] text-[clamp(3rem,6vw,6rem)] font-extrabold leading-[0.9] tracking-[-0.07em]">A IA trabalha no nível que sua empresa escolher.</h2></div><p className="max-w-2xl text-lg leading-8 text-black/54">A Altum respeita o processo comercial, o risco e a maturidade de cada negócio. Você decide quanto automatizar e onde o julgamento humano é obrigatório.</p></div>
          <div className="mt-14 grid gap-4 lg:grid-cols-3">{operationModes.map((mode, index) => <article key={mode.title} className="rounded-[1.7rem] border border-black/10 bg-white p-7 shadow-[0_18px_50px_rgba(20,20,20,0.06)]"><span className="text-xs font-extrabold tracking-[0.18em] text-[#e85002]">0{index + 1}</span><h3 className="mt-6 text-2xl font-extrabold tracking-[-0.04em]">{mode.title}</h3><p className="mt-4 leading-7 text-black/52">{mode.text}</p></article>)}</div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px] overflow-hidden rounded-[2.2rem] bg-[#e85002] p-8 md:p-12"><div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><PackageSearch className="h-7 w-7 text-white" /><h2 className="mt-7 max-w-[13ch] text-[clamp(2.7rem,5vw,5rem)] font-extrabold leading-[0.94] tracking-[-0.06em] text-white">Sua empresa não precisa se adaptar a um CRM genérico.</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">A Altum é configurada para a forma como você vende: proposta, agendamento, visita, compra assistida, checkout ou entrega digital.</p></div><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-7 py-4 text-sm font-extrabold text-white">Ver no meu cenário <ArrowRight className="h-4 w-4" /></Link></div></div>
      </section>
    </SiteShell>
  );
}
