import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { scanAiProactiveRecommendations } from "@/lib/server/ai/proactive-processor";

export const maxDuration = 300;

function authorized(req: Request) {
  const expected = String(process.env.AI_PROACTIVE_JOBS_TOKEN || process.env.CRON_SECRET || "").trim();
  if (!expected) return "missing" as const;
  const incoming = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (access === "missing") return NextResponse.json({ error: "AI_PROACTIVE_JOBS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  if (!access) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  try {
    const url = new URL(req.url);
    const tenantLimit = Number(url.searchParams.get("tenantLimit") || 20);
    const leadLimit = Number(url.searchParams.get("leadLimit") || 40);
    return NextResponse.json({ ok: true, ...(await scanAiProactiveRecommendations({ tenantLimit, leadLimit })) });
  } catch (error) {
    console.error("Erro no job de inteligencia proativa:", error);
    return NextResponse.json({ error: "Falha na varredura proativa." }, { status: 500 });
  }
}

export async function POST(req: Request) { return GET(req); }
