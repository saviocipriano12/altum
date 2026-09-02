export const TENANT_MODULE_IDS = [
  "crm",
  "inbox",
  "whatsapp",
  "instagram",
  "ai",
  "automation",
  "marketing",
  "commerce",
  "reports",
  "social_automation",
  "assisted_meetings",
  "calls",
] as const;

export type TenantModuleId = (typeof TENANT_MODULE_IDS)[number];

export type TenantModuleDefinition = {
  id: TenantModuleId;
  label: string;
  shortLabel: string;
  description: string;
  category: "operation" | "channels" | "intelligence" | "growth";
  dependencies: TenantModuleId[];
};

export const TENANT_MODULE_CATALOG: readonly TenantModuleDefinition[] = [
  {
    id: "crm",
    label: "CRM comercial",
    shortLabel: "CRM",
    description: "Clientes, oportunidades, pipeline, agenda, tarefas e propostas.",
    category: "operation",
    dependencies: [],
  },
  {
    id: "inbox",
    label: "Conversas",
    shortLabel: "Inbox",
    description: "Atendimento unificado, filas, histórico e contexto comercial.",
    category: "operation",
    dependencies: [],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    shortLabel: "WhatsApp",
    description: "WhatsApp oficial ou conectado por QR dentro de toda a operação.",
    category: "channels",
    dependencies: ["inbox"],
  },
  {
    id: "instagram",
    label: "Instagram",
    shortLabel: "Instagram",
    description: "Direct, comentários, captação e atendimento pelo Instagram.",
    category: "channels",
    dependencies: ["inbox"],
  },
  {
    id: "ai",
    label: "Assistente com IA",
    shortLabel: "IA",
    description: "Assistente Altum, respostas, análises, voz e contexto do negócio.",
    category: "intelligence",
    dependencies: [],
  },
  {
    id: "automation",
    label: "Automação",
    shortLabel: "Automação",
    description: "Gatilhos, follow-ups e ações automáticas da operação comercial.",
    category: "intelligence",
    dependencies: ["crm"],
  },
  {
    id: "marketing",
    label: "Campanhas e marketing",
    shortLabel: "Marketing",
    description: "Públicos, campanhas, disparos, captação e atribuição.",
    category: "growth",
    dependencies: ["crm"],
  },
  {
    id: "commerce",
    label: "Commerce",
    shortLabel: "Commerce",
    description: "Catálogo, produtos, pedidos, estoque, fulfillment e rastreio.",
    category: "growth",
    dependencies: ["crm"],
  },
  {
    id: "reports",
    label: "Relatórios avançados",
    shortLabel: "Relatórios",
    description: "Conversão, receita, equipe, canais, campanhas e inteligência.",
    category: "growth",
    dependencies: ["crm"],
  },
  {
    id: "social_automation",
    label: "Automação social",
    shortLabel: "Automação social",
    description: "Gatilhos de Direct, comentários e relacionamento no Instagram.",
    category: "growth",
    dependencies: ["instagram", "automation"],
  },
  {
    id: "assisted_meetings",
    label: "Reuniões assistidas",
    shortLabel: "Reuniões IA",
    description: "Copiloto ao vivo, transcrição, resumo, auditoria e próximos passos no CRM.",
    category: "intelligence",
    dependencies: ["ai", "crm"],
  },
  {
    id: "calls",
    label: "Ligações comerciais",
    shortLabel: "Ligações",
    description: "Discagem, histórico e evolução para chamadas oficiais integradas.",
    category: "operation",
    dependencies: ["crm"],
  },
] as const;

export const TENANT_LIMIT_IDS = [
  "users",
  "whatsappChannels",
  "contacts",
  "messagesPerMonth",
  "aiRunsPerMonth",
  "automationsPerMonth",
  "storageMb",
] as const;

export type TenantLimitId = (typeof TENANT_LIMIT_IDS)[number];
export type TenantModuleMap = Record<TenantModuleId, boolean>;
export type TenantLimitMap = Record<TenantLimitId, number>;
export type TenantEntitlementMode = "legacy_full_access" | "custom";

