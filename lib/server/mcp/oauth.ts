import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { scopes, type Grant, type Scope } from "@/lib/mcp/contracts";
import { isChatGptClientMetadataUrl, isChatGptOAuthRedirect, parseMcpOAuthScopes } from "@/lib/mcp/oauth-contract";
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
  offline?: boolean;
  audience?: string;
  expiresAt?: unknown;
  consumedAt?: unknown;
};

type StoredToken = {
  userId?: string;
  tenantId?: string;
  clientId?: string;
  clientName?: string;
  scopes?: string[];
  audience?: string;
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
  return parseMcpOAuthScopes(value, true).scopes;
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
    scopes_supported: [...scopes, "offline_access"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
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
  resource?: string;
}) {
  if (!safeRedirectUri(input.redirectUri)) throw new CommandError("INVALID_REDIRECT_URI", 400);
  if (!input.codeChallenge || input.codeChallenge.length < 32 || input.codeChallenge.length > 160) throw new CommandError("INVALID_INPUT", 400);

  const audience = endpoint(input.req, MCP_REMOTE_PATH);
  if (input.resource && input.resource !== audience) throw new CommandError("INVALID_TARGET", 400);
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
  if (isChatGptClientMetadataUrl(input.clientId)) {
    if (!isChatGptOAuthRedirect(input.redirectUri)) throw new CommandError("UNAUTHORIZED_CLIENT", 400);
    await verifyChatGptClientMetadata(input.clientId, input.redirectUri);
  }

  const code = randomToken("mcp_code", 28);
  const codeHash = tokenHash(code);
  const now = Date.now();
  let requested;
  try {
    requested = parseMcpOAuthScopes(input.scope, true);
  } catch {
    throw new CommandError("INVALID_SCOPE", 400);
  }
  await adminDb.collection("mcp_oauth_codes").doc(codeHash).set({
    userId: input.userId,
    userName: input.userName,
    tenantId: input.tenantId,
    clientId: clean(input.clientId, 500),
    clientName: clean(input.clientName, 180),
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes: requested.scopes,
    offline: requested.offline,
    audience,
    expiresAt: Timestamp.fromMillis(now + MCP_AUTH_CODE_TTL_MS),
    createdAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection("audit_logs").add({
    type: "mcp_oauth_authorized",
    actorId: input.userId,
    actorName: input.userName,
    tenantId: input.tenantId,
    clientId: clean(input.clientId, 500),
    scopes: requested.scopes,
    createdAt: FieldValue.serverTimestamp(),
  });

  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("iss", publicOrigin(input.req));
  if (input.state) redirect.searchParams.set("state", input.state);
  return redirect.toString();
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
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
  const audience = clean(code.audience, 500);
  if (!audience || (input.resource && input.resource !== audience)) throw new CommandError("INVALID_TARGET", 400);
  const issued = buildTokenIssue({
    userId: clean(code.userId, 180),
    tenantId: clean(code.tenantId, 180),
    clientId: clean(code.clientId, 500),
    clientName: clean(code.clientName, 180),
    scopes: parseMcpOAuthScopes((code.scopes || []).join(" ")).scopes,
    audience,
    offline: code.offline === true,
  });
  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists || current.data()?.consumedAt) throw new CommandError("INVALID_GRANT", 400);
    transaction.update(ref, { consumedAt: FieldValue.serverTimestamp() });
    transaction.create(issued.ref, issued.record);
  });
  return issued.payload;
}

export async function refreshAccessToken(input: { refreshToken: string; clientId: string; resource?: string }) {
  const refreshHash = tokenHash(input.refreshToken);
  const snap = await adminDb.collection("mcp_oauth_tokens").where("refreshHash", "==", refreshHash).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) throw new CommandError("INVALID_GRANT", 400);
  const token = doc.data() as StoredToken;
  const refreshExpiresAt = timestampMillis(token.refreshExpiresAt);
  const audience = clean(token.audience, 500);
  if (token.revokedAt || token.clientId !== input.clientId || !refreshExpiresAt || refreshExpiresAt <= Date.now()) throw new CommandError("INVALID_GRANT", 400);
  if (!audience || (input.resource && input.resource !== audience)) throw new CommandError("INVALID_TARGET", 400);
  const issued = buildTokenIssue({
    userId: clean(token.userId, 180),
    tenantId: clean(token.tenantId, 180),
    clientId: clean(token.clientId, 500),
    clientName: clean(token.clientName, 180),
    scopes: parseMcpOAuthScopes((token.scopes || []).join(" ")).scopes,
    audience,
    offline: true,
  });
  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(doc.ref);
    const data = current.data() as StoredToken | undefined;
    if (!data || data.revokedAt || data.refreshHash !== refreshHash) throw new CommandError("INVALID_GRANT", 400);
    transaction.set(doc.ref, { revokedAt: FieldValue.serverTimestamp(), rotatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(issued.ref, issued.record);
  });
  return issued.payload;
}

