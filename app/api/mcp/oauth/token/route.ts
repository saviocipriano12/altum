import { NextResponse } from "next/server";
import { CommandError } from "@/lib/server/command-center/security";
import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/server/mcp/oauth";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readBody(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = await req.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const grantType = clean(body.grant_type, 80);
    const payload = grantType === "refresh_token"
      ? await refreshAccessToken({
          refreshToken: clean(body.refresh_token, 4096),
          clientId: clean(body.client_id, 180) || "mcp-client",
        })
      : await exchangeAuthorizationCode({
          code: clean(body.code, 4096),
          clientId: clean(body.client_id, 180) || "mcp-client",
          redirectUri: clean(body.redirect_uri, 500),
          codeVerifier: clean(body.code_verifier, 500),
        });
    return NextResponse.json(payload, { headers });
  } catch (error) {
    if (error instanceof CommandError) {
      return NextResponse.json({ error: error.code.toLowerCase(), error_description: error.code }, { status: error.status, headers });
    }
    console.error("Erro no token OAuth MCP:", error);
    return NextResponse.json({ error: "server_error", error_description: "UNAVAILABLE" }, { status: 500, headers });
  }
}
