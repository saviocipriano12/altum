import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { AGENCY_ADMIN_ROLES, type RequestUser } from "@/app/lib/server/route-auth";
import { publicOrigin, tokenHash } from "@/lib/server/mcp/oauth";
import { CommandError, millis, sign, verify } from "@/lib/server/command-center/security";
import { adminConsentSchema, strictAdminScopes, isChatGptMetadataUrl, isOpenAiAdminRedirect, isCodexChatGptHostedRedirect, ADMIN_MCP_PATH, ADMIN_MCP_ISSUER_PATH } from "@/lib/admin-mcp";

const policyRef = () => adminDb.collection("platform_settings").doc("admin_mcp");
const token = (prefix: string) => prefix + "_" + randomBytes(32).toString("base64url");
const invalid = () => new CommandError("invalid_grant", 400);
const STATELESS_CODE_PREFIX = "altum_admin_ephemeral_code_";
const STATELESS_ACCESS_PREFIX = "altum_admin_ephemeral_access_";
const EPHEMERAL_CODE_TTL_MS = 10 * 60_000;
const EPHEMERAL_ACCESS_TTL_MS = 60 * 60_000;
export function adminMcpResource(req: Request) { return publicOrigin(req) + ADMIN_MCP_PATH; }
function audience(req: Request, value: unknown) { if (value !== adminMcpResource(req)) throw new CommandError("invalid_target", 400); }

function mcpSigningSecret() { return process.env.MCP_CONTEXT_SECRET || ""; }

function isFirestoreQuotaError(error: unknown) {
  const record = error as { code?: unknown; message?: unknown } | null;
  const code = String(record?.code || "").toUpperCase();
  const message = String(record?.message || "").toUpperCase();
  return code === "8" || code === "RESOURCE_EXHAUSTED" || message.includes("RESOURCE_EXHAUSTED") || message.includes("QUOTA");
}

function signedToken(prefix: string, value: Record<string, unknown>) {
  return prefix + sign(value, mcpSigningSecret());
}

function readSignedToken(raw: string, prefix: string) {
  if (!raw.startsWith(prefix)) throw invalid();
  try { return verify(raw.slice(prefix.length), mcpSigningSecret()); }
  catch { throw invalid(); }
}

