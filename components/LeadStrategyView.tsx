import React, { useMemo } from "react";
import { Lightbulb, MessageSquare } from "lucide-react";

interface LeadData {
  nome: string;
  categoria?: string;
  rating?: number;
  userRatingsTotal?: number;
  website?: string;
  priceLevel?: number;
  photos?: string[];
  telefone?: string;
}

type StrategyColor = "amber" | "red" | "purple" | "blue";

export function LeadStrategyView({ lead }: { lead: LeadData }) {
  const strategy = useMemo(() => {
    const base = {
      profile: "Generico",
      pain: "Baixa visibilidade",
      product: "Trafego Local",
      script: "",
      tags: [] as string[],
      color: "blue" as StrategyColor,
    };

    const hasSite = !!(lead.website && lead.website.length > 5);
    const isHighTicket = !!(lead.priceLevel && lead.priceLevel >= 3);
    const hasGoodReputation = (lead.rating || 0) >= 4.4;
    const hasVolume = (lead.userRatingsTotal || 0) > 50;
    const isPoorlyRated = (lead.rating || 0) > 0 && (lead.rating || 0) < 4.0;

    if (isHighTicket) {
      base.profile = "High Ticket";
      base.color = "amber";
      base.tags.push("Cliente Rico", "Margem Alta");
      if (!hasSite) {
        base.pain =
          "Vende produto caro mas nao tem canal digital no mesmo nivel. Perde credibilidade.";
        base.product = "Site Premium + Posicionamento";
        base.script = `Ola ${lead.nome}, vi potencial forte em ${lead.categoria}. Podemos elevar o posicionamento digital para refletir o nivel da sua operacao.`;
      } else {
        base.pain =
          "Ja tem estrutura, precisa dominar o mercado para nao perder demanda para concorrentes.";
        base.product = "Google Ads de Fundo de Funil";
        base.script = `Ola ${lead.nome}, com a estrutura atual de voces, da para ganhar busca qualificada de ${lead.categoria} com previsibilidade.`;
      }
      return base;
    }

    if (isPoorlyRated) {
      base.profile = "Crise de Reputacao";
      base.color = "red";
      base.pain = "Nota baixa no Google afasta clientes novos todos os dias.";
      base.product = "Gestao de Reputacao";
      base.tags.push("Urgente", "Recuperacao");
      base.script = `Ola ${lead.nome}, identifiquei oportunidade direta de subir reputacao e recuperar vendas locais em poucas semanas.`;
      return base;
    }

    if (hasGoodReputation && hasVolume && !hasSite) {
      base.profile = "Gigante Invisivel";
      base.color = "purple";
      base.pain =
        "Alta autoridade local, mas dependencia total de canais de terceiros.";
      base.product = "Site de Conversao + CRM";
      base.tags.push("Facil de vender", "Autoridade");
      base.script = `Oi ${lead.nome}, voces ja tem confianca no mercado e podemos transformar isso em captacao previsivel com site e CRM.`;
      return base;
    }

    base.profile = "Negocio Local Padrao";
    base.color = "blue";
    base.pain = "Precisa gerar mais demanda qualificada.";
    base.product = "Google Meu Negocio + Trafego";
    base.script = `Ola ${lead.nome}, analisando ${lead.categoria}, temos um plano simples para aumentar fluxo de novos clientes na regiao.`;
    return base;
  }, [lead]);

  const openZap = () => {
    if (!lead.telefone) return;
    const num = lead.telefone.replace(/\D/g, "");
    window.open(
      `https://wa.me/55${num}?text=${encodeURIComponent(strategy.script)}`,
      "_blank"
    );
  };

  const colorClasses: Record<StrategyColor, string> = {
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-100",
    red: "bg-red-500/10 border-red-500/20 text-red-100",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-100",
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-100",
  };

  return (
    <div
      className={`rounded-2xl border p-5 ${colorClasses[strategy.color]} mb-6`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-5 w-5" />
            <h3 className="text-lg font-bold">
              Estrategia sugerida: {strategy.profile}
            </h3>
          </div>
          <p className="text-sm opacity-80 max-w-2xl">{strategy.pain}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">
            Produto ideal
          </span>
          <p className="font-bold text-lg">{strategy.product}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {strategy.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 rounded bg-black/20 text-[10px] font-bold uppercase tracking-wide border border-white/10"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-6 bg-black/20 rounded-xl p-4 border border-white/5">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[10px] uppercase font-bold opacity-50 flex items-center gap-1">
            <MessageSquare size={12} /> Script IA
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(strategy.script)}
            className="text-[10px] hover:text-white underline opacity-50 transition"
          >
            Copiar texto
          </button>
        </div>
        <p className="text-sm italic opacity-90 leading-relaxed">
          &quot;{strategy.script}&quot;
        </p>

        <button
          onClick={openZap}
          className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <MessageSquare size={16} /> Enviar no WhatsApp
        </button>
      </div>
    </div>
  );
}