function buildTokenIssue(input: { userId: string; tenantId: string; clientId: string; clientName?: string; scopes: Scope[]; audience: string; offline: boolean }) {
  if (!input.userId || !input.tenantId || !input.clientId) throw new CommandError("INVALID_GRANT", 400);
  const accessToken = randomToken("mcp_at", 32);
  const refreshToken = randomToken("mcp_rt", 36);
  const now = Date.now();
  const ref = adminDb.collection("mcp_oauth_tokens").doc(tokenHash(accessToken));
  const record = {
    userId: input.userId,
    tenantId: input.tenantId,
    clientId: input.clientId,
    clientName: clean(input.clientName, 180),
    scopes: input.scopes,
    audience: input.audience,
    refreshHash: input.offline ? tokenHash(refreshToken) : null,
    expiresAt: Timestamp.fromMillis(now + MCP_ACCESS_TOKEN_TTL_MS),
    refreshExpiresAt: Timestamp.fromMillis(now + MCP_REFRESH_TOKEN_TTL_MS),
    createdAt: FieldValue.serverTimestamp(),
  };
  const payload = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(MCP_ACCESS_TOKEN_TTL_MS / 1000),
    scope: input.scopes.join(" "),
    ...(input.offline ? { refresh_token: refreshToken } : {}),
  };
  return { ref, record, payload };
}

export async function validateMcpAccessToken(req: Request, rawToken: string): Promise<{ userId: string; tenantId: string; grant: Grant; clientId: string }> {
  if (!rawToken || rawToken.length > 4096) throw new CommandError("UNAUTHENTICATED", 401);
  const snap = await adminDb.collection("mcp_oauth_tokens").doc(tokenHash(rawToken)).get();
  if (!snap.exists) throw new CommandError("UNAUTHENTICATED", 401);
  const token = snap.data() as StoredToken;
  const expiresAt = timestampMillis(token.expiresAt);
  if (token.revokedAt || !expiresAt || expiresAt <= Date.now()) throw new CommandError("UNAUTHENTICATED", 401);
  if (token.audience !== endpoint(req, MCP_REMOTE_PATH)) throw new CommandError("UNAUTHENTICATED", 401);

  const userId = clean(token.userId, 180);
  const tenantId = clean(token.tenantId, 180);
  const settings = await getTenantSettings(tenantId);
  const mcp = settings?.mcp && typeof settings.mcp === "object" ? (settings.mcp as Record<string, unknown>) : {};
  if (mcp.enabled !== true) throw new CommandError("MCP_DISABLED", 403);

  return {
    userId,
    tenantId,
    clientId: clean(token.clientId, 500),
    grant: {
      userId,
      tenantId,
      scopes: parseScope((token.scopes || []).join(" ")),
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

async function verifyChatGptClientMetadata(clientId: string, redirectUri: string) {
  const response = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new CommandError("UNAUTHORIZED_CLIENT", 400);
  const raw = await response.text();
  if (raw.length > 64_000) throw new CommandError("UNAUTHORIZED_CLIENT", 400);
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new CommandError("UNAUTHORIZED_CLIENT", 400); }
  const redirects = Array.isArray(data.redirect_uris) ? data.redirect_uris : [];
  const methods = Array.isArray(data.token_endpoint_auth_methods_supported)
    ? data.token_endpoint_auth_methods_supported
    : [data.token_endpoint_auth_method];
  if (data.client_id !== clientId || !redirects.includes(redirectUri) || !methods.includes("none")) {
    throw new CommandError("UNAUTHORIZED_CLIENT", 400);
  }
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
      clientId: clean(token.clientId, 500),
      clientName: clean(token.clientName, 180) || clean(token.clientId, 500) || "Cliente MCP",
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
      clientId: clean(token.clientId, 500),
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}
