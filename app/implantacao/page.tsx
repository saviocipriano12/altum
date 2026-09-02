import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Check, CircleCheck, PlugZap, Rocket, Settings2, UsersRound } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Implantação",
  description: "Implantação assistida da Altum para configurar equipe, canais, funil, catálogo, automações e inteligência artificial com segurança.",
  path: "/implantacao",
});

const phases = [
  { icon: Settings2, number: "01", title: "Entendemos como sua empresa vende", text: "Mapeamos oferta, público, ciclo, canais, etapas e responsabilidades sem impor um processo genérico." },
  { icon: PlugZap, number: "02", title: "Conectamos a operação", text: "Equipe, permissões, WhatsApp, Instagram, campanhas, catálogo e integrações entram no lugar certo." },
  { icon: Bot, number: "03", title: "Ensinamos a Altum", text: "Base de conhecimento, tom de voz, regras comerciais, limites e escaladas transformam IA em contexto útil." },
  { icon: Rocket, number: "04", title: "Entramos em produção juntos", text: "Validamos conversas, funil, agenda, automações e primeiros sinais antes de ampliar o uso." },
] as const;

const deliverables = [
  "Estrutura inicial de usuários e permissões",
  "Pipeline alinhado ao processo comercial",
  "Canais e integrações contratadas",
  "Catálogo de produtos ou serviços",
  "Base inicial de conhecimento da IA",
  "Regras de atendimento e escalada",
  "Agenda, tarefas e cadências comerciais",
  "Treinamento do time e go-live assistido",
] as const;

export default function ImplantacaoPage() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="absolute -right-32 top-0 h-[32rem] w-[32rem] rounded-full bg-[#e85002]/15 blur-[140px]" />
        <div className="relative mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">Implantação Altum</p><h1 className="mt-6 max-w-[12ch] text-[clamp(3.3rem,6.5vw,6.6rem)] font-extrabold leading-[0.9] tracking-[-0.07em] text-white">Não entregamos um login. Colocamos a operação para funcionar.</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-white/52">A implantação transforma a forma como sua empresa vende em uma configuração real de equipe, canais, funil, automações e IA.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/contato?interest=implantacao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e85002] px-7 py-4 text-sm font-extrabold text-white">Planejar minha implantação <ArrowRight className="h-4 w-4" /></Link><Link href="/plataforma" className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.035] px-7 py-4 text-sm font-extrabold text-white">Rever a plataforma</Link></div></div>
          <div className="rounded-[2rem] border border-white/9 bg-[#0b0b0b] p-6 md:p-8"><div className="flex items-center gap-3"><UsersRound className="h-6 w-6 text-[#ff6a1f]" /><div><p className="text-sm font-bold text-white">Entrada assistida</p><p className="text-xs text-white/34">Configuração, validação e go-live</p></div></div><div className="mt-7 grid gap-3 sm:grid-cols-2">{deliverables.map((item) => <div key={item} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/62"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#e85002]" />{item}</div>)}</div></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1280px]"><div className="max-w-4xl"><p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#e85002]">Como funciona</p><h2 className="mt-5 text-[clamp(3rem,6vw,6rem)] font-extrabold leading-[0.9] tracking-[-0.07em]">Da primeira configuração ao primeiro dia de operação.</h2></div><div className="relative mt-16 grid gap-4 lg:grid-cols-4"><div className="absolute left-[12%] right-[12%] top-12 hidden h-px bg-[#e85002]/25 lg:block" />{phases.map((phase) => <article key={phase.number} className="relative rounded-[1.7rem] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(20,20,20,0.06)]"><div className="flex items-center justify-between"><span className="relative z-10 grid h-12 w-12 place-items-center rounded-xl bg-black text-[#ff681e]"><phase.icon className="h-5 w-5" /></span><span className="text-xs font-extrabold tracking-[0.18em] text-black/20">{phase.number}</span></div><h3 className="mt-7 text-2xl font-extrabold leading-tight tracking-[-0.04em]">{phase.title}</h3><p className="mt-4 text-sm leading-7 text-black/52">{phase.text}</p></article>)}</div></div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32"><div className="mx-auto grid max-w-[1180px] gap-10 rounded-[2rem] border border-white/9 bg-[#0b0b0b] p-7 md:p-10 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff6a1f]">Implantação sem dependência</p><h2 className="mt-5 max-w-[12ch] text-[clamp(2.7rem,5vw,4.8rem)] font-extrabold leading-[0.95] tracking-[-0.06em] text-white">Seu time aprende a operar. A Altum continua evoluindo.</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-white/48">A configuração inicial reduz risco e acelera valor, mas a rotina fica clara para o cliente continuar trabalhando com autonomia.</p><div className="mt-7 flex flex-wrap gap-4 text-sm font-bold text-white/58">{["Treinamento prático", "Go-live validado", "Próximas etapas claras"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#e85002]" />{item}</span>)}</div></div><Link href="/contato?interest=implantacao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e85002] px-7 py-4 text-sm font-extrabold text-white">Falar sobre implantação <ArrowRight className="h-4 w-4" /></Link></div></section>
    </SiteShell>
  );
}
