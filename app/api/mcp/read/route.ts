import { adminAuth } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { handleCommandRead, loadCommandCenterFromEnv } from "@/lib/server/command-center/http";
import { commandPorts } from "@/lib/server/command-center/repository";
import { CommandError } from "@/lib/server/command-center/security";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Internal authenticated bridge endpoint. This is not a public remote MCP/OAuth endpoint. */
export async function POST(req: Request) {
  return handleCommandRead(req, {
    enabled: process.env.ALTUM_MCP_ENABLED === "true",
    async verifyToken(token) {
      // No credential fallback: revoked/disabled users and revocation-check failure are rejected.
      const verified = await adminAuth.verifyIdToken(token, true).catch(() => {
        throw new CommandError("UNAUTHENTICATED", 401);
      });
      return verified.uid;
    },
    async loadUser(request) {
      return requireRequestUser(request).catch(error => {
        if (error instanceof RouteAuthError) throw new CommandError("UNAUTHENTICATED", error.status);
        throw error;
      });
    },
    async rateLimit(uid) {
      // Ignore caller-supplied forwarding headers: budget is per verified user, not spoofable IP.
      await assertPublicRateLimit(new Request(req.url), { scope: "mcp_read", subject: uid, limit: 30, windowMs: 60_000 }).catch(error => {
        if (error instanceof PublicRateLimitError) throw new CommandError("RATE_LIMITED", 429);
        throw error;
      });
    },
    async execute(uid, input) {
      return loadCommandCenterFromEnv(commandPorts).execute(uid, input);
    },
  });
}
