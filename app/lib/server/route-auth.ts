import { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";

export type UserRole = "admin" | "closer" | "sdr" | "client";
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

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function normalizeRole(value: unknown): UserRole {
  if (value === "admin" || value === "closer" || value === "sdr" || value === "client") return value;
  return "sdr";
}

function normalizeStatus(value: unknown): UserStatus {
  return value === "blocked" ? "blocked" : "active";
}

export async function requireRequestUser(
  req: Request,
  options?: { roles?: UserRole[]; allowBlocked?: boolean }
): Promise<RequestUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new RouteAuthError(401, "missing_token", "Token de autenticação ausente.");
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new RouteAuthError(401, "invalid_token", "Token de autenticação inválido.");
  }

  const userRef = adminDb.collection("users").doc(decoded.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new RouteAuthError(403, "profile_not_found", "Perfil de usuário não encontrado.");
  }

  const userData = userSnap.data() as Partial<UserDoc>;
  const role = normalizeRole(userData.role);
  const status = normalizeStatus(userData.status);

  if (!options?.allowBlocked && status !== "active") {
    throw new RouteAuthError(403, "blocked_user", "Usuário bloqueado.");
  }

  if (options?.roles?.length && !options.roles.includes(role)) {
    throw new RouteAuthError(403, "forbidden_role", "Sem permissão para esta operação.");
  }

  return {
    uid: decoded.uid,
    email: userData.email || decoded.email || "",
    name: userData.name || decoded.name || "Usuário",
    role,
    status,
    token: decoded,
  };
}

export function isAdmin(user: RequestUser) {
  return user.role === "admin";
}
