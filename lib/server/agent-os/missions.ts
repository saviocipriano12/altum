import { z } from "zod";

export const MISSION_STATUSES = [
  "draft",
  "planned",
  "running",
  "waiting_approval",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export const MISSION_RISKS = ["low", "medium", "high"] as const;

export const MISSION_TEMPLATES = ["revenue", "marketing", "creative", "product", "custom"] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MissionRisk = (typeof MISSION_RISKS)[number];
export type MissionTemplate = (typeof MISSION_TEMPLATES)[number];

export const missionCreateSchema = z.object({
  tenantId: z.string().trim().min(1).max(180),
  title: z.string().trim().min(4).max(140),
  objective: z.string().trim().min(12).max(2400),
  template: z.enum(MISSION_TEMPLATES).default("custom"),
  budgetBrl: z.coerce.number().finite().min(0).max(1_000_000).default(0),
  deadline: z.string().trim().max(40).optional(),
  risk: z.enum(MISSION_RISKS).default("medium"),
  constraints: z.array(z.string().trim().min(2).max(220)).max(12).default([]),
});

export type MissionCreateInput = z.infer<typeof missionCreateSchema>;

export type MissionTaskSeed = {
  title: string;
  agent: string;
  capability: string;
  requiresApproval: boolean;
};

const TASKS_BY_TEMPLATE: Record<MissionTemplate, MissionTaskSeed[]> = {
  revenue: [
    { title: "Definir perfil ideal e critérios de qualificação", agent: "Manager Agent", capability: "PLAN_MISSION", requiresApproval: false },
    { title: "Pesquisar e qualificar oportunidades", agent: "Research Agent", capability: "WEB_RESEARCH", requiresApproval: false },
    { title: "Preparar dossiês e abordagens personalizadas", agent: "Revenue Agent", capability: "CRM_WRITE", requiresApproval: false },
    { title: "Revisar contatos e aprovar sequência externa", agent: "Human Review", capability: "EXTERNAL_MESSAGING", requiresApproval: true },
    { title: "Registrar respostas, reuniões e aprendizado", agent: "Analyst Agent", capability: "ANALYZE_RESULTS", requiresApproval: false },
  ],
  marketing: [
    { title: "Ler contexto da marca e indicadores", agent: "Marketing Manager", capability: "PLAN_MISSION", requiresApproval: false },
    { title: "Mapear hipóteses, canais e prioridades", agent: "Strategy Agent", capability: "WEB_RESEARCH", requiresApproval: false },
    { title: "Criar plano e materiais em rascunho", agent: "Creative Agent", capability: "GENERATE_CREATIVE", requiresApproval: false },
    { title: "Aprovar publicação ou alterações de mídia", agent: "Human Review", capability: "PUBLISH_OR_ADS_WRITE", requiresApproval: true },
    { title: "Medir resultados e propor próxima iteração", agent: "Analyst Agent", capability: "ANALYZE_RESULTS", requiresApproval: false },
  ],
  creative: [
    { title: "Consolidar briefing, marca e oferta", agent: "Creative Director", capability: "READ_BRAND_CONTEXT", requiresApproval: false },
    { title: "Criar conceitos, copy e roteiro", agent: "Creative Agent", capability: "GENERATE_CREATIVE", requiresApproval: false },
    { title: "Produzir variações de assets", agent: "Asset Agent", capability: "GENERATE_MEDIA", requiresApproval: false },
    { title: "Revisar e aprovar assets para uso externo", agent: "Human Review", capability: "PUBLISH_OR_ADS_WRITE", requiresApproval: true },
  ],
  product: [
    { title: "Pesquisar oportunidade e evidências", agent: "Research Agent", capability: "WEB_RESEARCH", requiresApproval: false },
    { title: "Validar hipótese, preço e viabilidade", agent: "Product Agent", capability: "ANALYZE_RESULTS", requiresApproval: false },
    { title: "Criar oferta, página e materiais em rascunho", agent: "Developer Agent", capability: "BUILD_PRODUCT", requiresApproval: false },
    { title: "Aprovar publicação, checkout e investimento", agent: "Human Review", capability: "PUBLISH_OR_ADS_WRITE", requiresApproval: true },
  ],
  custom: [
    { title: "Transformar objetivo em plano verificável", agent: "Manager Agent", capability: "PLAN_MISSION", requiresApproval: false },
    { title: "Executar primeira investigação", agent: "Research Agent", capability: "WEB_RESEARCH", requiresApproval: false },
    { title: "Avaliar evidências e definir próximo passo", agent: "Analyst Agent", capability: "ANALYZE_RESULTS", requiresApproval: false },
  ],
};

export function buildMissionTaskSeeds(template: MissionTemplate) {
  return TASKS_BY_TEMPLATE[template];
}

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  draft: "Rascunho",
  planned: "Planejada",
  running: "Em execução",
  waiting_approval: "Aguardando aprovação",
  paused: "Pausada",
  completed: "Concluída",
  failed: "Precisa de atenção",
  cancelled: "Cancelada",
};