function redirectWithCode(req: Request, body: Record<string, unknown>, code: string) {
  const redirect = new URL(body.redirect_uri as string);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("iss", publicOrigin(req) + ADMIN_MCP_ISSUER_PATH);
  if (typeof body.state === "string") redirect.searchParams.set("state", body.state);
  return { redirect: redirect.toString() };
}
export function validateAdminAuthorizationRequest(req: Request, body: Record<string, unknown>) {
  audience(req, body.resource);
  if (body.response_type !== "code" || body.code_challenge_method !== "S256" || typeof body.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge)) throw new CommandError("invalid_request", 400);
  if (typeof body.client_id !== "string" || !isChatGptMetadataUrl(body.client_id) || typeof body.redirect_uri !== "string" || !isOpenAiAdminRedirect(body.client_id, body.redirect_uri)) throw new CommandError("unauthorized_client", 400);
  if (body.state !== undefined && (typeof body.state !== "string" || body.state.length > 2000)) throw new CommandError("invalid_request", 400);
  try { return strictAdminScopes(body.scope); } catch { throw new CommandError("invalid_scope", 400); }
}
async function verifyClientMetadata(clientId: string, redirectUri: string) {
  // Only the exact OpenAI metadata host/path is fetched; no arbitrary URL or redirects.
  const response = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new CommandError("unauthorized_client", 400);
  const raw = await response.text(); if (raw.length > 64000) throw new CommandError("unauthorized_client", 400);
  const data = JSON.parse(raw);
  // Codex Desktop can complete the handoff through ChatGPT itself. Its
  // published metadata lists loopback callbacks, while the hosted handoff is
  // still constrained to the same trusted chatgpt.com callback family.
  const hasRegisteredRedirect = Array.isArray(data.redirect_uris) && data.redirect_uris.includes(redirectUri);
  if (data.client_id !== clientId || (!hasRegisteredRedirect && !isCodexChatGptHostedRedirect(clientId, redirectUri))) throw new CommandError("unauthorized_client", 400);
  const methods = data.token_endpoint_auth_methods_supported || [data.token_endpoint_auth_method];
  if (!Array.isArray(methods) || !methods.includes("none")) throw new CommandError("unauthorized_client", 400);
}
export async function createAdminAuthorizationCode(req: Request, actor: RequestUser, body: Record<string, unknown>) {
  const requested = validateAdminAuthorizationRequest(req, body);
  const consent = adminConsentSchema.safeParse({ scopes: body.scopes });
  // The platform owner can grant the complete Altum capability catalog even
  // when ChatGPT's first OAuth request only names tools already discovered.
  // Tool-level confirmations still protect cost and external side effects.
  if (!consent.success) throw new CommandError("invalid_scope", 400);
  const policy = await policyRef().get(); if (policy.data()?.enabled !== true) throw new CommandError("MCP_DISABLED", 403);
  await verifyClientMetadata(body.client_id as string, body.redirect_uri as string);
  const code = token("altum_admin_code"); const now = Date.now();
  const connectionRef = adminDb.collection("admin_mcp_connections").doc(); const batch = adminDb.batch();
  batch.set(connectionRef, { userId: actor.uid, userName: actor.name, clientId: body.client_id, clientName: "ChatGPT", audience: adminMcpResource(req), scopes: consent.data.scopes, connectionType: "platform_admin", offline: requested.offline, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + (requested.offline ? 60 * 86400000 : 3600000)), revokedAt: null });
  batch.set(adminDb.collection("admin_mcp_codes").doc(tokenHash(code)), { connectionId: connectionRef.id, clientId: body.client_id, redirectUri: body.redirect_uri, challenge: body.code_challenge, audience: adminMcpResource(req), expiresAt: Timestamp.fromMillis(now + 600000), consumedAt: null });
  batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_consent", actorId: actor.uid, scopes: consent.data.scopes, connectionId: connectionRef.id, createdAt: Timestamp.fromMillis(now) });
  try {
    await batch.commit();
    return redirectWithCode(req, body, code);
  } catch (error) {
    // OAuth codes are temporary state. A Firestore write quota must not leave
    // an already authenticated platform owner with a partial ChatGPT grant.
    // The fallback is signed, expires quickly and remains PKCE-bound; every
    // access token still rechecks the active admin user and MCP policy below.
    if (!isFirestoreQuotaError(error)) throw error;
    const expiresAt = now + EPHEMERAL_CODE_TTL_MS;
    const ephemeralCode = signedToken(STATELESS_CODE_PREFIX, {
      type: "admin_mcp_ephemeral_code",
      userId: actor.uid,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      challenge: body.code_challenge,
      audience: adminMcpResource(req),
      scopes: consent.data.scopes,
      exp: expiresAt,
    });
    return redirectWithCode(req, body, ephemeralCode);
  }
}

async function assertLiveAdminUser(userId: string) {
  const [policy, user] = await Promise.all([
    policyRef().get(),
    adminDb.collection("users").doc(userId).get(),
  ]);
  if (policy.data()?.enabled !== true) throw new CommandError("MCP_DISABLED", 403);
  const profile = user.data();
  if (!profile || profile.status === "blocked" || !AGENCY_ADMIN_ROLES.includes(profile.role)) throw new CommandError("FORBIDDEN", 403);
}
async function liveConnection(connectionId: string, req: Request, transaction?: FirebaseFirestore.Transaction) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(connectionId)) throw invalid();
  const read = (ref: FirebaseFirestore.DocumentReference) => transaction ? transaction.get(ref) : ref.get();
  const connectionRef = adminDb.collection("admin_mcp_connections").doc(connectionId);
  const [connection, policy] = await Promise.all([read(connectionRef), read(policyRef())]);
  const data = connection.data();
  if (!data || data.revokedAt || (millis(data.expiresAt) || 0) <= Date.now() || data.audience !== adminMcpResource(req)) throw invalid();
  if (policy.data()?.enabled !== true) throw new CommandError("MCP_DISABLED", 403);
  if (typeof data.userId !== "string" || !data.userId) throw invalid();
  const user = await read(adminDb.collection("users").doc(data.userId)); const profile = user.data();
  if (!profile || profile.status === "blocked" || !AGENCY_ADMIN_ROLES.includes(profile.role)) throw new CommandError("FORBIDDEN", 403);
  const consent = adminConsentSchema.safeParse({ scopes: data.scopes });
  if (!consent.success) throw invalid();
  return { ...data, userId: data.userId as string, clientId: data.clientId as string, offline: data.offline === true, expiresAt: millis(data.expiresAt)!, ...consent.data };
}

