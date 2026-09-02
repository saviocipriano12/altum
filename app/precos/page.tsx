import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, HelpCircle, Sparkles } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { PricingPlans } from "@/components/public/pricing-plans";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Planos",
  description: "Planos da Altum para organizar conversas, CRM, agenda, campanhas e inteligência artificial em uma única operação comercial.",
  path: "/precos",
});

const included = [
  "Conversas e histórico comercial",
  "Clientes, oportunidades e pipeline",
  "Agenda, tarefas e follow-ups",
  "Produtos e serviços",
  "Relatórios da operação",
] as const;

const faq = [
  ["Posso começar sem implantação?", "Sim. A implantação é opcional, mas ajuda empresas que querem configurar canais, equipe, funil e IA com mais velocidade."],
  ["A IA está incluída em todos os planos?", "O nível de inteligência, automações e volume de uso varia conforme o plano e a configuração contratada."],
  ["Consigo conectar mais de um canal?", "Sim. A quantidade de canais, usuários e volume de operação depende da faixa contratada."],
  ["A Altum serve para minha forma de vender?", "A plataforma atende vendas consultivas, agendamentos, visitas, compras assistidas, checkout direto e produtos digitais."],
] as const;

export default function PrecosPage() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden px-5 pb-18 pt-24 text-center lg:px-8 lg:pb-24 lg:pt-32">
        <div className="absolute left-1/2 top-0 h-[28rem] w-[52rem] -translate-x-1/2 rounded-full bg-[#e85002]/14 blur-[140px]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">Planos Altum</p>
          <h1 className="mt-6 text-[clamp(3.3rem,7vw,6.8rem)] font-extrabold leading-[0.9] tracking-[-0.07em] text-white">Comece com estrutura. Evolua com a operação.</h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-white/52">Escolha o nível de operação, inteligência e acompanhamento que sua empresa precisa agora. A plataforma cresce com canais, equipe e volume.</p>
        </div>
      </section>

      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <PricingPlans />

        <div className="mx-auto mt-5 max-w-[1180px] rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-5 text-sm leading-6 text-white/42">O checkout mostra o valor mensal vigente antes da confirmacao. Limites de usuarios, canais, mensagens, IA e automacoes seguem o plano escolhido.</div>
      </section>

      <section className="border-y border-white/8 bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div><Sparkles className="h-7 w-7 text-[#e85002]" /><h2 className="mt-6 max-w-[11ch] text-[clamp(2.7rem,5vw,5rem)] font-extrabold leading-[0.94] tracking-[-0.06em]">A base comercial já começa conectada.</h2><p className="mt-6 text-lg leading-8 text-black/54">Todos os caminhos partem do mesmo princípio: menos informação espalhada e mais continuidade entre atendimento, venda e gestão.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{included.map((item) => <div key={item} className="flex min-h-24 items-start gap-3 rounded-2xl border border-black/10 bg-white p-5 font-bold leading-6"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#e85002]" />{item}</div>)}<div className="flex min-h-24 items-start gap-3 rounded-2xl bg-black p-5 font-bold leading-6 text-white"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#ff6a1f]" />IA e automações evoluem conforme o plano</div></div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="text-center"><HelpCircle className="mx-auto h-7 w-7 text-[#ff6a1f]" /><h2 className="mt-6 text-[clamp(2.5rem,5vw,4.5rem)] font-extrabold leading-[0.96] tracking-[-0.06em] text-white">Antes de decidir, tire as dúvidas certas.</h2></div>
          <div className="mt-12 space-y-3">{faq.map(([question, answer]) => <details key={question} className="group rounded-2xl border border-white/8 bg-[#0b0b0b] p-5"><summary className="cursor-pointer list-none text-lg font-bold text-white">{question}</summary><p className="mt-4 max-w-3xl leading-7 text-white/46">{answer}</p></details>)}</div>
          <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link href="/contato?interest=demonstracao" className="inline-flex items-center gap-2 rounded-xl bg-[#e85002] px-7 py-4 text-sm font-extrabold text-white">Conversar sobre meu cenário <ArrowRight className="h-4 w-4" /></Link><Link href="/implantacao" className="rounded-xl border border-white/12 px-7 py-4 text-sm font-extrabold text-white">Conhecer a implantação</Link></div>
        </div>
      </section>
    </SiteShell>
  );
}
