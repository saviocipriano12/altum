import {
  Bot,
  CheckCircle2,
  LayoutDashboard,
  Megaphone,
  MessageCircleMore,
  MousePointerClick,
  Workflow,
} from "lucide-react";

const flowItems = [
  {
    title: "Anuncio",
    description: "Midia e conteudo",
    icon: Megaphone,
    tone: "border-[#f56e0f]/20 bg-[#fff5ec] text-[#f56e0f]",
  },
  {
    title: "Pagina",
    description: "Oferta com clareza",
    icon: MousePointerClick,
    tone: "border-black/8 bg-white text-black/60",
  },
  {
    title: "WhatsApp",
    description: "Entrada com contexto",
    icon: MessageCircleMore,
    tone: "border-black/8 bg-white text-black/60",
  },
  {
    title: "CRM",
    description: "Lead organizado",
    icon: Workflow,
    tone: "border-[#f56e0f]/20 bg-[#fff5ec] text-[#f56e0f]",
  },
  {
    title: "IA",
    description: "Priorizacao e apoio",
    icon: Bot,
    tone: "border-black/8 bg-white text-black/60",
  },
  {
    title: "Venda",
    description: "Proximo passo claro",
    icon: CheckCircle2,
    tone: "border-black/8 bg-white text-black/60",
  },
  {
    title: "Acompanhamento",
    description: "Visao da operacao",
    icon: LayoutDashboard,
    tone: "border-[#f56e0f]/20 bg-[#fff5ec] text-[#f56e0f]",
  },
] as const;

export function FlowDiagram() {
  return (
    <div className="relative">
      <div className="altum-float absolute -left-5 top-8 z-20 hidden rounded-2xl border border-black/8 bg-white/92 px-4 py-3 shadow-[0_20px_60px_rgba(16,16,16,0.08)] backdrop-blur-xl lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f8a25d]">
          Diagnostico
        </p>
        <p className="mt-1 text-sm font-medium text-black/62">
          primeiro filtro antes do comercial
        </p>
      </div>

      <div className="altum-float-slow absolute -right-4 bottom-10 z-20 hidden rounded-2xl border border-[#f56e0f]/20 bg-[#fff4ea] px-4 py-3 shadow-[0_20px_60px_rgba(245,110,15,0.15)] backdrop-blur-xl lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f8a25d]">
          Operacao
        </p>
        <p className="mt-1 text-sm font-medium text-black/62">
          marketing, comercial e plataforma no mesmo fluxo
        </p>
      </div>

      <div className="altum-pulse absolute -inset-8 rounded-[48px] bg-[#f56e0f]/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[34px] border border-black/8 bg-[#fffdfa]/94 shadow-[0_34px_110px_rgba(16,16,16,0.08)] backdrop-blur-xl">
        <div className="altum-sheen pointer-events-none absolute inset-0" />
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#f8a25d]">
              Mapa de crescimento
            </p>
            <p className="mt-1 text-sm text-black/42">Da atencao ate o acompanhamento</p>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f56e0f]" />
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {flowItems.slice(0, 4).map((item) => (
              <FlowNode key={item.title} {...item} />
            ))}
          </div>

          <div className="relative my-4 hidden h-px bg-gradient-to-r from-transparent via-[#f56e0f]/40 to-transparent xl:block" />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {flowItems.slice(4).map((item) => (
              <FlowNode key={item.title} {...item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  title,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  icon: typeof Megaphone;
  tone: string;
}) {
  return (
    <article className={`rounded-[28px] border p-5 ${tone}`}>
      <div className="inline-flex rounded-2xl bg-black/5 p-3">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="altum-display mt-5 text-2xl font-semibold tracking-[-0.05em] text-[#111111]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-black/52">{description}</p>
    </article>
  );
}
