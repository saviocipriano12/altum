export type PipelineStageDefinition = {
  id: string;
  label: string;
  description: string;
  color: string;
  position: number;
  isTerminal?: boolean;
};

const DEFAULT_STAGE_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f97316",
  "#22c55e",
  "#ef4444",
] as const;

export const DEFAULT_PIPELINE_STAGES: PipelineStageDefinition[] = [
  {
    id: "captado",
    label: "Captado",
    description: "Entradas novas no funil comercial.",
    color: DEFAULT_STAGE_COLORS[0],
    position: 0,
  },
  {
    id: "contato",
    label: "Contato",
    description: "Primeira abordagem iniciada.",
    color: DEFAULT_STAGE_COLORS[1],
    position: 1,
  },
  {
    id: "qualificacao",
    label: "Qualificacao",
    description: "Lead engajado e em descoberta.",
    color: DEFAULT_STAGE_COLORS[2],
    position: 2,
  },
  {
    id: "proposta",
    label: "Proposta",
    description: "Oferta enviada ou em estruturacao.",
    color: DEFAULT_STAGE_COLORS[3],
    position: 3,
  },
  {
    id: "fechamento",
    label: "Fechamento",
    description: "Negociacao final e decisao.",
    color: DEFAULT_STAGE_COLORS[4],
    position: 4,
  },
  {
    id: "ganho",
    label: "Ganho",
    description: "Oportunidades convertidas em venda.",
    color: DEFAULT_STAGE_COLORS[5],
    position: 5,
    isTerminal: true,
  },
  {
    id: "perdido",
    label: "Perdido",
    description: "Negocios perdidos ou arquivados.",
    color: DEFAULT_STAGE_COLORS[6],
    position: 6,
    isTerminal: true,
  },
];

const STAGE_ALIASES: Record<string, string> = {
  captado: "captado",
  novo: "captado",
  novo_lead: "captado",
  contato: "contato",
  contato_iniciado: "contato",
  contato_enviado: "contato",
  respondido: "qualificacao",
  qualificado: "qualificacao",
  qualificacao: "qualificacao",
  proposta: "proposta",
  proposta_enviada: "proposta",
  em_negociacao: "fechamento",
  negociacao: "fechamento",
  fechamento: "fechamento",
  fechado: "ganho",
  ganho: "ganho",
  perdido: "perdido",
};

function cleanText(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePipelineStageId(value: unknown, fallback = "captado") {
  const raw = slugify(cleanText(value, 80));
  if (!raw) return fallback;
  return STAGE_ALIASES[raw] || raw;
}

export function getDefaultPipelineStages() {
  return DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage }));
}

export function normalizePipelineStages(value: unknown): PipelineStageDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    return getDefaultPipelineStages();
  }

  const usedIds = new Set<string>();
  const items: PipelineStageDefinition[] = [];

  for (const [index, item] of value.entries()) {
    const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const defaultStage = DEFAULT_PIPELINE_STAGES[index] || DEFAULT_PIPELINE_STAGES[0];
    const id = normalizePipelineStageId(source.id || source.label, defaultStage.id);

    if (!id || usedIds.has(id)) continue;
    usedIds.add(id);

    items.push({
      id,
      label: cleanText(source.label, 60) || defaultStage.label,
      description: cleanText(source.description, 180) || defaultStage.description,
      color: cleanText(source.color, 20) || DEFAULT_STAGE_COLORS[index] || defaultStage.color,
      position:
        typeof source.position === "number" && Number.isFinite(source.position) ? source.position : index,
      isTerminal: Boolean(source.isTerminal ?? defaultStage.isTerminal),
    });
  }

  items.sort((a, b) => a.position - b.position);
  const limitedItems = items.slice(0, 12);

  if (limitedItems.length < 3) {
    return getDefaultPipelineStages();
  }

  return limitedItems.map((item, index) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    color: item.color,
    position: index,
    isTerminal: item.isTerminal,
  }));
}

export function getPipelineStageLabel(stageId: string, stages = DEFAULT_PIPELINE_STAGES) {
  return stages.find((item) => item.id === normalizePipelineStageId(stageId))?.label || stageId || "Captado";
}