async function exchangeEphemeralCode(req: Request, body: Record<string, unknown>, code: string) {
  const data = readSignedToken(code, STATELESS_CODE_PREFIX);
  if (data.type !== "admin_mcp_ephemeral_code" || typeof data.userId !== "string" || typeof data.clientId !== "string" || typeof data.redirectUri !== "string" || typeof data.challenge !== "string" || typeof data.audience !== "string" || typeof data.exp !== "number") throw invalid();
  if (data.clientId !== body.client_id || data.redirectUri !== body.redirect_uri || data.audience !== body.resource || data.exp <= Date.now()) throw invalid();
  const expected = Buffer.from(tokenHash(body.code_verifier as string)); const actual = Buffer.from(data.challenge);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
  let scopes; try { scopes = strictAdminScopes(Array.isArray(data.scopes) ? data.scopes.join(" ") : "").scopes; } catch { throw invalid(); }
  await assertLiveAdminUser(data.userId);
  const now = Date.now(); const expiresAt = now + EPHEMERAL_ACCESS_TTL_MS;
  const access = signedToken(STATELESS_ACCESS_PREFIX, {
    type: "admin_mcp_ephemeral_access",
    userId: data.userId,
    clientId: data.clientId,
    audience: data.audience,
    scopes,
    exp: expiresAt,
  });
  // A refresh token would need durable revocation state. While Firestore is
  // rejecting writes we deliberately issue a short-lived access token only.
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(EPHEMERAL_ACCESS_TTL_MS / 1000), scope: scopes.join(" ") };
}

async function validateEphemeralAccess(req: Request, raw: string) {
  const data = readSignedToken(raw, STATELESS_ACCESS_PREFIX);
  if (data.type !== "admin_mcp_ephemeral_access" || typeof data.userId !== "string" || typeof data.clientId !== "string" || typeof data.audience !== "string" || typeof data.exp !== "number") throw new CommandError("UNAUTHENTICATED", 401);
  if (data.audience !== adminMcpResource(req) || data.exp <= Date.now()) throw new CommandError("UNAUTHENTICATED", 401);
  let scopes; try { scopes = strictAdminScopes(Array.isArray(data.scopes) ? data.scopes.join(" ") : "").scopes; } catch { throw new CommandError("UNAUTHENTICATED", 401); }
  try { await assertLiveAdminUser(data.userId); }
  catch (error) { if (error instanceof CommandError && error.code === "FORBIDDEN") throw new CommandError("UNAUTHENTICATED", 401); throw error; }
  return { userId: data.userId, clientId: data.clientId, connectionId: `ephemeral-${tokenHash(raw).slice(0, 32)}`, scopes, expiresAt: new Date(data.exp).toISOString() };
}

