import { NextResponse } from "next/server";
import { oauthMetadata } from "@/lib/server/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json(oauthMetadata(req), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
