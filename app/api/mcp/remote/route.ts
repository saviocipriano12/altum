import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CommandCenter } from "@/lib/server/command-center/service";
import { commandPorts } from "@/lib/server/command-center/repository";
import { CommandError } from "@/lib/server/command-center/security";
import { createServer } from "@/scripts/mcp/server";
import { validateMcpAccessToken } from "@/lib/server/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new CommandError("UNAUTHENTICATED", 401);
  return match[1];
}

function unauthorizedResponse(error: CommandError) {
  return Response.json(
    { error: { code: error.code } },
    {
      status: error.status,
      headers: {
        ...corsHeaders,
        "WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-protected-resource"',
      },
    }
  );
}

async function handle(req: Request) {
  try {
    const token = await validateMcpAccessToken(bearer(req));
    const secret = process.env.MCP_CONTEXT_SECRET || "";
    if (secret.length < 32) throw new CommandError("UNAVAILABLE", 503);
    const commandCenter = new CommandCenter(commandPorts, [token.grant], secret);
    const server = createServer((tool, args) => commandCenter.execute(token.userId, { tool, arguments: args }), false);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      keepAliveMs: 0,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(req, {
      authInfo: {
        token: "[redacted]",
        clientId: token.clientId,
        scopes: token.grant.scopes,
        expiresAt: Math.floor(Date.parse(token.grant.expiresAt) / 1000),
      },
    });
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    if (error instanceof CommandError) return unauthorizedResponse(error);
    console.error("Erro no MCP remoto:", error);
    return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
