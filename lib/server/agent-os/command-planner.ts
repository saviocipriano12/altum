import type { MissionRisk, MissionTemplate } from "@/lib/server/agent-os/missions";

const CREATE_PATTERN = /\b(crie|criar|gere|gerar|monte|montar|inicie|iniciar|execute|executar|organize|organizar|planeje|planejar|pesquise|pesquisar|analise|analisar|faca|fazer|desenvolva|desenvolver|construa|construir|produza|produzir|prepare|preparar)\b/i;
// Recognize both imperative verbs and noun-based actions (e.g. "faça o envio").
// This is a conservative planning signal; the execution policy still gates actions.
const HIGH_RISK_PATTERN = /\b(envie|enviar|envio|envios|dispare|disparar|disparo|disparos|publique|publicar|publicacao|publicacoes|invista|investir|investimento|investimentos|gaste|gastar|gasto|gastos|pague|pagar|pagamento|pagamentos|cobre|cobrar|cobranca|cobrancas|exclua|excluir|exclusao|delete|deletar|apagar|apagamento|checkout|transfira|transferir|transferencia|transferencias)\b/i;

function clean(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function planCommand(message: string): {
  shouldCreateMission: boolean;
  template: MissionTemplate;
  risk: MissionRisk;
  title: string;
  objective: string;
  constraints: string[];
} {
  const text = clean(message, 2_400);
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const template: MissionTemplate = /lead|prospecc|reuniao|venda|receita|cliente potencial/.test(normalized)
    ? "revenue"
    : /campanha|marketing|anuncio|anuncio|trafego|midia|social/.test(normalized)
      ? "marketing"
      : /criativo|video|imagem|carrossel|roteiro|copy|conteudo/.test(normalized)
        ? "creative"
        : /site|landing|produto|checkout|app|sistema|pagina/.test(normalized)
          ? "product"
          : "custom";
  const risk: MissionRisk = HIGH_RISK_PATTERN.test(normalized)
    ? "high"
    : /campanha|proposta|contato|mensagem/.test(normalized) ? "medium" : "low";
  const subject = clean(text.replace(CREATE_PATTERN, "").replace(/^[:\-–—\s]+/, ""), 112) || "Nova missão operacional";
  return {
    shouldCreateMission: CREATE_PATTERN.test(normalized),
    template,
    risk,
    title: `Missão: ${subject}`.slice(0, 140),
    objective: text.length >= 12 ? text : "Organizar uma missão operacional com plano, etapas e evidências.",
    constraints: [
      "Não executar comunicação externa, publicação ou gasto sem aprovação humana.",
      "Registrar evidências e próximos passos antes de encerrar a missão.",
    ],
  };
}
