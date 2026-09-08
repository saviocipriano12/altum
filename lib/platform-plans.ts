import {
  allTenantModules,
  applyTenantModuleDependencies,
  type TenantLimitMap,
  type TenantModuleId,
  type TenantModuleMap,
} from "./tenant-entitlements.ts";

export const PLATFORM_CATALOG_VERSION = "2026-09-launch";
export const PLATFORM_TRIAL_DAYS = 7;
export const PLATFORM_USAGE_ALERT_THRESHOLDS = [70, 90, 100] as const;

export type PlatformPlanId = "essencial" | "operacao" | "escala" | "estrutura_assistida";
export type PlatformSetupMode = "optional" | "required" | "proposal";

export type PlatformPlanAllowances = {
  users: number;
  whatsappChannels: number;
  instagramAccounts: number;
  pipelines: number;
  contacts: number;
  messagesPerMonth: number;
  aiCreditsPerMonth: number;
  activeAutomations: number;
  automationRunsPerMonth: number;
  storageGb: number;
  commerceIntegrations: number;
};

export type PlatformPlan = {
  id: PlatformPlanId;
  catalogVersion: string;
  name: string;
  promise: string;
  description: string;
  monthlyPrice: number | null;
  pricePrefix?: string;
  setupFee: number | null;
  setupMode: PlatformSetupMode;
  setupLabel: string;
  features: string[];
  featured: boolean;
  active: boolean;
  checkoutEnabled: boolean;
  trialEligible: boolean;
  sortOrder: number;
  allowances: PlatformPlanAllowances;
  modules: TenantModuleMap;
  limits: TenantLimitMap;
};

function modules(enabled: TenantModuleId[]) {
  const result = allTenantModules(false);
  for (const moduleId of enabled) result[moduleId] = true;
  return applyTenantModuleDependencies(result);
}

/** The marketed allowance is the source of truth for every supported limit. */
export function platformLimitsFromAllowances(allowances: PlatformPlanAllowances): TenantLimitMap {
  return {
    users: allowances.users,
    whatsappChannels: allowances.whatsappChannels,
    contacts: allowances.contacts,
    messagesPerMonth: allowances.messagesPerMonth,
    aiRunsPerMonth: allowances.aiCreditsPerMonth,
    automationsPerMonth: allowances.automationRunsPerMonth,
    // Preserve the launch catalog's decimal GB convention (1 GB = 1,000 MB).
    storageMb: allowances.storageGb * 1_000,
  };
}

