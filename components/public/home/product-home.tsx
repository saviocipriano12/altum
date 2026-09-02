import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  DatabaseZap,
  Gauge,
  Headphones,
  Menu,
  MessageCircleMore,
  Megaphone,
  Mic2,
  MessagesSquare,
  MousePointerClick,
  PackageSearch,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Video,
  Workflow,
  Zap,
} from "lucide-react";
import {
  SiGoogleads,
  SiInstagram,
  SiMeta,
  SiShopify,
  SiStripe,
  SiWhatsapp,
  SiWoocommerce,
} from "react-icons/si";

import { AltumLiveDemo } from "@/components/public/home/altum-live-demo";

const productImages = {
  hero: "/images/platform/marketing/platform-hero-ecosystem.png",
  dashboard: "/images/platform/marketing/platform-dashboard.png",
  conversations: "/images/platform/marketing/platform-conversations.png",
  crm: "/images/platform/marketing/platform-crm-pipeline.png",
  ai: "/images/platform/marketing/platform-ai-assistant.png",
} as const;

const navItems = [
  { label: "Produto", href: "#produto" },
  { label: "IA e automação", href: "#ia" },
  { label: "Integrações", href: "#integracoes" },
  { label: "Planos", href: "/precos" },
] as const;

const productPillars = [
  {
    number: "01",
    icon: MessagesSquare,
    title: "Todas as conversas. Uma fila que vende.",
    description:
      "WhatsApp, Instagram e entradas do site chegam com histórico, origem, responsável e prioridade comercial.",
    bullets: ["Atendimento humano + IA", "Notas e contexto", "Transferência sem perder histórico"],
    image: productImages.conversations,
    alt: "Central de conversas da Altum",
  },
  {
    number: "02",
    icon: Target,
    title: "O CRM nasce da conversa — não de trabalho duplicado.",
    description:
      "Cada contato pode virar oportunidade com etapa, valor, proposta, tarefas e próxima ação no mesmo fluxo.",
    bullets: ["Pipeline visual", "Propostas e financeiro", "Distribuição por responsável"],
    image: productImages.crm,
    alt: "CRM e pipeline comercial da Altum",
  },
] as const;

const capabilities = [
  { icon: MessageCircleMore, title: "Inbox unificada", text: "Canais, equipe e IA na mesma operação." },
  { icon: UsersRound, title: "Clientes e oportunidades", text: "Histórico comercial vivo por contato." },
  { icon: CalendarClock, title: "Agenda e follow-up", text: "Próxima ação com dono e prazo claro." },
  { icon: Send, title: "Campanhas", text: "Segmentação, disparos e reativação." },
  { icon: PackageSearch, title: "Produtos e serviços", text: "Catálogo para atendimento, IA e propostas." },
  { icon: BarChart3, title: "Relatórios", text: "Funil, atendimento, mídia e resultado." },
  { icon: Bot, title: "Assistente Altum", text: "Contexto, prioridade e ação recomendada." },
  { icon: Workflow, title: "Automações", text: "Fluxos que continuam trabalhando 24/7." },
  { icon: Gauge, title: "Gestão da operação", text: "Visão clara para decidir antes do gargalo." },
] as const;

const integrationItems = [
  { name: "WhatsApp", icon: SiWhatsapp, color: "#25D366", status: "Canais" },
  { name: "Instagram", icon: SiInstagram, color: "#E4405F", status: "Canais" },
  { name: "Meta", icon: SiMeta, color: "#0668E1", status: "Campanhas" },
  { name: "Google Ads", icon: SiGoogleads, color: "#4285F4", status: "Campanhas" },
  { name: "Shopify", icon: SiShopify, color: "#7AB55C", status: "E-commerce" },
  { name: "WooCommerce", icon: SiWoocommerce, color: "#96588A", status: "E-commerce" },
  { name: "Stripe", icon: SiStripe, color: "#635BFF", status: "Pagamentos" },
] as const;

const automationSteps = [
  { icon: MousePointerClick, label: "Lead entra", detail: "Canal e origem identificados" },
  { icon: Bot, label: "IA entende", detail: "Intenção, contexto e prioridade" },
  { icon: DatabaseZap, label: "Altum organiza", detail: "Cliente, oportunidade e agenda" },
  { icon: Headphones, label: "Time assume", detail: "No momento certo, com contexto" },
] as const;

