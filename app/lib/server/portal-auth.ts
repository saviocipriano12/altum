import { getTenantBillingAccessDenial } from "@/lib/tenant-billing-access";
import { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import {
  getTenantMembershipForUser,
  getDefaultTenantMembershipForUser,
  getTenantCapabilities,
  getTenantSettings,
  isTenantBillingBlocked,
  type TenantCapability,
} from "@/lib/server/tenant";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import type { TenantEntitlementsSnapshot } from "@/lib/tenant-entitlements";

export type PortalUserStatus = "active" | "blocked";
export type PortalTenantRole =
  | "agency_owner"
  | "agency_admin"
  | "agency_agent"
  | "client_owner"
  | "client_admin"
  | "client_agent"
  | "client_viewer"
  | "client";

export type PortalUserDoc = {
  uid: string;
  email: string;
  name?: string;
  clientId?: string;
  tenantId?: string;
  clientName?: string;
  tenantName?: string;
  role?: PortalTenantRole;
  status: PortalUserStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PortalRequestUser = {
  uid: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  tenantRole: PortalTenantRole;
  clientId: string;
  clientName: string;
  status: PortalUserStatus;
  capabilities: TenantCapability[];
  entitlements: TenantEntitlementsSnapshot;
  token: DecodedIdToken;
};

export class PortalAuthError extends Error {
  status: number;
  code: string;
  tenantId?: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function normalizeStatus(value: unknown): PortalUserStatus {
  return value === "blocked" ? "blocked" : "active";
}

function isResourceExhausted(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const details = "details" in error ? String((error as { details?: unknown }).details || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "8" || details.includes("Quota exceeded") || message.includes("RESOURCE_EXHAUSTED");
}

function quotaExceededError() {
  return new PortalAuthError(
    429,
    "firebase_quota_exceeded",
    "A cota do Firebase/Firestore foi excedida. Aguarde a liberacao da cota ou ative billing no Firebase."
  );
}

function normalizePortalRole(value: unknown): PortalTenantRole {
  if (
    value === "agency_owner" ||
    value === "agency_admin" ||
    value === "agency_agent" ||
    value === "client_owner" ||
    value === "client_admin" ||
    value === "client_agent" ||
    value === "client_viewer" ||
    value === "client"
  ) {
    return value;
  }
  return "client_viewer";
}

function isPortalRole(value: unknown) {
  return (
    value === "agency_owner" ||
    value === "agency_admin" ||
    value === "agency_agent" ||
    value === "client_owner" ||
    value === "client_admin" ||
    value === "client_agent" ||
    value === "client_viewer" ||
    value === "client"
  );
}

async function buildPortalUserFromMembershipUnchecked(
  decoded: DecodedIdToken,
  membership: Awaited<ReturnType<typeof getDefaultTenantMembershipForUser>>
) {
  if (!membership) return null;
  if (membership.status !== "active") {
    throw new PortalAuthError(403, "blocked_portal_user", "Usuario do portal bloqueado.");
  }

  if (!isPortalRole(membership.role)) {
    throw new PortalAuthError(403, "forbidden_portal_role", "Perfil sem acesso ao painel do cliente.");
  }

  const tenantSnap = await adminDb.collection("tenants").doc(membership.tenantId).get().catch((error) => {
    if (isResourceExhausted(error)) throw quotaExceededError();
    throw error;
  });
  const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
  if (tenantData.signupSource === "self_service" && !decoded.email_verified) {
    throw new PortalAuthError(403, "email_not_verified", "Confirme seu e-mail antes de acessar a plataforma.");
  }
  const billingDenial = getTenantBillingAccessDenial(tenantData);
  if (billingDenial) throw new PortalAuthError(billingDenial.status, billingDenial.code, billingDenial.message);
  const settings = await getTenantSettings(membership.tenantId).catch((error) => {
    console.warn("Falha ao carregar configuracoes do tenant no portal:", membership.tenantId, error);
    return null;
  });
  const entitlements = await getTenantEntitlements(membership.tenantId);

  const tenantName =
    (typeof settings?.name === "string" ? settings.name : "") ||
    (typeof tenantData.name === "string" ? String(tenantData.name) : "") ||
    "Cliente";

  return {
    uid: decoded.uid,
    email: decoded.email || "",
    name: decoded.name || "Cliente",
    tenantId: membership.tenantId,
    tenantName,
    tenantRole: normalizePortalRole(membership.role),
    clientId: membership.tenantId,
    clientName: tenantName,
    status: "active" as const,
    capabilities: getTenantCapabilities(membership),
    entitlements,
    token: decoded,
  };
}

async function buildPortalUserFromMembership(
  decoded: DecodedIdToken,
  membership: Awaited<ReturnType<typeof getDefaultTenantMembershipForUser>>
) {
  try { return await buildPortalUserFromMembershipUnchecked(decoded, membership); }
  catch (error) {
    if (error instanceof PortalAuthError) error.tenantId = membership?.tenantId;
    throw error;
  }
}

export async function requirePortalRequestUser(
  req: Request,
  options?: { tenantId?: string }
): Promise<PortalRequestUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new PortalAuthError(401, "missing_token", "Token de autenticacao ausente.");
  }

  let decoded: DecodedIdToken;
  try {
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message || "")
          : "";

      const allowCredentialFallback =
        code === "app/invalid-credential" ||
        code === "auth/insufficient-permission" ||
        message.includes("Credential implementation provided") ||
        message.includes("insufficient permission") ||
        message.includes("Failed to determine service account");

      if (!allowCredentialFallback) {
        throw error;
      }

      decoded = await adminAuth.verifyIdToken(token);
    }
  } catch {
    throw new PortalAuthError(401, "invalid_token", "Token de autenticacao invalido.");
  }

  const requestedTenantId = String(options?.tenantId || "").trim();
  if (requestedTenantId) {
    try {
      const requestedMembership = await getTenantMembershipForUser(decoded.uid, requestedTenantId);
      const requestedPortalUser = await buildPortalUserFromMembership(decoded, requestedMembership);
      if (requestedPortalUser) {
        return requestedPortalUser;
      }
    } catch (error) {
      if (isResourceExhausted(error)) throw quotaExceededError();
      throw error;
    }
  }

  const membership = requestedTenantId ? null : await getDefaultTenantMembershipForUser(decoded.uid).catch((error) => {
    if (isResourceExhausted(error)) throw quotaExceededError();
    throw error;
  });
  if (membership) {
    const portalUser = await buildPortalUserFromMembership(decoded, membership);
    if (portalUser) return portalUser;
  }

  const portalRef = adminDb.collection("client_portal_users").doc(decoded.uid);
  const portalSnap = await portalRef.get().catch((error) => {
    if (isResourceExhausted(error)) throw quotaExceededError();
    throw error;
  });
  if (!portalSnap.exists) {
    throw new PortalAuthError(403, "portal_user_not_found", "Acesso ao portal nao encontrado.");
  }

  const portalData = portalSnap.data() as Partial<PortalUserDoc>;
  const status = normalizeStatus(portalData.status);
  if (status !== "active") {
    throw new PortalAuthError(403, "blocked_portal_user", "Usuario do portal bloqueado.");
  }

  const tenantId = String(portalData.tenantId || portalData.clientId || "").trim();
  if (!tenantId) {
    throw new PortalAuthError(403, "portal_tenant_missing", "Tenant do portal nao configurado.");
  }
  if (requestedTenantId && tenantId !== requestedTenantId) {
    throw new PortalAuthError(403, "portal_user_not_found", "Acesso a esta empresa nao encontrado.");
  }

  const billingBlocked = await isTenantBillingBlocked(tenantId).catch((error) => {
    if (isResourceExhausted(error)) throw quotaExceededError();
    throw error;
  });
  if (billingBlocked) {
    const error = new PortalAuthError(403, "tenant_billing_blocked", "Acesso ao portal pausado por pendencia financeira.");
    error.tenantId = tenantId;
    throw error;
  }
  const entitlements = await getTenantEntitlements(tenantId);

  return {
    uid: decoded.uid,
    email: portalData.email || decoded.email || "",
    name: portalData.name || decoded.name || "Cliente",
    tenantId,
    tenantName: portalData.tenantName || portalData.clientName || "Cliente",
    tenantRole: normalizePortalRole(portalData.role),
    clientId: String(portalData.clientId || tenantId),
    clientName: portalData.clientName || portalData.tenantName || "Cliente",
    status,
    capabilities: getTenantCapabilities({
      role: normalizePortalRole(portalData.role),
      status,
      capabilities: [],
    }),
    entitlements,
    token: decoded,
  };
}
