import { NextResponse } from "next/server";
import { processAiQueue } from "@/lib/server/ai/queue";

function readToken(req: Request) {
  const bearer = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return (
    String(req.headers.get("x-ai-jobs-token") || "").trim() ||
    String(req.headers.get("x-cron-secret") || "").trim()
  );
}

function getLimit(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = Number(searchParams.get("limit") || 20);
  if (Number.isNaN(raw)) return 20;
  return Math.min(100, Math.max(1, Math.round(raw)));
}

function shouldDrain(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = String(searchParams.get("drain") || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function handle(req: Request) {
  const expectedToken =
    String(process.env.AI_JOBS_PROCESS_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "AI_JOBS_PROCESS_TOKEN ou CRON_SECRET nao configurado." },
      { status: 503 }
    );
  }

  const token = readToken(req);
  if (!token || token !== expectedToken) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const result = await processAiQueue({ limit: getLimit(req), drain: shouldDrain(req) });
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro ao processar fila de IA (GET):", error);
    return NextResponse.json({ error: "Falha ao processar fila de IA." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro ao processar fila de IA (POST):", error);
    return NextResponse.json({ error: "Falha ao processar fila de IA." }, { status: 500 });
  }
}
