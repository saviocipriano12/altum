import type { Metadata } from "next";
import { Suspense } from "react";
import { Check, MessageCircleMore, Sparkles, Target } from "lucide-react";
import { CommercialContactForm } from "@/components/public/commercial-contact-form";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Fale com a Altum",
  description: "Agende uma demonstração da Altum e veja como conectar atendimento, vendas, agenda, campanhas, e-commerce e inteligência artificial na sua empresa.",
  path: "/contato",
});

export default function ContatoPage() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden px-5 pb-14 pt-24 lg:px-8 lg:pb-20 lg:pt-32">
        <div className="absolute left-1/2 top-0 h-[28rem] w-[52rem] -translate-x-1/2 rounded-full bg-[#e85002]/14 blur-[140px]" />
        <div className="relative mx-auto max-w-[1180px] text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">Fale com a Altum</p>
          <h1 className="mx-auto mt-6 max-w-[14ch] text-[clamp(3.3rem,7vw,6.8rem)] font-extrabold leading-[0.9] tracking-[-0.07em] text-white">Veja o que muda quando sua operação passa a trabalhar conectada.</h1>
          <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-white/52">Conte como sua empresa vende hoje. Mostramos onde a Altum entra, quais módulos fazem sentido e como seria o primeiro fluxo funcionando.</p>
          <div className="mx-auto mt-9 flex max-w-3xl flex-wrap justify-center gap-x-7 gap-y-3 text-sm font-bold text-white/46">{["Conversa com contexto", "Demonstração aplicada ao seu cenário", "Próximo passo sem pressão"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#e85002]" />{item}</span>)}</div>
        </div>
      </section>

      <section className="px-5 pb-12 lg:px-8 lg:pb-16"><div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-3"><MiniValue icon={MessageCircleMore} title="Entendemos a rotina" text="Canais, equipe, volume e como a venda acontece hoje." /><MiniValue icon={Target} title="Mostramos o fluxo" text="Produto, IA e integrações aplicados ao seu processo." /><MiniValue icon={Sparkles} title="Definimos a entrada" text="Plano, implantação e prioridades para começar bem." /></div></section>

      <Suspense fallback={<div className="min-h-[640px] bg-black" />}><CommercialContactForm /></Suspense>
    </SiteShell>
  );
}

function MiniValue({ icon: Icon, title, text }: { icon: typeof Target; title: string; text: string }) {
  return <article className="rounded-2xl border border-white/8 bg-[#0b0b0b] p-5 text-left"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h2 className="mt-4 font-bold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-white/42">{text}</p></article>;
}
