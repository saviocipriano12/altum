import {
  allTenantModules,
  applyTenantModuleDependencies,
  type TenantLimitMap,
  type TenantModuleId,
  type TenantModuleMap,
} from "@/lib/tenant-entitlements";
import type { PlatformPlanId } from "@/lib/platform-plans";

export type PlatformPlanEntitlements = {
  modules: TenantModuleMap;
  limits: TenantLimitMap;
};

function modules(enabled: TenantModuleId[]) {
  const result = allTenantModules(false);
  for (const moduleId of enabled) result[moduleId] = true;
  return applyTenantModuleDependencies(result);
}

export const PLATFORM_PLAN_ENTITLEMENTS: Record<PlatformPlanId, PlatformPlanEntitlements> = {
  essencial: {
    modules: modules(["crm", "inbox", "whatsapp", "ai", "commerce", "reports"]),
    limits: {
      users: 3,
      whatsappChannels: 1,
      contacts: 5_000,
      messagesPerMonth: 10_000,
      aiRunsPerMonth: 600,
      automationsPerMonth: 0,
      storageMb: 2_000,
    },
  },
  operacao: {
    modules: allTenantModules(true),
    limits: {
      users: 10,
      whatsappChannels: 3,
      contacts: 25_000,
      messagesPerMonth: 50_000,
      aiRunsPerMonth: 3_000,
      automationsPerMonth: 12_000,
      storageMb: 10_000,
    },
  },
  estrutura_assistida: {
    modules: allTenantModules(true),
    limits: {
      users: 20,
      whatsappChannels: 6,
      contacts: 75_000,
      messagesPerMonth: 150_000,
      aiRunsPerMonth: 10_000,
      automationsPerMonth: 50_000,
      storageMb: 30_000,
    },
  },
};

export function getPlatformPlanEntitlements(value: unknown): PlatformPlanEntitlements {
  if (value === "operacao" || value === "estrutura_assistida") {
    return PLATFORM_PLAN_ENTITLEMENTS[value];
  }
  return PLATFORM_PLAN_ENTITLEMENTS.essencial;
}
