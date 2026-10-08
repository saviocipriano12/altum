import { NextResponse } from "next/server";
import { processOutboundCampaignJobs } from "@/lib/server/outbound-campaigns";
import { purgeExpiredTenantTrash } from "@/lib/server/tenant-data-deletion";

function token(req: Request) {
  const bearer = String(req.headers.get("authorization") || "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  return String(req.headers.get("x-outbound-jobs-token") || req.headers.get("x-cron-secret") || "").trim();
}

function configuredTokens() {
  // The Vercel cron and the VPS worker may use distinct scoped tokens during
  // a credential rotation. Keep both valid so a healthy worker is never
  // interrupted while the deployment is being updated.
  return Array.from(
    new Set(
      [process.env.OUTBOUND_JOBS_PROCESS_TOKEN, process.env.CRON_SECRET]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

async function handle(req: Request) {
  const acceptedTokens = configuredTokens();
  if (!acceptedTokens.length) {
    return NextResponse.json({ error: "OUTBOUND_JOBS_PROCESS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  }
  if (!acceptedTokens.includes(token(req))) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  const url = new URL(req.url);
  const [result, trash] = await Promise.all([
    processOutboundCampaignJobs({ limit: Number(url.searchParams.get("limit") || 40) }),
    purgeExpiredTenantTrash(),
  ]);
  return NextResponse.json({ ok: true, ...result, trash });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro ao processar fila outbound:", error);
    return NextResponse.json({ error: "Falha ao processar fila outbound." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
