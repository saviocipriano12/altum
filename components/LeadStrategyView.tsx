import React, { useMemo } from "react";
import { 
  Lightbulb, 
  Target, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  DollarSign, 
  Globe 
} from "lucide-react";

// Tipos baseados no seu sistema
interface LeadData {
  nome: string;
  categoria?: string;
  rating?: number;
  userRatingsTotal?: number;
  website?: string;
  priceLevel?: number; // 0 a 4
  photos?: string[];
  telefone?: string;
}

export function LeadStrategyView({ lead }: { lead: LeadData }) {
  
  // O CÉREBRO: Analisa os dados e gera a estratégia
  const strategy = useMemo(() => {
    const s = {
      profile: "Genérico",
      pain: "Baixa visibilidade",
      product: "Tráfego Local",
      script: "",
      tags: [] as string[],
      color: "blue"
    };

    const hasSite = !!(lead.website && lead.website.length > 5);
    const isHighTicket = (lead.priceLevel && lead.priceLevel >= 3);
    const hasGoodReputation = (lead.rating || 0) >= 4.4;
    const hasVolume = (lead.userRatingsTotal || 0) > 50;
    const isPoorlyRated = (lead.rating || 0) > 0 && (lead.rating || 0) < 4.0;

    // 1. Cenário: High Ticket (A mina de ouro)
    if (isHighTicket) {
      s.profile = "High Ticket ($$$)";
      s.color = "amber";
      s.tags.push("Cliente Rico", "Margem Alta");
      
      if (!hasSite) {
        s.pain = "Vende um produto caro mas não tem um canal digital à altura. Perde credibilidade.";
        s.product = "Site Premium + Posicionamento";
        s.script = `Olá ${lead.nome}, notei que vocês são referência em ${lead.categoria}, mas vi que ainda não possuem um site oficial que transmita essa exclusividade. Para o público de vocês, isso é crucial...`;
      } else {
        s.pain = "Já tem estrutura, precisa dominar o mercado para não perder clientes para concorrentes inferiores.";
        s.product = "Tráfego Pago (Google Ads - Fundo de Funil)";
        s.script = `Olá ${lead.nome}, parabéns pelo posicionamento. Fiz uma análise e vi que podemos colocar vocês em 1º lugar para quem busca ${lead.categoria} de alto padrão na região...`;
      }
      return s;
    }

    // 2. Cenário: Reputação Ruim (A urgência)
    if (isPoorlyRated) {
      s.profile = "Crise de Reputação";
      s.color = "red";
      s.pain = "A nota baixa no Google está espantando clientes novos todos os dias.";
      s.product = "Gestão de Reputação (GMN)";
      s.tags.push("Urgente", "Recuperação");
      s.script = `Olá ${lead.nome}, estava vendo as avaliações da região e notei que a nota de vocês no Google está abaixo do potencial da casa. Temos um método para incentivar os clientes felizes a avaliarem e subir essa nota rápido...`;
      return s;
    }

    // 3. Cenário: Gigante Invisível (O clássico)
    if (hasGoodReputation && hasVolume && !hasSite) {
      s.profile = "Gigante Invisível";
      s.color = "purple";
      s.pain = "Muita autoridade boca-a-boca, mas digitalmente dependente do Google Maps.";
      s.product = "Site de Conversão + CRM";
      s.tags.push("Fácil de Vender", "Autoridade");
      s.script = `Oi ${lead.nome}! Impressionante a quantidade de avaliações boas que vocês têm (${lead.userRatingsTotal}). Mas vi que vocês ainda não têm um site para capturar esses interessados e criar um banco de clientes próprio...`;
      return s;
    }

    // 4. Cenário: Iniciante / Sem Dados
    s.profile = "Negócio Local Padrão";
    s.color = "blue";
    s.pain = "Precisa de mais clientes na porta.";
    s.product = "Pack Google Meu Negócio + Tráfego";
    s.script = `Olá ${lead.nome}, tudo bem? Sou especialista em alavancar negócios de ${lead.categoria} aqui na região. Vi que vocês estão no Google, mas dava para destacar muito mais...`;

    return s;
  }, [lead]);

  // Função para abrir o Zap
  const openZap = () => {
    if (!lead.telefone) return;
    const num = lead.telefone.replace(/\D/g, "");
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(strategy.script)}`, "_blank");
  };

  const colorClasses: any = {
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-100",
    red: "bg-red-500/10 border-red-500/20 text-red-100",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-100",
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-100",
  };

  return (
    <div className={`rounded-2xl border p-5 ${colorClasses[strategy.color] || colorClasses.blue} mb-6`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-5 w-5" />
            <h3 className="text-lg font-bold">Estratégia Sugerida: {strategy.profile}</h3>
          </div>
          <p className="text-sm opacity-80 max-w-2xl">{strategy.pain}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">Produto Ideal</span>
          <p className="font-bold text-lg">{strategy.product}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex gap-2 mt-4">
        {strategy.tags.map(tag => (
          <span key={tag} className="px-2 py-1 rounded bg-black/20 text-[10px] font-bold uppercase tracking-wide border border-white/10">
            {tag}
          </span>
        ))}
      </div>

      {/* Script Section */}
      <div className="mt-6 bg-black/20 rounded-xl p-4 border border-white/5">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[10px] uppercase font-bold opacity-50 flex items-center gap-1">
            <MessageSquare size={12} /> Script de Quebra-Gelo (IA)
          </p>
          <button 
            onClick={() => navigator.clipboard.writeText(strategy.script)}
            className="text-[10px] hover:text-white underline opacity-50 transition"
          >
            Copiar Texto
          </button>
        </div>
        <p className="text-sm italic opacity-90 leading-relaxed">"{strategy.script}"</p>
        
        <button 
          onClick={openZap}
          className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <MessageSquare size={16} /> Enviar no WhatsApp Agora
        </button>
      </div>
    </div>
  );
}