export type TenantEntitlementsSnapshot = {
  version: 1;
  tenantId: string;
  mode: TenantEntitlementMode;
  modules: TenantModuleMap;
  limits: TenantLimitMap;
  isLegacyFallback: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
};

export const DEFAULT_TENANT_LIMITS: TenantLimitMap = {
  users: 3,
  whatsappChannels: 1,
  contacts: 10_000,
  messagesPerMonth: 20_000,
  aiRunsPerMonth: 1_500,
  automationsPerMonth: 5_000,
  storageMb: 5_000,
};

export const TENANT_LIMIT_LABELS: Record<TenantLimitId, { label: string; suffix: string; description: string }> = {
  users: { label: "Usuários", suffix: "usuários", description: "Pessoas com acesso ao portal." },
  whatsappChannels: { label: "Números de WhatsApp", suffix: "números", description: "Canais simultâneos conectados." },
  contacts: { label: "Contatos", suffix: "contatos", description: "Base comercial ativa da empresa." },
  messagesPerMonth: { label: "Mensagens por mês", suffix: "mensagens", description: "Mensagens recebidas e enviadas." },
  aiRunsPerMonth: { label: "Execuções de IA", suffix: "execuções", description: "Interações e tarefas realizadas pela IA." },
  automationsPerMonth: { label: "Automações por mês", suffix: "execuções", description: "Ações automáticas processadas." },
  storageMb: { label: "Armazenamento", suffix: "MB", description: "Arquivos, mídias e documentos." },
};

export function allTenantModules(enabled = true): TenantModuleMap {
  return TENANT_MODULE_IDS.reduce<TenantModuleMap>((modules, moduleId) => {
    modules[moduleId] = enabled;
    return modules;
  }, {} as TenantModuleMap);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

export function applyTenantModuleDependencies(modules: TenantModuleMap) {
  const normalized = { ...modules };
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of TENANT_MODULE_CATALOG) {
      if (!normalized[definition.id]) continue;
      for (const dependency of definition.dependencies) {
        if (!normalized[dependency]) {
          normalized[dependency] = true;
          changed = true;
        }
      }
    }
  }
  return normalized;
}

export function normalizeTenantModules(value: unknown, fallback = allTenantModules(true)) {
  const source = asRecord(value);
  const modules = TENANT_MODULE_IDS.reduce<TenantModuleMap>((result, moduleId) => {
    if (typeof source[moduleId] === "boolean") {
      result[moduleId] = Boolean(source[moduleId]);
      return result;
    }

    // Compatibilidade: ofertas salvas antes destes adicionais continuam com
    // os recursos que já possuíam, até o administrador decidir separá-los.
    if (moduleId === "social_automation") {
      result[moduleId] = typeof source.instagram === "boolean" && typeof source.automation === "boolean"
        ? Boolean(source.instagram && source.automation)
        : fallback[moduleId];
      return result;
    }
    if (moduleId === "assisted_meetings") {
      result[moduleId] = typeof source.ai === "boolean" && typeof source.crm === "boolean"
        ? Boolean(source.ai && source.crm)
        : fallback[moduleId];
      return result;
    }
    if (moduleId === "calls") {
      result[moduleId] = typeof source.crm === "boolean" ? Boolean(source.crm) : fallback[moduleId];
      return result;
    }

    result[moduleId] = fallback[moduleId];
    return result;
  }, {} as TenantModuleMap);
  return applyTenantModuleDependencies(modules);
}

export function normalizeTenantLimits(value: unknown, fallback = DEFAULT_TENANT_LIMITS) {
  const source = asRecord(value);
  return TENANT_LIMIT_IDS.reduce<TenantLimitMap>((limits, limitId) => {
    limits[limitId] = normalizeNonNegativeInteger(source[limitId], fallback[limitId]);
    return limits;
  }, {} as TenantLimitMap);
}

