import { ADMIN_MCP_PATH, ADMIN_MCP_ISSUER_PATH } from "@/lib/admin-mcp";
import { publicOrigin } from "@/lib/server/mcp/oauth";
export async function GET(req: Request) { const origin = publicOrigin(req); return Response.json({ resource: origin + ADMIN_MCP_PATH, authorization_servers: [origin + ADMIN_MCP_ISSUER_PATH], scopes_supported: ["context:read"], bearer_methods_supported: ["header"], resource_documentation: origin + "/admin/mcp" }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }); }
