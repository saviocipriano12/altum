import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  buildLegacyTenantEntitlements,
  hasTenantModule,
  normalizeTenantEntitlements,
  type TenantEntitlementsSnapshot,
  type TenantLimitId,
  type TenantModuleId,
} from "@/lib/tenant-entitlements";
import { TenantAccessError } from "@/lib/server/tenant";

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function getTenantEntitlements(tenantId: string): Promise<TenantEntitlementsSnapshot> {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) {
    throw new TenantAccessError("invalid_tenant_context", "Tenant invalido para consultar modulos.");
  }

  const snap = await adminDb.collection("tenant_entitlements").doc(normalizedTenantId).get();
  if (!snap.exists) return buildLegacyTenantEntitlements(normalizedTenantId);

  const data = snap.data() as Record<string, unknown>;
  return normalizeTenantEntitlements(normalizedTenantId, {
    ...data,
    updatedAt: timestampToIso(data.updatedAt),
  });
}

export async function assertTenantModule(tenantId: string, moduleId: TenantModuleId) {
  const entitlements = await getTenantEntitlements(tenantId);
  if (!hasTenantModule(entitlements, moduleId)) {
    throw new TenantAccessError(
      "tenant_module_denied",
      `O modulo ${moduleId} nao esta contratado por esta empresa.`
    );
  }
  return entitlements;
}

export async function assertTenantLimitAvailable(input: {
  tenantId: string;
  limitId: TenantLimitId;
  currentUsage: number;
  increment?: number;
}) {
  const entitlements = await getTenantEntitlements(input.tenantId);
  const configuredLimit = Number(entitlements.limits[input.limitId] || 0);
  const requestedUsage = Math.max(0, Number(input.currentUsage || 0)) + Math.max(0, Number(input.increment ?? 1));
  if (configuredLimit > 0 && requestedUsage > configuredLimit) {
    throw new TenantAccessError(
      "tenant_limit_exceeded",
      `O limite contratado de ${input.limitId} foi atingido.`
    );
  }
  return entitlements;
}
