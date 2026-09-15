import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { CommandError } from "@/lib/server/command-center/security";
import { createAuthorizationCode, MCP_AUTHORIZE_PAGE_PATH } from "@/lib/server/mcp/oauth";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = new URL(MCP_AUTHORIZE_PAGE_PATH, url.origin);
  for (const key of ["client_id", "client_name", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method", "response_type", "tenantId"]) {
    const value = url.searchParams.get(key);
    if (value) page.searchParams.set(key, value);
  }
  return NextResponse.redirect(page);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (clean(body.response_type, 40) && clean(body.response_type, 40) !== "code") throw new CommandError("INVALID_INPUT", 400);
    if (clean(body.code_challenge_method, 20) && clean(body.code_challenge_method, 20) !== "S256") throw new CommandError("INVALID_INPUT", 400);
    const redirectTo = await createAuthorizationCode({
      req,
      userId: user.uid,
      userName: user.name,
      tenantId: clean(body.tenantId, 180),
      clientId: clean(body.client_id, 180) || "mcp-client",
      clientName: clean(body.client_name, 180),
      redirectUri: clean(body.redirect_uri, 500),
      state: clean(body.state, 1000),
      codeChallenge: clean(body.code_challenge, 180),
      scope: clean(body.scope, 1000),
    });
    return NextResponse.json({ ok: true, redirectTo }, { headers });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    }
    if (error instanceof CommandError) {
      return NextResponse.json({ error: error.code, code: error.code }, { status: error.status, headers });
    }
    console.error("Erro na autorizacao OAuth MCP:", error);
    return NextResponse.json({ error: "Falha ao autorizar MCP.", code: "UNAVAILABLE" }, { status: 500, headers });
  }
}