export function buildLegacyTenantEntitlements(tenantId: string): TenantEntitlementsSnapshot {
  return {
    version: 1,
    tenantId: String(tenantId || "").trim(),
    mode: "legacy_full_access",
    modules: allTenantModules(true),
    limits: { ...DEFAULT_TENANT_LIMITS },
    isLegacyFallback: true,
    updatedAt: null,
    updatedBy: null,
    updatedByName: null,
  };
}

export function normalizeTenantEntitlements(
  tenantId: string,
  value: unknown,
  options?: { legacyFallback?: boolean }
): TenantEntitlementsSnapshot {
  const source = asRecord(value);
  const legacyFallback = options?.legacyFallback === true;
  const mode: TenantEntitlementMode =
    source.mode === "legacy_full_access" || legacyFallback ? "legacy_full_access" : "custom";
  const fallbackModules = mode === "legacy_full_access" ? allTenantModules(true) : allTenantModules(false);

  return {
    version: 1,
    tenantId: String(tenantId || source.tenantId || "").trim(),
    mode,
    modules: normalizeTenantModules(source.modules, fallbackModules),
    limits: normalizeTenantLimits(source.limits),
    isLegacyFallback: legacyFallback,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    updatedBy: typeof source.updatedBy === "string" ? source.updatedBy : null,
    updatedByName: typeof source.updatedByName === "string" ? source.updatedByName : null,
  };
}

export function hasTenantModule(
  entitlements: Pick<TenantEntitlementsSnapshot, "modules"> | null | undefined,
  moduleId: TenantModuleId
) {
  return Boolean(entitlements?.modules?.[moduleId]);
}

export function getTenantLimit(
  entitlements: Pick<TenantEntitlementsSnapshot, "limits"> | null | undefined,
  limitId: TenantLimitId
) {
  return Number(entitlements?.limits?.[limitId] || 0);
}

const CLIENT_ROUTE_MODULES: ReadonlyArray<{ prefix: string; moduleId: TenantModuleId }> = [
  { prefix: "/cliente/painel/automacao-instagram", moduleId: "social_automation" },
  { prefix: "/cliente/painel/produtos-servicos", moduleId: "commerce" },
  { prefix: "/cliente/painel/reunioes-assistidas", moduleId: "assisted_meetings" },
  { prefix: "/cliente/painel/perguntar-altum", moduleId: "ai" },
  { prefix: "/cliente/painel/conhecimento", moduleId: "ai" },
  { prefix: "/cliente/painel/follow-ups", moduleId: "crm" },
  { prefix: "/cliente/painel/comercial", moduleId: "crm" },
  { prefix: "/cliente/painel/pipeline", moduleId: "crm" },
  { prefix: "/cliente/painel/agenda", moduleId: "crm" },
  { prefix: "/cliente/painel/crm", moduleId: "crm" },
  { prefix: "/cliente/painel/inbox", moduleId: "inbox" },
  { prefix: "/cliente/painel/automacoes/instagram", moduleId: "social_automation" },
  { prefix: "/cliente/painel/automacoes", moduleId: "automation" },
  { prefix: "/cliente/painel/campanhas", moduleId: "marketing" },
  { prefix: "/cliente/painel/captacao", moduleId: "marketing" },
  { prefix: "/cliente/painel/disparos", moduleId: "marketing" },
  { prefix: "/cliente/painel/relatorios", moduleId: "reports" },
  { prefix: "/cliente/painel/metricas", moduleId: "reports" },
  { prefix: "/cliente/painel/handoffs", moduleId: "ai" },
  { prefix: "/cliente/painel/ia", moduleId: "ai" },
];

export function getTenantModuleForClientPath(pathname: string) {
  const normalized = String(pathname || "").replace(/\/+$/, "") || "/";
  return CLIENT_ROUTE_MODULES.find(
    (item) => normalized === item.prefix || normalized.startsWith(`${item.prefix}/`)
  )?.moduleId || null;
}
