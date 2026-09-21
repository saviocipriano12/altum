import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { publicOrigin } from "@/lib/server/mcp/oauth";
import { createAdminAuthorizationCode, validateAdminAuthorizationRequest } from "@/lib/server/mcp/admin-oauth";
import { CommandError } from "@/lib/server/command-center/security";
function failure(error: unknown) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); if (error instanceof CommandError) return Response.json({ error: error.code }, { status: error.status }); console.error("Falha na autorização MCP administrativa:", error); return Response.json({ error: "authorization_unavailable" }, { status: 503 }); }
export async function GET(req: Request) {
  try { const incoming = new URL(req.url); const body = Object.fromEntries(incoming.searchParams); validateAdminAuthorizationRequest(req, body); const target = new URL(publicOrigin(req) + "/admin/mcp/autorizar"); target.search = incoming.search; return Response.redirect(target, 302); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try { const actor = await requireRequestUser(req, { roles: ["agency_admin"] }); return Response.json(await createAdminAuthorizationCode(req, actor, await req.json()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
