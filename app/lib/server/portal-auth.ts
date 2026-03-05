import { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { getDefaultTenantMembershipForUser, getTenantSettings } from "@/lib/server/tenant";

export type PortalUserStatus = "active" | "blocked";
export type PortalTenantRole = "client_owner" | "client_admin" | "client_agent" | "client_viewer" | "client";

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
  token: DecodedIdToken;
};

export class PortalAuthError extends Error {
  status: number;
  code: string;

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

function normalizeClientRole(value: unknown): PortalTenantRole {
  if (
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

function isClientRole(value: unknown) {
  return (
    value === "client_owner" ||
    value === "client_admin" ||
    value === "client_agent" ||
    value === "client_viewer" ||
    value === "client"
  );
}

export async function requirePortalRequestUser(req: Request): Promise<PortalRequestUser> {
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

  const membership = await getDefaultTenantMembershipForUser(decoded.uid);
  if (membership) {
    if (membership.status !== "active") {
      throw new PortalAuthError(403, "blocked_portal_user", "Usuario do portal bloqueado.");
    }

    if (!isClientRole(membership.role)) {
      throw new PortalAuthError(403, "forbidden_portal_role", "Perfil sem acesso ao painel do cliente.");
    }

    const tenantSnap = await adminDb.collection("tenants").doc(membership.tenantId).get();
    const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
    const settings = await getTenantSettings(membership.tenantId);

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
      tenantRole: normalizeClientRole(membership.role),
      clientId: membership.tenantId,
      clientName: tenantName,
      status: "active",
      token: decoded,
    };
  }

  const portalRef = adminDb.collection("client_portal_users").doc(decoded.uid);
  const portalSnap = await portalRef.get();
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

  return {
    uid: decoded.uid,
    email: portalData.email || decoded.email || "",
    name: portalData.name || decoded.name || "Cliente",
    tenantId,
    tenantName: portalData.tenantName || portalData.clientName || "Cliente",
    tenantRole: normalizeClientRole(portalData.role),
    clientId: String(portalData.clientId || tenantId),
    clientName: portalData.clientName || portalData.tenantName || "Cliente",
    status,
    token: decoded,
  };
}