export async function exchangeAdminToken(req: Request, body: Record<string, unknown>) {
  audience(req, body.resource);
  if (typeof body.client_id !== "string" || !isChatGptMetadataUrl(body.client_id)) throw new CommandError("unauthorized_client", 400);
  const refreshMode = body.grant_type === "refresh_token";
  if (!refreshMode && body.grant_type !== "authorization_code") throw new CommandError("unsupported_grant_type", 400);
  const credential = refreshMode ? body.refresh_token : body.code;
  if (typeof credential !== "string" || credential.length > 4096 || !credential) throw invalid();
  if (!refreshMode && (typeof body.code_verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier))) throw invalid();
  if (!refreshMode && credential.startsWith(STATELESS_CODE_PREFIX)) return exchangeEphemeralCode(req, body, credential);
  const sourceRef = adminDb.collection(refreshMode ? "admin_mcp_refresh_tokens" : "admin_mcp_codes").doc(tokenHash(credential));
  const access = token("altum_admin_access"); const refresh = token("altum_admin_refresh");
  return adminDb.runTransaction(async transaction => {
    const source = await transaction.get(sourceRef); const data = source.data();
    if (!data || data.consumedAt || (millis(data.expiresAt) || 0) <= Date.now() || data.clientId !== body.client_id || data.audience !== body.resource) throw invalid();
    if (!refreshMode) {
      if (data.redirectUri !== body.redirect_uri || typeof data.challenge !== "string") throw invalid();
      const expected = Buffer.from(tokenHash(body.code_verifier as string)); const actual = Buffer.from(data.challenge);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
    }
    const connection = await liveConnection(data.connectionId, req, transaction);
    if (connection.clientId !== body.client_id) throw invalid();
    let issuedScopes = refreshMode ? strictAdminScopes((data.scopes || []).join(" ")).scopes : connection.scopes;
    if (issuedScopes.some(scope => !connection.scopes.includes(scope))) throw invalid();
    if (refreshMode && body.scope !== undefined) {
      let requested; try { requested = strictAdminScopes(body.scope); } catch { throw new CommandError("invalid_scope", 400); }
      if (requested.scopes.some(scope => !issuedScopes.includes(scope))) throw new CommandError("invalid_scope", 400);
      issuedScopes = requested.scopes;
    }
    const now = Date.now(); const accessExpires = Math.min(now + 3600000, connection.expiresAt);
    transaction.set(sourceRef, { consumedAt: Timestamp.fromMillis(now) }, { merge: true });
    transaction.create(adminDb.collection("admin_mcp_access_tokens").doc(tokenHash(access)), { connectionId: data.connectionId, audience: body.resource, scopes: issuedScopes, expiresAt: Timestamp.fromMillis(accessExpires) });
    if (connection.offline === true) transaction.create(adminDb.collection("admin_mcp_refresh_tokens").doc(tokenHash(refresh)), { connectionId: data.connectionId, clientId: body.client_id, audience: body.resource, scopes: issuedScopes, expiresAt: Timestamp.fromMillis(connection.expiresAt), consumedAt: null });
    return { access_token: access, token_type: "Bearer", expires_in: Math.max(0, Math.floor((accessExpires - now) / 1000)), scope: issuedScopes.join(" "), ...(connection.offline === true ? { refresh_token: refresh } : {}) };
  });
}
export async function validateAdminAccess(req: Request, raw: string) {
  if (!raw || raw.length > 4096) throw new CommandError("UNAUTHENTICATED", 401);
  if (raw.startsWith(STATELESS_ACCESS_PREFIX)) return validateEphemeralAccess(req, raw);
  const snap = await adminDb.collection("admin_mcp_access_tokens").doc(tokenHash(raw)).get(); const data = snap.data();
  if (!data || data.audience !== adminMcpResource(req) || (millis(data.expiresAt) || 0) <= Date.now()) throw new CommandError("UNAUTHENTICATED", 401);
  let connection;
  try { connection = await liveConnection(data.connectionId, req); } catch (error) { if (error instanceof CommandError && error.code === "invalid_grant") throw new CommandError("UNAUTHENTICATED", 401); throw error; }
  const expiresAt = new Date(Math.min(millis(data.expiresAt)!, connection.expiresAt)).toISOString();
  let tokenScopes; try { tokenScopes = strictAdminScopes((data.scopes || []).join(" ")).scopes; } catch { throw new CommandError("UNAUTHENTICATED", 401); }
  if (tokenScopes.some(scope => !connection.scopes.includes(scope))) throw new CommandError("UNAUTHENTICATED", 401);
  return { userId: connection.userId, clientId: connection.clientId, connectionId: data.connectionId as string, scopes: tokenScopes, expiresAt };
}
export async function setAdminMcpPolicy(actor: RequestUser, enabled: boolean) {
  const batch = adminDb.batch(); batch.set(policyRef(), { enabled, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_policy_changed", enabled, actorId: actor.uid, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
}