export function ProductHome() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-black text-[#f9f9f9]">
      <HomeStyles />
      <Header />

      <section className="relative overflow-hidden px-5 pb-16 pt-32 lg:px-8 lg:pb-24 lg:pt-40">
        <div className="altum-grid absolute inset-0" />
        <div className="absolute left-1/2 top-8 h-[34rem] w-[58rem] -translate-x-1/2 rounded-full bg-[#e85002]/15 blur-[150px]" />

        <div className="relative mx-auto max-w-[1280px] text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#e85002]/30 bg-[#e85002]/10 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#ff7a32]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e85002] shadow-[0_0_18px_#e85002]" />
            O sistema comercial da sua empresa
          </div>

          <h1 className="mx-auto mt-7 max-w-[15ch] text-[clamp(3.4rem,8vw,7.8rem)] font-extrabold leading-[0.88] tracking-[-0.075em] text-white">
            Pare de perder vendas entre
            <span className="altum-gradient-text block">mensagens e planilhas.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-[760px] text-base leading-8 text-white/62 md:text-xl md:leading-9">
            A Altum transforma conversas em oportunidades, oportunidades em próximas ações e dados em decisões — com CRM, automação e IA trabalhando no mesmo sistema.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/contato?interest=demonstracao" className="altum-primary-cta">
              Agendar demonstração <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/plataforma" className="altum-secondary-cta">
              Explorar o produto
            </Link>
          </div>

          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm font-semibold text-white/46">
            {["Sem operação fragmentada", "IA com humano no controle", "Do lead ao fechamento"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-[#e85002]" />
                {item}
              </span>
            ))}
          </div>

          <div className="relative mx-auto mt-16 max-w-[1180px] lg:mt-20">
            <div className="absolute -inset-x-10 inset-y-16 rounded-full bg-[#e85002]/20 blur-[100px]" />
            <div className="relative rounded-[2rem] border border-white/12 bg-[#111111] p-2.5 shadow-[0_45px_120px_rgba(0,0,0,0.72)] md:p-4">
              <div className="flex items-center justify-between border-b border-white/8 px-3 pb-3 md:px-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#e85002]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/16" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/16" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/28">Operação ao vivo</span>
                <span className="w-12" />
              </div>
              <Image
                src={productImages.hero}
                alt="Ecossistema da plataforma Altum"
                width={1586}
                height={992}
                priority
                sizes="(min-width: 1280px) 1180px, 96vw"
                className="mt-3 h-auto w-full rounded-[1.3rem]"
              />
            </div>

            <div className="absolute -bottom-7 left-4 hidden rounded-2xl border border-white/10 bg-[#101010]/94 p-4 text-left shadow-2xl backdrop-blur-xl md:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/36">IA encontrou</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles className="h-4 w-4 text-[#ff6a1f]" /> 3 oportunidades pedem ação
              </p>
            </div>

            <div className="absolute -right-3 -top-7 hidden rounded-2xl border border-white/10 bg-[#101010]/94 p-4 text-left shadow-2xl backdrop-blur-xl lg:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/36">Hoje</p>
              <p className="mt-2 text-sm font-bold text-white">17 follow-ups no fluxo</p>
            </div>
          </div>
        </div>
      </section>

      <IntegrationMarquee />
      <AltumLiveDemo />

      <section id="produto" className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading
            eyebrow="O que é a Altum"
            title="Um sistema comercial inteiro. IA em cada etapa."
            description="A Altum não é mais uma caixa de entrada e não é só um CRM. É a camada que conecta atendimento, vendas, operação e inteligência para o trabalho continuar sem depender de improviso."
          />

          <div className="mt-16 space-y-20 lg:mt-24 lg:space-y-32">
            {productPillars.map((pillar, index) => (
              <ProductFeature key={pillar.number} {...pillar} reverse={index % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      <RevenueLoop />

      <section id="ia" className="relative overflow-hidden border-y border-white/8 bg-[#0b0b0b] px-5 py-24 lg:px-8 lg:py-32">
        <div className="absolute -right-40 top-10 h-[32rem] w-[32rem] rounded-full bg-[#d90c3a]/12 blur-[130px]" />
        <div className="relative mx-auto max-w-[1280px]">
          <div className="grid gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e85002]/25 bg-[#e85002]/8 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#ff7a32]">
                <Bot className="h-4 w-4" /> Assistente Altum
              </div>
              <h2 className="mt-7 max-w-[11ch] text-[clamp(2.8rem,5.8vw,5.8rem)] font-extrabold leading-[0.95] tracking-[-0.065em] text-white">
                A IA não observa o comercial.
                <span className="altum-gradient-text block">Ela faz o comercial avançar.</span>
              </h2>
              <p className="mt-7 max-w-[620px] text-lg leading-8 text-white/58">
                Ela entende a conversa, consulta o conhecimento da empresa, qualifica a oportunidade, sugere respostas, registra contexto e indica o melhor próximo passo.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {["Resposta com contexto", "Resumo automático", "Sinal de intenção", "Escalada para humano"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm font-semibold text-white/72">
                    <Check className="h-4 w-4 text-[#e85002]" /> {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-8 rounded-full bg-[#e85002]/10 blur-[90px]" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black p-3 shadow-[0_35px_90px_rgba(0,0,0,0.65)]">
                <Image
                  src={productImages.ai}
                  alt="Assistente Altum analisando a operação comercial"
                  width={1586}
                  height={992}
                  sizes="(min-width: 1280px) 58vw, 96vw"
                  className="h-auto w-full rounded-[1.35rem]"
                />
              </div>
            </div>
          </div>

          <div className="mt-20 rounded-[2rem] border border-white/9 bg-black/60 p-5 md:p-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff6a1f]">Automação em ação</p>
                <h3 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-white md:text-4xl">Um lead entra. A operação inteira reage.</h3>
              </div>
              <span className="text-sm font-semibold text-white/38">Sem copiar dados. Sem perder contexto.</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-4">
              {automationSteps.map((step, index) => (
                <div key={step.label} className="relative rounded-2xl border border-white/8 bg-white/[0.025] p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e85002]/12 text-[#ff6a1f]"><step.icon className="h-5 w-5" /></span>
                    <span className="text-[10px] font-extrabold tracking-[0.18em] text-white/24">0{index + 1}</span>
                  </div>
                  <p className="mt-5 font-bold text-white">{step.label}</p>
                  <p className="mt-2 text-sm leading-6 text-white/44">{step.detail}</p>
                  {index < automationSteps.length - 1 ? <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-[#e85002] lg:block" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading
            eyebrow="Mais do que atendimento"
            title="Tudo que seu comercial precisa para operar com força."
            description="Cada módulo existe para responder uma pergunta prática: quem precisa de atenção, onde está a venda e qual ação gera avanço agora."
          />
          <div className="mt-14 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item, index) => (
              <article key={item.title} className="group min-h-52 rounded-[1.6rem] border border-white/8 bg-[#0b0b0b] p-6 transition duration-300 hover:border-[#e85002]/35 hover:bg-[#101010]">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-[#ff6a1f] transition group-hover:bg-[#e85002]/12"><item.icon className="h-5 w-5" /></span>
                  <span className="text-[10px] font-extrabold tracking-[0.18em] text-white/18">0{index + 1}</span>
                </div>
                <h3 className="mt-7 text-xl font-bold tracking-[-0.03em] text-white">{item.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-white/44">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="integracoes" className="border-y border-white/8 bg-[#0b0b0b] px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff6a1f]">Ecossistema conectado</p>
              <h2 className="mt-5 max-w-[11ch] text-[clamp(2.8rem,5.4vw,5.4rem)] font-extrabold leading-[0.95] tracking-[-0.06em] text-white">
                A Altum conecta onde sua venda já acontece.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-white/52 lg:justify-self-end">
              Canais, mídia, e-commerce e pagamentos deixam de ser ilhas. A Altum reúne sinais dessas plataformas para dar contexto ao atendimento, ao funil e à IA.
            </p>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {integrationItems.map((item) => (
              <div key={item.name} className="flex min-h-32 items-center gap-4 rounded-2xl border border-white/8 bg-black p-5 transition hover:border-white/16">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/[0.04]" style={{ color: item.color }}>
                  <item.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-bold text-white">{item.name}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">{item.status}</p>
                </div>
              </div>
            ))}
            <div className="flex min-h-32 items-center gap-4 rounded-2xl border border-dashed border-[#e85002]/30 bg-[#e85002]/5 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e85002]/10 text-[#ff6a1f]"><Zap className="h-6 w-6" /></span>
              <div><p className="font-bold text-white">Novas conexões</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6a1f]/70">Em expansão</p></div>
            </div>
          </div>

          <p className="mt-5 text-xs leading-5 text-white/28">A disponibilidade de cada integração pode variar conforme plano, provedor e etapa de implantação.</p>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto grid max-w-[1280px] gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/9 bg-[#0b0b0b] p-7 md:p-10">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#e85002]/14 blur-[90px]" />
            <div className="relative">
              <BadgeCheck className="h-8 w-8 text-[#ff6a1f]" />
              <h2 className="mt-8 max-w-[12ch] text-[clamp(2.5rem,4.7vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.06em] text-white">
                Tecnologia forte. Operação simples.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/52">
                A complexidade fica nos bastidores. Sua equipe vê conversas, clientes, próximos passos e resultados — não filas técnicas, providers ou logs.
              </p>
            </div>
          </div>
          <div className="grid gap-5">
            <ValueCard icon={ShieldCheck} title="Humano no controle" text="A IA escala conversas e preserva o contexto quando uma pessoa precisa assumir." />
            <ValueCard icon={DatabaseZap} title="Dados que continuam juntos" text="Canal, cliente, oportunidade, tarefa e resultado compartilham o mesmo histórico." />
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[2.4rem] bg-[#e85002] px-7 py-14 text-white shadow-[0_35px_100px_rgba(232,80,2,0.25)] md:px-12 md:py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(255,190,85,0.48),transparent_28%),radial-gradient(circle_at_15%_100%,rgba(217,12,58,0.42),transparent_32%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-white/70">Seu comercial pode operar melhor</p>
              <h2 className="mt-5 max-w-[13ch] text-[clamp(3rem,6vw,6rem)] font-extrabold leading-[0.9] tracking-[-0.07em]">
                Quantas vendas sua empresa perde por falta de continuidade?
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">Veja como a Altum conecta sua rotina comercial e transforma cada conversa em uma operação que avança.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-7 py-4 text-sm font-extrabold text-white transition hover:bg-[#151515]">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/plataforma" className="inline-flex items-center justify-center rounded-xl border border-white/28 bg-white/10 px-7 py-4 text-sm font-extrabold text-white transition hover:bg-white/16">Explorar o produto</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between rounded-2xl border border-white/10 bg-black/82 px-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:px-5">
        <Link href="/" className="flex items-center gap-3" aria-label="Altum — página inicial">
          <Image src="/logo-a.png" alt="Logo Altum" width={44} height={44} priority className="h-11 w-11 rounded-xl" />
          <span>
            <span className="block text-sm font-extrabold tracking-[0.2em] text-white">ALTUM</span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36 sm:block">Operação comercial com IA</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-4 py-2 text-sm font-semibold text-white/52 transition hover:bg-white/5 hover:text-white">{item.label}</Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/cliente/login" className="rounded-lg px-4 py-2.5 text-sm font-bold text-white/68 transition hover:text-white">Entrar</Link>
          <Link href="/contato?interest=demonstracao" className="inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#ff5c0b]">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
        </div>

        <details className="relative md:hidden">
          <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-white/10 text-white" aria-label="Abrir menu"><Menu className="h-5 w-5" /></summary>
          <div className="absolute right-0 top-13 w-72 rounded-2xl border border-white/10 bg-[#0b0b0b] p-3 shadow-2xl">
            {navItems.map((item) => <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-3 text-sm font-semibold text-white/62 hover:bg-white/5 hover:text-white">{item.label}</Link>)}
            <Link href="/contato?interest=demonstracao" className="mt-2 flex items-center justify-between rounded-lg bg-[#e85002] px-4 py-3 text-sm font-bold text-white">Agendar demonstração <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </details>
      </div>
    </header>
  );
}

function IntegrationMarquee() {
  const items = [...integrationItems, ...integrationItems];
  return (
    <section className="border-y border-white/8 bg-[#080808] py-6" aria-label="Integrações disponíveis">
      <p className="mb-5 text-center text-[10px] font-extrabold uppercase tracking-[0.24em] text-white/28">Conecte a Altum às plataformas que movem sua operação</p>
      <div className="overflow-hidden">
        <div className="altum-marquee flex w-max items-center">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="mx-4 flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-5 py-3 text-white/66">
              <item.icon className="h-5 w-5" style={{ color: item.color }} aria-hidden="true" />
              <span className="text-sm font-bold">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">{eyebrow}</p>
      <h2 className="mt-5 text-[clamp(2.8rem,5.8vw,5.8rem)] font-extrabold leading-[0.94] tracking-[-0.065em] text-white">{title}</h2>
      <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/48">{description}</p>
    </div>
  );
}

function ProductFeature({ number, icon: Icon, title, description, bullets, image, alt, reverse }: (typeof productPillars)[number] & { reverse: boolean }) {
  return (
    <article className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
      <div className={reverse ? "lg:order-2" : ""}>
        <div className="flex items-center gap-4"><span className="text-xs font-extrabold tracking-[0.2em] text-[#e85002]">{number}</span><span className="grid h-11 w-11 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-[#ff6a1f]"><Icon className="h-5 w-5" /></span></div>
        <h3 className="mt-7 max-w-[12ch] text-[clamp(2.4rem,4.6vw,4.6rem)] font-extrabold leading-[0.96] tracking-[-0.06em] text-white">{title}</h3>
        <p className="mt-6 max-w-xl text-lg leading-8 text-white/50">{description}</p>
        <div className="mt-7 space-y-3">{bullets.map((bullet) => <div key={bullet} className="flex items-center gap-3 text-sm font-semibold text-white/68"><CircleCheck className="h-4 w-4 shrink-0 text-[#e85002]" />{bullet}</div>)}</div>
      </div>
      <div className={`relative ${reverse ? "lg:order-1" : ""}`}>
        <div className="absolute -inset-7 rounded-full bg-[#e85002]/10 blur-[90px]" />
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b] p-3 shadow-[0_35px_90px_rgba(0,0,0,0.6)]"><Image src={image} alt={alt} width={1586} height={992} sizes="(min-width: 1024px) 60vw, 96vw" className="h-auto w-full rounded-[1.35rem]" /></div>
      </div>
    </article>
  );
}

function ValueCard({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <article className="rounded-[1.7rem] border border-white/9 bg-[#0b0b0b] p-7"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e85002]/10 text-[#ff6a1f]"><Icon className="h-5 w-5" /></span><h3 className="mt-6 text-xl font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-7 text-white/46">{text}</p></article>;
}

function RevenueLoop() {
  const stages = [
    {
      number: "01",
      icon: Megaphone,
      label: "Atrair",
      title: "Campanhas que chegam com origem.",
      text: "Meta, Google, formulários e UTMs entram ligados ao contato e ao resultado comercial.",
      items: ["Mídia e captação", "Origem do lead", "Conversão por campanha"],
    },
    {
      number: "02",
      icon: MessageCircleMore,
      label: "Atender",
      title: "Conversas que já chegam com contexto.",
      text: "WhatsApp, Instagram, IA e equipe trabalham sobre o mesmo histórico do cliente.",
      items: ["Inbox unificada", "Qualificação com IA", "Handoff para humano"],
    },
    {
      number: "03",
      icon: Target,
      label: "Vender",
      title: "Oportunidades que não param no cadastro.",
      text: "Pipeline, agenda, reuniões, propostas e financeiro mantêm a venda em movimento.",
      items: ["CRM e funil", "Propostas", "Próxima ação"],
    },
    {
      number: "04",
      icon: RefreshCcw,
      label: "Crescer",
      title: "A venda alimenta a próxima venda.",
      text: "Pedidos, recompra, upsell, campanhas e relatórios fecham o ciclo de receita.",
      items: ["E-commerce", "Reativação", "Receita e retenção"],
    },
  ] as const;

  return (
    <section className="border-y border-white/8 bg-[#f3f1ec] px-5 py-24 text-[#111111] lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#e85002]">A vantagem Altum</p>
            <h2 className="mt-5 max-w-[10ch] text-[clamp(3rem,6vw,6.2rem)] font-extrabold leading-[0.9] tracking-[-0.07em]">
              A conversa é só o começo.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-black/54 lg:justify-self-end">
            A Altum acompanha o caminho completo da receita. Ela ajuda a atrair, atender, vender, acompanhar e trazer o cliente de volta — com os dados da operação conectados.
          </p>
        </div>

        <div className="relative mt-16 grid gap-4 lg:grid-cols-4">
          <div className="absolute left-[12.5%] right-[12.5%] top-12 hidden h-px bg-gradient-to-r from-transparent via-[#e85002]/40 to-transparent lg:block" />
          {stages.map((stage) => (
            <article key={stage.number} className="relative rounded-[1.7rem] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(20,20,20,0.06)]">
              <div className="flex items-center justify-between">
                <span className="relative z-10 grid h-12 w-12 place-items-center rounded-xl bg-black text-[#ff681e]"><stage.icon className="h-5 w-5" /></span>
                <span className="text-xs font-extrabold tracking-[0.18em] text-black/20">{stage.number}</span>
              </div>
              <p className="mt-7 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#e85002]">{stage.label}</p>
              <h3 className="mt-3 text-2xl font-extrabold leading-tight tracking-[-0.04em]">{stage.title}</h3>
              <p className="mt-4 text-sm leading-7 text-black/52">{stage.text}</p>
              <div className="mt-6 space-y-3 border-t border-black/8 pt-5">
                {stage.items.map((item) => <div key={item} className="flex items-center gap-2 text-xs font-bold text-black/58"><Check className="h-3.5 w-3.5 text-[#e85002]" />{item}</div>)}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-black p-6 text-white"><Mic2 className="h-5 w-5 text-[#ff681e]" /><h3 className="mt-5 text-xl font-bold">IA que também fala</h3><p className="mt-3 text-sm leading-6 text-white/46">Respostas em áudio no WhatsApp quando a operação vende melhor por voz.</p></div>
          <div className="rounded-2xl bg-black p-6 text-white"><Video className="h-5 w-5 text-[#ff681e]" /><h3 className="mt-5 text-xl font-bold">Reuniões assistidas</h3><p className="mt-3 text-sm leading-6 text-white/46">Contexto antes, apoio durante e resumo comercial depois da reunião.</p></div>
          <div className="rounded-2xl bg-black p-6 text-white"><Bot className="h-5 w-5 text-[#ff681e]" /><h3 className="mt-5 text-xl font-bold">Perguntar à Altum</h3><p className="mt-3 text-sm leading-6 text-white/46">Perguntas sobre tráfego, atendimento, vendas, retenção e risco respondidas com dados da conta.</p></div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[#080808] px-5 py-10 lg:px-8">
      <div className="mx-auto grid max-w-[1280px] gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="flex items-center gap-3"><Image src="/logo-a.png" alt="Logo Altum" width={44} height={44} className="h-11 w-11 rounded-xl" /><span className="font-extrabold tracking-[0.2em] text-white">ALTUM</span></div>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/38">Operação comercial com IA para responder, vender, acompanhar e decidir com mais força.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/42"><Link href="/plataforma" className="hover:text-white">Plataforma</Link><Link href="/precos" className="hover:text-white">Planos</Link><Link href="/blog" className="hover:text-white">Conteúdos</Link><Link href="/politica-de-privacidade" className="hover:text-white">Privacidade</Link><Link href="/cliente/login" className="hover:text-white">Entrar</Link></div>
      </div>
      <div className="mx-auto mt-8 max-w-[1280px] border-t border-white/8 pt-6 text-xs text-white/24">© 2026 Altum. Todos os direitos reservados.</div>
    </footer>
  );
}

function HomeStyles() {
  return <style>{`
    .altum-grid{background-image:linear-gradient(to right,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.035) 1px,transparent 1px);background-size:64px 64px;mask-image:linear-gradient(to bottom,black 30%,transparent 94%)}
    .altum-gradient-text{background:linear-gradient(100deg,#ffb54a 0%,#ff5a0a 44%,#f01601 72%,#d90c3a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
    .altum-primary-cta,.altum-secondary-cta{display:inline-flex;min-height:3.5rem;align-items:center;justify-content:center;gap:.65rem;border-radius:.75rem;padding:.85rem 1.5rem;font-size:.9rem;font-weight:800;transition:.2s ease}
    .altum-primary-cta{background:#e85002;color:white;box-shadow:0 18px 45px rgba(232,80,2,.22)}.altum-primary-cta:hover{background:#ff5c0b;transform:translateY(-1px)}
    .altum-secondary-cta{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);color:white}.altum-secondary-cta:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2)}
    @keyframes altumMarquee{to{transform:translateX(-50%)}}.altum-marquee{animation:altumMarquee 34s linear infinite}.altum-marquee:hover{animation-play-state:paused}
    @media(prefers-reduced-motion:reduce){.altum-marquee{animation:none}.altum-primary-cta:hover{transform:none}}
  `}</style>;
}
