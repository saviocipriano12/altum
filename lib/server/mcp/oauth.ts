import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { scopes, type Grant, type Scope } from "@/lib/mcp/contracts";
import { assertTenantAccess, assertTenantCapability, getTenantSettings } from "@/lib/server/tenant";
import { CommandError } from "@/lib/server/command-center/security";

type StoredCode = {
  userId?: string;
  tenantId?: string;
  clientId?: string;
  clientName?: string;
  redirectUri?: string;
  codeChallenge?: string;
  scopes?: string[];
  expiresAt?: unknown;
  consumedAt?: unknown;
};

type StoredToken = {
  userId?: string;
  tenantId?: string;
  clientId?: string;
  clientName?: string;
  scopes?: string[];
  refreshHash?: string;
  expiresAt?: unknown;
  refreshExpiresAt?: unknown;
  revokedAt?: unknown;
  createdAt?: unknown;
};

export type McpConnectionSummary = {
  id: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  status: "active" | "expired" | "revoked";
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export const MCP_REMOTE_PATH = "/api/mcp/remote";
export const MCP_AUTHORIZE_PATH = "/api/mcp/oauth/authorize";
export const MCP_TOKEN_PATH = "/api/mcp/oauth/token";
export const MCP_AUTHORIZE_PAGE_PATH = "/cliente/mcp/autorizar";
export const MCP_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const MCP_REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const MCP_AUTH_CODE_TTL_MS = 10 * 60 * 1000;

export function publicOrigin(req: Request) {
  const configured = String(process.env.ALTUM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.ALTUM_MCP_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export function endpoint(req: Request, path: string) {
  return `${publicOrigin(req)}${path}`;
}

export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function randomToken(prefix: string, bytes = 32) {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timestampMillis(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampIso(value: unknown) {
  const millis = timestampMillis(value);
  return millis == null ? null : new Date(millis).toISOString();
}

function safeRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

function codeChallengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function timingEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function clientFamily(clientId: string, clientName?: string) {
  const value = `${clientId} ${clientName || ""}`.toLowerCase();
  if (value.includes("chatgpt") || value.includes("openai")) return "chatgpt";
  if (value.includes("claude") || value.includes("anthropic")) return "claude";
  if (value.includes("cursor")) return "cursor";
  if (value.includes("codex")) return "codex";
  return "other";
}

export function parseScope(value: unknown): Scope[] {
  const requested = typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
  const valid = requested.filter((scope): scope is Scope => (scopes as readonly string[]).includes(scope));
  return valid.length ? Array.from(new Set(valid)) : [...scopes];
}

export function oauthMetadata(req: Request) {
  return {
    issuer: publicOrigin(req),
    authorization_endpoint: endpoint(req, MCP_AUTHORIZE_PATH),
    token_endpoint: endpoint(req, MCP_TOKEN_PATH),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: scopes,
  };
}

export function protectedResourceMetadata(req: Request) {
  return {
    resource: endpoint(req, MCP_REMOTE_PATH),
    authorization_servers: [publicOrigin(req)],
    scopes_supported: scopes,
    bearer_methods_supported: ["header"],
    resource_documentation: `${publicOrigin(req)}/cliente/painel/configuracoes/mcp`,
  };
}

export async function createAuthorizationCode(input: {
  req: Request;
  userId: string;
  userName: string;
  tenantId: string;
  clientId: string;
  clientName?: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  scope?: string;
}) {
  if (!safeRedirectUri(input.redirectUri)) throw new CommandError("INVALID_REDIRECT_URI", 400);
  if (!input.codeChallenge || input.codeChallenge.length < 32 || input.codeChallenge.length > 160) throw new CommandError("INVALID_INPUT", 400);

  const membership = await assertTenantAccess(input.userId, input.tenantId);
  assertTenantCapability(membership, "manage_settings");
  const settings = await getTenantSettings(input.tenantId);
  const mcp = settings?.mcp && typeof settings.mcp === "object" ? (settings.mcp as Record<string, unknown>) : {};
  if (mcp.enabled !== true) throw new CommandError("MCP_DISABLED", 403);
  const allowedClients = Array.isArray(mcp.allowedClients) ? mcp.allowedClients.map((item) => clean(item, 40)) : [];
  const family = clientFamily(input.clientId, input.clientName);
  if (allowedClients.length > 0 && !allowedClients.includes(family) && !allowedClients.includes("other")) {
    throw new CommandError("CLIENT_NOT_ALLOWED", 403);
  }

  const code = randomToken("mcp_code", 28);
  const codeHash = tokenHash(code);
  const now = Date.now();
  const selectedScopes = parseScope(input.scope);
  await adminDb.collection("mcp_oauth_codes").doc(codeHash).set({
    userId: input.userId,
    userName: input.userName,
    tenantId: input.tenantId,
    clientId: clean(input.clientId, 180),
    clientName: clean(input.clientName, 180),
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes: selectedScopes,
    expiresAt: Timestamp.fromMillis(now + MCP_AUTH_CODE_TTL_MS),
    createdAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection("audit_logs").add({
    type: "mcp_oauth_authorized",
    actorId: input.userId,
    actorName: input.userName,
    tenantId: input.tenantId,
    clientId: clean(input.clientId, 180),
    scopes: selectedScopes,
    createdAt: FieldValue.serverTimestamp(),
  });

  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set("code", code);
  if (input.state) redirect.searchParams.set("state", input.state);
  return redirect.toString();
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const codeHash = tokenHash(input.code);
  const ref = adminDb.collection("mcp_oauth_codes").doc(codeHash);
  const snap = await ref.get();
  if (!snap.exists) throw new CommandError("INVALID_GRANT", 400);
  const code = snap.data() as StoredCode;
  const expiresAt = timestampMillis(code.expiresAt);
  if (code.consumedAt || !expiresAt || expiresAt <= Date.now()) throw new CommandError("INVALID_GRANT", 400);
  if (code.clientId !== input.clientId || code.redirectUri !== input.redirectUri) throw new CommandError("INVALID_GRANT", 400);
  if (!code.codeChallenge || !timingEqual(code.codeChallenge, codeChallengeFor(input.codeVerifier))) throw new CommandError("INVALID_GRANT", 400);

  await ref.update({ consumedAt: FieldValue.serverTimestamp() });
  return issueTokens({
    userId: clean(code.userId, 180),
    tenantId: clean(code.tenantId, 180),
    clientId: clean(code.clientId, 180),
    clientName: clean(code.clientName, 180),
    scopes: parseScope((code.scopes || []).join(" ")),
  });
}

export async function refreshAccessToken(input: { refreshToken: string; clientId: string }) {
  const refreshHash = tokenHash(input.refreshToken);
  const snap = await adminDb.collection("mcp_oauth_tokens").where("refreshHash", "==", refreshHash).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) throw new CommandError("INVALID_GRANT", 400);
  const token = doc.data() as StoredToken;
  const refreshExpiresAt = timestampMillis(token.refreshExpiresAt);
  if (token.revokedAt || token.clientId !== input.clientId || !refreshExpiresAt || refreshExpiresAt <= Date.now()) throw new CommandError("INVALID_GRANT", 400);
  return issueTokens({
    userId: clean(token.userId, 180),
    tenantId: clean(token.tenantId, 180),
    clientId: clean(token.clientId, 180),
    clientName: clean(token.clientName, 180),
    scopes: parseScope((token.scopes || []).join(" ")),
  });
}

async function issueTokens(input: { userId: string; tenantId: string; clientId: string; clientName?: string; scopes: Scope[] }) {
  if (!input.userId || !input.tenantId || !input.clientId) throw new CommandError("INVALID_GRANT", 400);
  const accessToken = randomToken("mcp_at", 32);
  const refreshToken = randomToken("mcp_rt", 36);
  const now = Date.now();
  await adminDb.collection("mcp_oauth_tokens").doc(tokenHash(accessToken)).set({
    userId: input.userId,
    tenantId: input.tenantId,
    clientId: input.clientId,
    clientName: clean(input.clientName, 180),
    scopes: input.scopes,
    refreshHash: tokenHash(refreshToken),
    expiresAt: Timestamp.fromMillis(now + MCP_ACCESS_TOKEN_TTL_MS),
    refreshExpiresAt: Timestamp.fromMillis(now + MCP_REFRESH_TOKEN_TTL_MS),
    createdAt: FieldValue.serverTimestamp(),
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(MCP_ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: input.scopes.join(" "),
  };
}

export async function validateMcpAccessToken(rawToken: string): Promise<{ userId: string; tenantId: string; grant: Grant; clientId: string }> {
  if (!rawToken || rawToken.length > 4096) throw new CommandError("UNAUTHENTICATED", 401);
  const snap = await adminDb.collection("mcp_oauth_tokens").doc(tokenHash(rawToken)).get();
  if (!snap.exists) throw new CommandError("UNAUTHENTICATED", 401);
  const token = snap.data() as StoredToken;
  const expiresAt = timestampMillis(token.expiresAt);
  if (token.revokedAt || !expiresAt || expiresAt <= Date.now()) throw new CommandError("UNAUTHENTICATED", 401);

  const userId = clean(token.userId, 180);
  const tenantId = clean(token.tenantId, 180);
  const settings = await getTenantSettings(tenantId);
  const mcp = settings?.mcp && typeof settings.mcp === "object" ? (settings.mcp as Record<string, unknown>) : {};
  if (mcp.enabled !== true) throw new CommandError("MCP_DISABLED", 403);

  return {
    userId,
    tenantId,
    clientId: clean(token.clientId, 180),
    grant: {
      userId,
      tenantId,
      scopes: parseScope((token.scopes || []).join(" ")),
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

export async function listMcpConnections(tenantId: string): Promise<McpConnectionSummary[]> {
  const snap = await adminDb.collection("mcp_oauth_tokens").where("tenantId", "==", tenantId).limit(100).get();
  const now = Date.now();
  return snap.docs.map((doc) => {
    const token = doc.data() as StoredToken;
    const expiresAt = timestampMillis(token.expiresAt);
    const revokedAt = timestampMillis(token.revokedAt);
    const status: McpConnectionSummary["status"] = revokedAt ? "revoked" : expiresAt && expiresAt <= now ? "expired" : "active";
    return {
      id: doc.id,
      clientId: clean(token.clientId, 180),
      clientName: clean(token.clientName, 180) || clean(token.clientId, 180) || "Cliente MCP",
      scopes: Array.isArray(token.scopes) ? token.scopes.map((scope) => clean(scope, 80)).filter(Boolean) : [],
      status,
      createdAt: timestampIso(token.createdAt),
      expiresAt: timestampIso(token.expiresAt),
      revokedAt: timestampIso(token.revokedAt),
    };
  }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function revokeMcpConnection(tenantId: string, connectionId: string, actorId: string, actorName: string) {
  const safeId = clean(connectionId, 160);
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(safeId)) throw new CommandError("INVALID_INPUT", 400);
  const ref = adminDb.collection("mcp_oauth_tokens").doc(safeId);
  const snap = await ref.get();
  if (!snap.exists) throw new CommandError("NOT_FOUND", 404);
  const token = snap.data() as StoredToken;
  if (token.tenantId !== tenantId) throw new CommandError("FORBIDDEN", 403);
  await Promise.all([
    ref.set({ revokedAt: FieldValue.serverTimestamp(), revokedBy: actorId, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    adminDb.collection("audit_logs").add({
      type: "mcp_connection_revoked",
      actorId,
      actorName,
      tenantId,
      connectionId: safeId,
      clientId: clean(token.clientId, 180),
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}
