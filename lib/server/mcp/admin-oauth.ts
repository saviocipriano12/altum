import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { AGENCY_ADMIN_ROLES, type RequestUser } from "@/app/lib/server/route-auth";
import { publicOrigin, tokenHash } from "@/lib/server/mcp/oauth";
import { CommandError, millis } from "@/lib/server/command-center/security";
import { adminConsentSchema, strictAdminScopes, isChatGptMetadataUrl, isChatGptRedirect, ADMIN_MCP_PATH, ADMIN_MCP_ISSUER_PATH } from "@/lib/admin-mcp";
import type { Grant } from "@/lib/mcp/contracts";

const policyRef = () => adminDb.collection("platform_settings").doc("admin_mcp");
const token = (prefix: string) => prefix + "_" + randomBytes(32).toString("base64url");
const invalid = () => new CommandError("invalid_grant", 400);
export function adminMcpResource(req: Request) { return publicOrigin(req) + ADMIN_MCP_PATH; }
function audience(req: Request, value: unknown) { if (value !== adminMcpResource(req)) throw new CommandError("invalid_target", 400); }
export function validateAdminAuthorizationRequest(req: Request, body: Record<string, unknown>) {
  audience(req, body.resource);
  if (body.response_type !== "code" || body.code_challenge_method !== "S256" || typeof body.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge)) throw new CommandError("invalid_request", 400);
  if (typeof body.client_id !== "string" || !isChatGptMetadataUrl(body.client_id) || typeof body.redirect_uri !== "string" || !isChatGptRedirect(body.redirect_uri)) throw new CommandError("unauthorized_client", 400);
  if (body.state !== undefined && (typeof body.state !== "string" || body.state.length > 2000)) throw new CommandError("invalid_request", 400);
  try { return strictAdminScopes(body.scope); } catch { throw new CommandError("invalid_scope", 400); }
}
async function verifyClientMetadata(clientId: string, redirectUri: string) {
  // Only the exact OpenAI metadata host/path is fetched; no arbitrary URL or redirects.
  const response = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new CommandError("unauthorized_client", 400);
  const raw = await response.text(); if (raw.length > 64000) throw new CommandError("unauthorized_client", 400);
  const data = JSON.parse(raw);
  if (data.client_id !== clientId || !Array.isArray(data.redirect_uris) || !data.redirect_uris.includes(redirectUri)) throw new CommandError("unauthorized_client", 400);
  const methods = data.token_endpoint_auth_methods_supported || [data.token_endpoint_auth_method];
  if (!Array.isArray(methods) || !methods.includes("none")) throw new CommandError("unauthorized_client", 400);
}
export async function createAdminAuthorizationCode(req: Request, actor: RequestUser, body: Record<string, unknown>) {
  const requested = validateAdminAuthorizationRequest(req, body);
  const consent = adminConsentSchema.safeParse({ tenantIds: body.tenantIds, scopes: body.scopes });
  if (!consent.success || consent.data.scopes.some(scope => !requested.scopes.includes(scope))) throw new CommandError("invalid_scope", 400);
  const policy = await policyRef().get(); if (policy.data()?.enabled !== true) throw new CommandError("MCP_DISABLED", 403);
  await verifyClientMetadata(body.client_id as string, body.redirect_uri as string);
  const companies = await Promise.all(consent.data.tenantIds.map(id => adminDb.collection("tenants").doc(id).get()));
  if (companies.some(snap => !snap.exists)) throw new CommandError("invalid_company", 400);
  const code = token("altum_admin_code"); const now = Date.now();
  const connectionRef = adminDb.collection("admin_mcp_connections").doc(); const batch = adminDb.batch();
  batch.set(connectionRef, { userId: actor.uid, userName: actor.name, clientId: body.client_id, clientName: "ChatGPT", audience: adminMcpResource(req), tenantIds: consent.data.tenantIds, scopes: consent.data.scopes, offline: requested.offline, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + (requested.offline ? 60 * 86400000 : 3600000)), revokedAt: null });
  batch.set(adminDb.collection("admin_mcp_codes").doc(tokenHash(code)), { connectionId: connectionRef.id, clientId: body.client_id, redirectUri: body.redirect_uri, challenge: body.code_challenge, audience: adminMcpResource(req), expiresAt: Timestamp.fromMillis(now + 600000), consumedAt: null });
  batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_consent", actorId: actor.uid, tenantIds: consent.data.tenantIds, scopes: consent.data.scopes, connectionId: connectionRef.id, createdAt: Timestamp.fromMillis(now) });
  await batch.commit();
  const redirect = new URL(body.redirect_uri as string); redirect.searchParams.set("code", code); redirect.searchParams.set("iss", publicOrigin(req) + ADMIN_MCP_ISSUER_PATH);
  if (typeof body.state === "string") redirect.searchParams.set("state", body.state);
  return { redirect: redirect.toString() };
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
  const consent = adminConsentSchema.safeParse({ tenantIds: data.tenantIds, scopes: data.scopes });
  if (!consent.success) throw invalid();
  return { ...data, userId: data.userId as string, clientId: data.clientId as string, offline: data.offline === true, expiresAt: millis(data.expiresAt)!, ...consent.data };
}
export async function exchangeAdminToken(req: Request, body: Record<string, unknown>) {
  audience(req, body.resource);
  if (typeof body.client_id !== "string" || !isChatGptMetadataUrl(body.client_id)) throw new CommandError("unauthorized_client", 400);
  const refreshMode = body.grant_type === "refresh_token";
  if (!refreshMode && body.grant_type !== "authorization_code") throw new CommandError("unsupported_grant_type", 400);
  const credential = refreshMode ? body.refresh_token : body.code;
  if (typeof credential !== "string" || credential.length > 4096 || !credential) throw invalid();
  if (!refreshMode && (typeof body.code_verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier))) throw invalid();
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
  const snap = await adminDb.collection("admin_mcp_access_tokens").doc(tokenHash(raw)).get(); const data = snap.data();
  if (!data || data.audience !== adminMcpResource(req) || (millis(data.expiresAt) || 0) <= Date.now()) throw new CommandError("UNAUTHENTICATED", 401);
  let connection;
  try { connection = await liveConnection(data.connectionId, req); } catch (error) { if (error instanceof CommandError && error.code === "invalid_grant") throw new CommandError("UNAUTHENTICATED", 401); throw error; }
  const expiresAt = new Date(Math.min(millis(data.expiresAt)!, connection.expiresAt)).toISOString();
  let tokenScopes; try { tokenScopes = strictAdminScopes((data.scopes || []).join(" ")).scopes; } catch { throw new CommandError("UNAUTHENTICATED", 401); }
  if (tokenScopes.some(scope => !connection.scopes.includes(scope))) throw new CommandError("UNAUTHENTICATED", 401);
  const grants: Grant[] = connection.tenantIds.map(tenantId => ({ userId: connection.userId, tenantId, scopes: tokenScopes, expiresAt }));
  return { userId: connection.userId, clientId: connection.clientId, connectionId: data.connectionId as string, grants };
}
export async function setAdminMcpPolicy(actor: RequestUser, enabled: boolean) {
  const batch = adminDb.batch(); batch.set(policyRef(), { enabled, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_policy_changed", enabled, actorId: actor.uid, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
}
