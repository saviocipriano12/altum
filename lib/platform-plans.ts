export type PlatformPlanId = "essencial" | "operacao" | "estrutura_assistida";

export type PlatformPlan = {
  id: PlatformPlanId;
  name: string;
  description: string;
  monthlyPrice: number | null;
  features: string[];
  featured: boolean;
  active: boolean;
  checkoutEnabled: boolean;
  sortOrder: number;
};

export const DEFAULT_PLATFORM_PLANS: readonly PlatformPlan[] = [
  {
    id: "essencial",
    name: "Essencial",
    description: "Para organizar atendimento, clientes, oportunidades e agenda em uma unica operacao.",
    monthlyPrice: 797,
    features: ["Conversas e CRM", "Agenda e follow-up", "Relatorios essenciais", "1 canal principal"],
    featured: false,
    active: true,
    checkoutEnabled: true,
    sortOrder: 10,
  },
  {
    id: "operacao",
    name: "Operacao",
    description: "Para times com demanda que precisam de mais capacidade, automacao e IA aplicada.",
    monthlyPrice: 997,
    features: ["Tudo do Essencial", "Campanhas e captacao", "Assistente Altum", "Mais capacidade operacional"],
    featured: true,
    active: true,
    checkoutEnabled: true,
    sortOrder: 20,
  },
  {
    id: "estrutura_assistida",
    name: "Estrutura Assistida",
    description: "Plataforma, implantacao e acompanhamento inicial para entrar em operacao com apoio.",
    monthlyPrice: null,
    features: ["Setup dedicado", "Treinamento inicial", "Revisao do fluxo comercial", "Ativacao orientada"],
    featured: false,
    active: true,
    checkoutEnabled: false,
    sortOrder: 30,
  },
] as const;

export function isPlatformPlanId(value: unknown): value is PlatformPlanId {
  return value === "essencial" || value === "operacao" || value === "estrutura_assistida";
}