const PLATFORM_PLAN_DEFINITIONS: readonly Omit<PlatformPlan, "limits">[] = [
  {
    id: "essencial",
    catalogVersion: PLATFORM_CATALOG_VERSION,
    name: "Essencial",
    promise: "Organize o atendimento e pare de perder oportunidades.",
    description: "Para pequenos negocios que querem centralizar WhatsApp, clientes, pipeline e follow-ups.",
    monthlyPrice: 397,
    setupFee: 397,
    setupMode: "optional",
    setupLabel: "Configuracao guiada opcional",
    features: ["2 usuarios", "WhatsApp, conversas e CRM", "Pipeline, agenda e follow-ups", "IA e automacoes essenciais", "Relatorios basicos"],
    featured: false,
    active: true,
    checkoutEnabled: true,
    trialEligible: true,
    sortOrder: 10,
    allowances: {
      users: 2,
      whatsappChannels: 1,
      instagramAccounts: 0,
      pipelines: 1,
      contacts: 2_000,
      messagesPerMonth: 5_000,
      aiCreditsPerMonth: 200,
      activeAutomations: 2,
      automationRunsPerMonth: 1_000,
      storageGb: 1,
      commerceIntegrations: 0,
    },
    modules: modules(["crm", "inbox", "whatsapp", "ai", "automation", "commerce", "reports"]),
  },
  {
    id: "operacao",
    catalogVersion: PLATFORM_CATALOG_VERSION,
    name: "Operacao",
    promise: "Automatize WhatsApp e Instagram com IA aplicada a vendas.",
    description: "Para empresas que ja recebem demanda e precisam atender, qualificar, acompanhar e reativar clientes.",
    monthlyPrice: 697,
    setupFee: 797,
    setupMode: "required",
    setupLabel: "Implantacao assistida",
    features: ["5 usuarios", "WhatsApp e Instagram", "CRM completo e pipeline comercial", "IA, campanhas e automacoes", "Integracoes comerciais sob configuracao"],
    featured: true,
    active: true,
    checkoutEnabled: true,
    trialEligible: true,
    sortOrder: 20,
    allowances: {
      users: 5,
      whatsappChannels: 1,
      instagramAccounts: 1,
      pipelines: 3,
      contacts: 10_000,
      messagesPerMonth: 20_000,
      aiCreditsPerMonth: 1_000,
      activeAutomations: 10,
      automationRunsPerMonth: 5_000,
      storageGb: 5,
      commerceIntegrations: 1,
    },
    modules: modules(["crm", "inbox", "whatsapp", "instagram", "ai", "automation", "marketing", "commerce", "reports", "social_automation"]),
  },
  {
    id: "escala",
    catalogVersion: PLATFORM_CATALOG_VERSION,
    name: "Escala",
    promise: "Governe mais equipes, canais e volume comercial.",
    description: "Para operacoes maiores que precisam de mais capacidade, automacoes avancadas e visao gerencial.",
    monthlyPrice: 1_197,
    setupFee: 1_497,
    setupMode: "required",
    setupLabel: "Implantacao completa",
    features: ["10 usuarios", "Operacao multicanal", "Pipeline comercial", "Todos os recursos e relatorios avancados", "Integracoes comerciais sob configuracao"],
    featured: false,
    active: true,
    checkoutEnabled: true,
    trialEligible: true,
    sortOrder: 30,
    allowances: {
      users: 10,
      whatsappChannels: 2,
      instagramAccounts: 2,
      pipelines: 5,
      contacts: 30_000,
      messagesPerMonth: 60_000,
      aiCreditsPerMonth: 3_000,
      activeAutomations: 30,
      automationRunsPerMonth: 20_000,
      storageGb: 20,
      commerceIntegrations: 2,
    },
    modules: allTenantModules(true),
  },
  {
    id: "estrutura_assistida",
    catalogVersion: PLATFORM_CATALOG_VERSION,
    name: "Estrutura Assistida",
    promise: "Plataforma e acompanhamento humano para evoluir sua operacao.",
    description: "Inclui a estrutura do plano Escala e acompanhamento estrategico com escopo definido.",
    monthlyPrice: 2_497,
    pricePrefix: "A partir de",
    setupFee: 2_997,
    setupMode: "proposal",
    setupLabel: "Implantacao sob proposta",
    features: ["Tudo do plano Escala", "Reuniao estrategica mensal", "Ate 4 horas mensais de configuracao", "Melhoria de automacoes e IA", "Relatorio com plano de acao"],
    featured: false,
    active: true,
    checkoutEnabled: false,
    trialEligible: false,
    sortOrder: 40,
    allowances: {
      users: 10,
      whatsappChannels: 2,
      instagramAccounts: 2,
      pipelines: 5,
      contacts: 30_000,
      messagesPerMonth: 60_000,
      aiCreditsPerMonth: 3_000,
      activeAutomations: 30,
      automationRunsPerMonth: 20_000,
      storageGb: 20,
      commerceIntegrations: 2,
    },
    modules: allTenantModules(true),
  },
] as const;

export const DEFAULT_PLATFORM_PLANS: readonly PlatformPlan[] = PLATFORM_PLAN_DEFINITIONS.map((plan) => ({
  ...plan,
  limits: platformLimitsFromAllowances(plan.allowances),
}));

export const PLATFORM_TRIAL_ACCESS = {
  catalogVersion: PLATFORM_CATALOG_VERSION,
  days: PLATFORM_TRIAL_DAYS,
  modules: allTenantModules(true),
  limits: {
    users: 5,
    whatsappChannels: 1,
    contacts: 1_000,
    messagesPerMonth: 1_000,
    aiRunsPerMonth: 150,
    automationsPerMonth: 500,
    storageMb: 500,
  } satisfies TenantLimitMap,
} as const;

export const PLATFORM_ADD_ONS = [
  { id: "extra_user", label: "Usuario adicional", price: 49, unit: "/mes" },
  { id: "extra_whatsapp", label: "WhatsApp adicional", price: 99, unit: "/mes" },
  { id: "extra_instagram", label: "Instagram adicional", price: 79, unit: "/mes" },
  { id: "extra_contacts", label: "10 mil contatos adicionais", price: 79, unit: "/mes" },
  { id: "extra_ai", label: "1.000 creditos de IA", price: 99, unit: "" },
  { id: "extra_automation_runs", label: "10 mil execucoes de automacao", price: 79, unit: "" },
] as const;

export const FOUNDERS_OFFER = {
  name: "Programa Fundadores Altum",
  seats: 10,
  planId: "operacao" as const,
  monthlyPrice: 497,
  promotionalMonths: 6,
  setupFee: 497,
  minimumCommitmentMonths: 3,
  public: false,
} as const;

export function getDefaultPlatformPlan(value: unknown) {
  return DEFAULT_PLATFORM_PLANS.find((plan) => plan.id === value) || null;
}

export function isPlatformPlanId(value: unknown): value is PlatformPlanId {
  return value === "essencial" || value === "operacao" || value === "escala" || value === "estrutura_assistida";
}
