import { adminDb } from "@/app/lib/server/firebase-admin";

export const TENANT_SCOPED_COLLECTIONS = [
  "chats",
  "chat_notes",
  "messages",
  "leads",
  "lead_notes",
  "lead_tasks",
  "pipeline",
  "kb_docs",
  "chat_state",
  "ai_logs",
  "ai_usage_ledger",
  "automations",
  "jobs",
  "metrics",
  "capture_forms",
  "capture_submissions",
  "orcamentos",
  "financeiro",
  "whatsapp_webhook_events",
  "meta_webhook_events",
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

export type TenantCapability =
  | "view_metrics"
  | "respond_inbox"
  | "edit_leads"
  | "manage_pipeline"
  | "manage_commercial"
  | "manage_ai"
  | "manage_automations"
  | "manage_channels"
  | "manage_users"
  | "manage_settings";

export const TENANT_CAPABILITIES: TenantCapability[] = [
  "view_metrics",
  "respond_inbox",
  "edit_leads",
  "manage_pipeline",
  "manage_commercial",
  "manage_ai",
  "manage_automations",
  "manage_channels",
  "manage_users",
  "manage_settings",
];

export type TenantMembership = {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantUserRole;
  status: "active" | "blocked";
  isDefault: boolean;
  capabilities: TenantCapability[];
};

export type TenantSettings = {
  ai?: {
    enabled?: boolean;
    toneOfVoice?: string;
    businessSummary?: string;
    objective?: string;
    responsiblePhone?: string;
    guardrails?: string[] | string;
    mandatoryQuestions?: string[] | string;
    escalationTopics?: string[] | string;
    operatingProfile?: {
      tier?: "essential" | "growth" | "premium" | "elite" | "enterprise";
      autonomyMode?: "copilot" | "hybrid" | "autonomous";
      reasoningLevel?: "fast" | "balanced" | "deep";
      responseStyle?: "concise" | "consultative" | "premium_sales" | "closer";
      preferredProviders?: string[] | string;
      conversationModelOverride?: string;
      extractionModelOverride?: string;
      monthlyBudgetUsd?: number;
      monthlyUsageCap?: number;
    };
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

const TENANT_ROLE_ORDER: Record<TenantUserRole, number> = {
  client: 10,
  client_viewer: 10,
  client_agent: 20,
  client_admin: 30,
  client_owner: 40,
  agency_agent: 90,
  agency_admin: 100,
  agency_owner: 110,
};

const DEFAULT_CAPABILITIES_BY_ROLE: Record<TenantUserRole, TenantCapability[]> = {
  client: ["view_metrics"],
  client_viewer: ["view_metrics"],
  client_agent: ["view_metrics", "respond_inbox", "edit_leads", "manage_pipeline", "manage_commercial"],
  client_admin: [...TENANT_CAPABILITIES],
  client_owner: [...TENANT_CAPABILITIES],
  agency_agent: [...TENANT_CAPABILITIES],
  agency_admin: [...TENANT_CAPABILITIES],
  agency_owner: [...TENANT_CAPABILITIES],
};

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

function normalizeCapabilities(value: unknown): TenantCapability[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item): item is TenantCapability => TENANT_CAPABILITIES.includes(item as TenantCapability))
    )
  );
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
    capabilities: normalizeCapabilities(data.capabilities),
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

function isGlobalAgencyAdminRole(role: unknown) {
  return role === "agency_owner" || role === "agency_admin" || role === "admin";
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
          capabilities: [],
        };
      }
    }

    const [userSnap, tenantSnap] = await Promise.all([
      adminDb.collection("users").doc(normalizedUserId).get(),
      adminDb.collection("tenants").doc(normalizedTenantId).get(),
    ]);

    if (tenantSnap.exists && userSnap.exists) {
      const userData = userSnap.data() as { role?: string; status?: string };
      const userStatus = userData.status === "blocked" ? "blocked" : "active";
      if (userStatus === "active" && isGlobalAgencyAdminRole(userData.role)) {
        return {
          id: `agency_global_${normalizedTenantId}_${normalizedUserId}`,
          tenantId: normalizedTenantId,
          userId: normalizedUserId,
          role: userData.role === "agency_owner" || userData.role === "admin" ? "agency_owner" : "agency_admin",
          status: "active",
          isDefault: false,
          capabilities: [],
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

export function hasRequiredTenantRole(
  membership: Pick<TenantMembership, "role" | "status">,
  minimumRole: TenantUserRole
) {
  if (membership.status !== "active") return false;
  return TENANT_ROLE_ORDER[membership.role] >= TENANT_ROLE_ORDER[minimumRole];
}

export function assertTenantRole(
  membership: Pick<TenantMembership, "role" | "status">,
  minimumRole: TenantUserRole
) {
  if (!hasRequiredTenantRole(membership, minimumRole)) {
    throw new TenantAccessError("tenant_role_denied", "Perfil sem permissao para esta operacao.");
  }
}

export function getTenantCapabilities(membership: Pick<TenantMembership, "role" | "status" | "capabilities">) {
  if (membership.status !== "active") return [] as TenantCapability[];
  return membership.capabilities.length > 0
    ? membership.capabilities
    : DEFAULT_CAPABILITIES_BY_ROLE[membership.role] || [];
}

export function hasTenantCapability(
  membership: Pick<TenantMembership, "role" | "status" | "capabilities">,
  capability: TenantCapability
) {
  return getTenantCapabilities(membership).includes(capability);
}

export function assertTenantCapability(
  membership: Pick<TenantMembership, "role" | "status" | "capabilities">,
  capability: TenantCapability
) {
  if (!hasTenantCapability(membership, capability)) {
    throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para esta operacao.");
  }
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
