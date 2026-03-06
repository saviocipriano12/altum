import { adminDb } from "@/app/lib/server/firebase-admin";

export const TENANT_SCOPED_COLLECTIONS = [
  "chats",
  "messages",
  "leads",
  "pipeline",
  "kb_docs",
  "chat_state",
  "ai_logs",
  "automations",
  "jobs",
  "metrics",
] as const;

export type TenantUserRole =
  | "agency_owner"
  | "agency_admin"
  | "agency_agent"
  | "client_owner"
  | "client_admin"
  | "client_agent"
  | "client_viewer"
  | "client";

export type TenantMembership = {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantUserRole;
  status: "active" | "blocked";
  isDefault: boolean;
};

export type TenantSettings = {
  ai?: {
    enabled?: boolean;
    toneOfVoice?: string;
    businessSummary?: string;
    responsiblePhone?: string;
    guardrails?: string[] | string;
  };
  tenantId: string;
  name?: string;
  niche?: string;
  ownerName?: string;
  contactName?: string;
  timezone?: string;
  businessHours?: string;
  rules?: Record<string, unknown>;
  [key: string]: unknown;
};

export class TenantAccessError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function normalizeRole(value: unknown): TenantUserRole {
  if (typeof value !== "string") return "client_viewer";
  const role = value.trim().toLowerCase();
  if (
    role === "agency_owner" ||
    role === "agency_admin" ||
    role === "agency_agent" ||
    role === "client_owner" ||
    role === "client_admin" ||
    role === "client_agent" ||
    role === "client_viewer" ||
    role === "client"
  ) {
    return role;
  }
  return "client_viewer";
}

function normalizeMembership(
  id: string,
  data: Record<string, unknown>
): TenantMembership | null {
  const tenantId = typeof data.tenantId === "string" ? data.tenantId.trim() : "";
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";

  if (!tenantId || !userId) return null;

  return {
    id,
    tenantId,
    userId,
    role: normalizeRole(data.role),
    status: data.status === "blocked" ? "blocked" : "active",
    isDefault: Boolean(data.isDefault),
  };
}

async function listMembershipsForUser(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [] as TenantMembership[];

  const snap = await adminDb
    .collection("tenant_users")
    .where("userId", "==", normalizedUserId)
    .limit(50)
    .get();

  const memberships = snap.docs
    .map((doc) => normalizeMembership(doc.id, doc.data() as Record<string, unknown>))
    .filter((item): item is TenantMembership => Boolean(item));

  if (memberships.length > 0) return memberships;

  const direct = await adminDb.collection("tenant_users").doc(normalizedUserId).get();
  if (!direct.exists) return memberships;

  const parsed = normalizeMembership(direct.id, direct.data() as Record<string, unknown>);
  return parsed ? [parsed] : memberships;
}

export async function getDefaultTenantMembershipForUser(userId: string) {
  const memberships = await listMembershipsForUser(userId);
  if (memberships.length === 0) return null;

  const active = memberships.filter((item) => item.status === "active");
  if (active.length === 0) return null;

  const preferred = active.find((item) => item.isDefault);
  if (preferred) return preferred;

  return active[0];
}

export async function getTenantForCurrentUser(userId: string): Promise<string | null> {
  const membership = await getDefaultTenantMembershipForUser(userId);
  return membership?.tenantId || null;
}

export async function assertTenantAccess(userId: string, tenantId: string): Promise<TenantMembership> {
  const normalizedUserId = userId.trim();
  const normalizedTenantId = tenantId.trim();

  if (!normalizedUserId || !normalizedTenantId) {
    throw new TenantAccessError("invalid_tenant_context", "Tenant ou usuario invalido.");
  }

  const snap = await adminDb
    .collection("tenant_users")
    .where("userId", "==", normalizedUserId)
    .where("tenantId", "==", normalizedTenantId)
    .limit(1)
    .get();

  if (snap.empty) {
    const compositeId = `${normalizedTenantId}_${normalizedUserId}`;
    const direct = await adminDb.collection("tenant_users").doc(compositeId).get();
    if (direct.exists) {
      const parsed = normalizeMembership(direct.id, direct.data() as Record<string, unknown>);
      if (parsed && parsed.status === "active") {
        return parsed;
      }
    }

    const legacyPortal = await adminDb.collection("client_portal_users").doc(normalizedUserId).get();
    if (legacyPortal.exists) {
      const legacy = legacyPortal.data() as {
        tenantId?: string;
        clientId?: string;
        status?: string;
      };
      const legacyTenantId = String(legacy.tenantId || legacy.clientId || "").trim();
      const legacyStatus = legacy.status === "blocked" ? "blocked" : "active";
      if (legacyTenantId === normalizedTenantId && legacyStatus === "active") {
        return {
          id: `legacy_${normalizedTenantId}_${normalizedUserId}`,
          tenantId: normalizedTenantId,
          userId: normalizedUserId,
          role: "client_viewer",
          status: "active",
          isDefault: true,
        };
      }
    }

    throw new TenantAccessError("tenant_access_denied", "Usuario sem acesso a este tenant.");
  }

  const membership = normalizeMembership(
    snap.docs[0].id,
    snap.docs[0].data() as Record<string, unknown>
  );

  if (!membership || membership.status !== "active") {
    throw new TenantAccessError("tenant_access_denied", "Usuario sem acesso a este tenant.");
  }

  return membership;
}

export async function getTenantSettings(tenantId: string): Promise<TenantSettings | null> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) return null;

  const byDocId = await adminDb.collection("tenant_settings").doc(normalizedTenantId).get();
  if (byDocId.exists) {
    return {
      tenantId: normalizedTenantId,
      ...(byDocId.data() as Record<string, unknown>),
    };
  }

  const byField = await adminDb
    .collection("tenant_settings")
    .where("tenantId", "==", normalizedTenantId)
    .limit(1)
    .get();

  if (byField.empty) return null;

  return {
    tenantId: normalizedTenantId,
    ...(byField.docs[0].data() as Record<string, unknown>),
  };
}
