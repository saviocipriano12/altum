import { grantSchema } from "../../mcp/contracts.ts";
import { CommandCenter } from "./service.ts";
import { CommandError } from "./security.ts";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export type CommandReadBoundary = {
  enabled: boolean;
  verifyToken(token: string): Promise<string>;
  loadUser(req: Request): Promise<{ uid: string; active?: boolean | null }>;
  rateLimit(uid: string): Promise<void>;
  execute(uid: string, input: unknown): Promise<unknown>;
};

async function readJsonBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new CommandError("INVALID_INPUT", 400);
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new CommandError("INVALID_INPUT", 413);
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError("INVALID_INPUT", 400);
  }
}

function bearerToken(req: Request) {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer ([^\s]+)$/);
  if (!match || match[1].length > 8192) throw new CommandError("UNAUTHENTICATED", 401);
  return match[1];
}

export async function handleCommandRead(req: Request, boundary: CommandReadBoundary) {
  if (!boundary.enabled) {
    return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 404, headers: responseHeaders });
  }
  try {
    const uid = await boundary.verifyToken(bearerToken(req));
    const user = await boundary.loadUser(req);
    if (user.uid !== uid || user.active === false) throw new CommandError("UNAUTHENTICATED", 401);
    await boundary.rateLimit(uid);
    const data = await boundary.execute(uid, await readJsonBody(req));
    return Response.json(data, { headers: responseHeaders });
  } catch (error) {
    const status = error instanceof CommandError ? error.status : 503;
    const code = error instanceof CommandError ? error.code : "UNAVAILABLE";
    return Response.json({ error: { code } }, { status, headers: responseHeaders });
  }
}

export function loadCommandCenterFromEnv(ports: ConstructorParameters<typeof CommandCenter>[0]) {
  const secret = process.env.MCP_CONTEXT_SECRET || "";
  if (secret.length < 32) throw new CommandError("UNAVAILABLE", 503);
  const grants = grantSchema.parse(JSON.parse(process.env.MCP_READ_GRANTS || "[]"));
  return new CommandCenter(ports, grants, secret);
}
