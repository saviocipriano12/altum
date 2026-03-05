import { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";

export type PortalUserStatus = "active" | "blocked";

export type PortalUserDoc = {
  uid: string;
  email: string;
  name?: string;
  clientId: string;
  clientName?: string;
  status: PortalUserStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PortalRequestUser = {
  uid: string;
  email: string;
  name: string;
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

export async function requirePortalRequestUser(req: Request): Promise<PortalRequestUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new PortalAuthError(401, "missing_token", "Token de autenticação ausente.");
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new PortalAuthError(401, "invalid_token", "Token de autenticação inválido.");
  }

  const portalRef = adminDb.collection("client_portal_users").doc(decoded.uid);
  const portalSnap = await portalRef.get();
  if (!portalSnap.exists) {
    throw new PortalAuthError(403, "portal_user_not_found", "Acesso ao portal não encontrado.");
  }

  const portalData = portalSnap.data() as Partial<PortalUserDoc>;
  const status = normalizeStatus(portalData.status);
  if (status !== "active") {
    throw new PortalAuthError(403, "blocked_portal_user", "Usuário do portal bloqueado.");
  }

  if (!portalData.clientId) {
    throw new PortalAuthError(403, "portal_client_missing", "Cliente do portal não configurado.");
  }

  return {
    uid: decoded.uid,
    email: portalData.email || decoded.email || "",
    name: portalData.name || decoded.name || "Cliente",
    clientId: portalData.clientId,
    clientName: portalData.clientName || "Cliente",
    status,
    token: decoded,
  };
}
