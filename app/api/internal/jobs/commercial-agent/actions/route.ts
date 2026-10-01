import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processCommercialAgentSla } from "@/lib/server/commercial-agent-sla";

export const maxDuration = 300;

function authorized(req: Request) {
  const expected = String(process.env.COMMERCIAL_AGENT_JOBS_TOKEN || process.env.CRON_SECRET || "").trim();
  if (!expected) return "missing" as const;
  const incoming = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (access === "missing") return NextResponse.json({ error: "COMMERCIAL_AGENT_JOBS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  if (!access) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  try {
    const limit = Math.max(1, Math.min(500, Number(new URL(req.url).searchParams.get("limit") || 200)));
    return NextResponse.json({ ok: true, ...(await processCommercialAgentSla({ limit })) });
  } catch (error) {
    console.error("Erro no job de SLA do agente comercial:", error);
    return NextResponse.json({ error: "Falha no processamento de SLA comercial." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
