import { exchangeAdminToken } from "@/lib/server/mcp/admin-oauth";
import { CommandError } from "@/lib/server/command-center/security";
const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
export async function POST(req: Request) {
  try { const body = req.headers.get("content-type")?.includes("application/json") ? await req.json() : Object.fromEntries(new URLSearchParams(await req.text())); return Response.json(await exchangeAdminToken(req, body), { headers }); }
  catch (error) { if (error instanceof CommandError) return Response.json({ error: error.code }, { status: error.status, headers }); console.error("Falha na troca OAuth administrativa:", error); return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers }); }
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }); }
