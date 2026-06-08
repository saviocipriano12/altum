import { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";

export type LegacyUserRole = "admin" | "closer" | "sdr" | "client";
export type AgencyUserRole = "agency_owner" | "agency_admin" | "agency_agent";
export type ClientUserRole = "client_owner" | "client_admin" | "client_agent" | "client_viewer";
export type UserRole = LegacyUserRole | AgencyUserRole | ClientUserRole;
export type UserStatus = "active" | "blocked";

export type UserDoc = {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  commissionRate: number;
  asaasWalletId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type RequestUser = {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  token: DecodedIdToken;
};

export class RouteAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ROLE_NORMALIZATION: Record<string, UserRole> = {
  admin: "admin",
  closer: "closer",
  sdr: "sdr",
  client: "client",
  agency_owner: "agency_owner",
  agency_admin: "agency_admin",
  agency_agent: "agency_agent",
  client_owner: "client_owner",
  client_admin: "client_admin",
  client_agent: "client_agent",
  client_viewer: "client_viewer",
};

export const AGENCY_ADMIN_ROLES: UserRole[] = ["agency_owner", "agency_admin", "admin"];
export const AGENCY_MEMBER_ROLES: UserRole[] = [
  ...AGENCY_ADMIN_ROLES,
  "agency_agent",
  "closer",
  "sdr",
];
export const CLIENT_PANEL_ROLES: UserRole[] = [
  "client_owner",
  "client_admin",
  "client_agent",
  "client_viewer",
  "client",
];

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function normalizeRole(value: unknown): UserRole {
  if (typeof value === "string") {
    const normalized = ROLE_NORMALIZATION[value.trim().toLowerCase()];
    if (normalized) return normalized;
  }
  return "agency_agent";
}

function normalizeStatus(value: unknown): UserStatus {
  return value === "blocked" ? "blocked" : "active";
}

function isResourceExhausted(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const details = "details" in error ? String((error as { details?: unknown }).details || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "8" || details.includes("Quota exceeded") || message.includes("RESOURCE_EXHAUSTED");
}

type CanonicalRole =
  | "agency_owner"
  | "agency_admin"
  | "agency_agent"
  | "client_owner"
  | "client_admin"
  | "client_agent"
  | "client_viewer";

function toCanonicalRole(role: UserRole): CanonicalRole {
  if (role === "admin") return "agency_owner";
  if (role === "closer" || role === "sdr") return "agency_agent";
  if (role === "client") return "client_viewer";
  return role;
}

function roleMatchesRequired(actualRole: UserRole, requiredRole: UserRole) {
  const actual = toCanonicalRole(actualRole);
  const required = toCanonicalRole(requiredRole);

  if (required === "agency_owner") return actual === "agency_owner";
  if (required === "agency_admin") return actual === "agency_owner" || actual === "agency_admin";
  if (required === "agency_agent") {
    return actual === "agency_owner" || actual === "agency_admin" || actual === "agency_agent";
  }

  if (required === "client_owner") return actual === "client_owner";
  if (required === "client_admin") return actual === "client_owner" || actual === "client_admin";
  if (required === "client_agent") {
    return actual === "client_owner" || actual === "client_admin" || actual === "client_agent";
  }
  return (
    actual === "client_owner" ||
    actual === "client_admin" ||
    actual === "client_agent" ||
    actual === "client_viewer"
  );
}

export async function requireRequestUser(
  req: Request,
  options?: { roles?: UserRole[]; allowBlocked?: boolean }
): Promise<RequestUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new RouteAuthError(401, "missing_token", "Token de autenticacao ausente.");
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
    throw new RouteAuthError(401, "invalid_token", "Token de autenticacao invalido.");
  }

  const userRef = adminDb.collection("users").doc(decoded.uid);
  const userSnap = await userRef.get().catch((error) => {
    if (isResourceExhausted(error)) {
      throw new RouteAuthError(
        429,
        "firebase_quota_exceeded",
        "A cota do Firebase/Firestore foi excedida. Aguarde a liberacao da cota ou ative billing no Firebase."
      );
    }
    throw error;
  });
  if (!userSnap.exists) {
    throw new RouteAuthError(403, "profile_not_found", "Perfil de usuario nao encontrado.");
  }

  const userData = userSnap.data() as Partial<UserDoc>;
  const role = normalizeRole(userData.role);
  const status = normalizeStatus(userData.status);

  if (!options?.allowBlocked && status !== "active") {
    throw new RouteAuthError(403, "blocked_user", "Usuario bloqueado.");
  }

  if (
    options?.roles?.length &&
    !options.roles.some((requiredRole) => roleMatchesRequired(role, requiredRole))
  ) {
    throw new RouteAuthError(403, "forbidden_role", "Sem permissao para esta operacao.");
  }

  return {
    uid: decoded.uid,
    email: userData.email || decoded.email || "",
    name: userData.name || decoded.name || "Usuario",
    role,
    status,
    token: decoded,
  };
}

export function isAdmin(user: RequestUser) {
  return AGENCY_ADMIN_ROLES.some((role) => roleMatchesRequired(user.role, role));
}

export function isAgencyUser(user: RequestUser) {
  return AGENCY_MEMBER_ROLES.some((role) => roleMatchesRequired(user.role, role));
}

export function isClientUser(user: RequestUser) {
  return CLIENT_PANEL_ROLES.some((role) => roleMatchesRequired(user.role, role));
}
