import { adminMcpMetadata } from "@/lib/admin-mcp";
import { publicOrigin } from "@/lib/server/mcp/oauth";
export async function GET(req: Request) { return Response.json(adminMcpMetadata(publicOrigin(req)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }); }
