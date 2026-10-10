import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CommandError } from "@/lib/server/command-center/security";
import { validateAdminAccess } from "@/lib/server/mcp/admin-oauth";
import { publicOrigin } from "@/lib/server/mcp/oauth";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";
import { createPlatformAdminServer } from "@/lib/server/mcp/platform-admin-server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { Grant } from "@/lib/mcp/contracts";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,MCP-Protocol-Version,Mcp-Session-Id,Last-Event-ID", "Access-Control-Expose-Headers": "Mcp-Session-Id,MCP-Protocol-Version,WWW-Authenticate", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
async function handleMcpRequest(req: Request, server: ReturnType<typeof createPlatformAdminServer>, authInfo: { token: string; clientId: string; scopes: string[] }) {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, keepAliveMs: 0 });
  await server.connect(transport);
  const response = await transport.handleRequest(req, { authInfo });
  const headers = new Headers(response.headers); Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}
async function handle(req: Request) {
  try {
    const raw = req.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
    let token: Awaited<ReturnType<typeof validateAdminAccess>> | null = null;
    if (raw) {
      try { token = await validateAdminAccess(req, raw); }
      catch (error) {
        // Tool discovery and a call to a protected tool must still reach the
        // MCP layer. ChatGPT uses its `mcp/www_authenticate` response to show
        // the reconnect UI after an access token has expired.
        if (!(error instanceof CommandError) || error.code !== "UNAUTHENTICATED") throw error;
      }
    }
    if (!token) {
      // Streamable HTTP uses POST for MCP initialize, tools/list and tools/call.
      // Keep ordinary unauthenticated GET requests rejected; only protocol calls
      // may receive the structured OAuth challenge below.
      if (req.method !== "POST") throw new CommandError("UNAUTHENTICATED", 401);
      const resourceMetadataUrl = `${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp/admin`;
      const server = createPlatformAdminServer(null, { grantedScopes: [], resourceMetadataUrl });
      return await handleMcpRequest(req, server, { token: "[unlinked]", clientId: "unlinked", scopes: [] });
    }
    await assertPublicRateLimit(new Request(req.url), { scope: "admin_mcp", subject: token.userId, limit: 60, windowMs: 60_000 });
    const tenants = await adminDb.collection("tenants").limit(200).get();
    const grants: Grant[] = tenants.docs.map((tenant) => ({
      userId: token.userId,
      tenantId: tenant.id,
      scopes: [...token.scopes] as Grant["scopes"],
      expiresAt: token.expiresAt,
    }));
    const server = createPlatformAdminServer({ userId: token.userId, connectionId: token.connectionId, scopes: token.scopes, grants, origin: publicOrigin(req) });
    return await handleMcpRequest(req, server, { token: "[redacted]", clientId: token.clientId, scopes: token.scopes });
  } catch (error) {
    if (error instanceof PublicRateLimitError) return Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...cors, "Retry-After": String(error.retryAfterSeconds) } });
    const status = error instanceof CommandError ? error.status : 500;
    if (!(error instanceof CommandError)) console.error("Falha no MCP administrativo:", error);
    return Response.json({ error: error instanceof CommandError ? error.code : "UNAVAILABLE" }, { status, headers: { ...cors, "WWW-Authenticate": `Bearer resource_metadata="${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp/admin"` } });
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
