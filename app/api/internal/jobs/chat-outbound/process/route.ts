import { NextResponse } from "next/server";
import { processChatOutboundJobs } from "@/lib/server/chat-outbound";

export const maxDuration = 120;

function readToken(req: Request) {
  const bearer = String(req.headers.get("authorization") || "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  return String(req.headers.get("x-chat-outbound-token") || req.headers.get("x-cron-secret") || "").trim();
}

async function handle(req: Request) {
  const configured = String(process.env.CHAT_OUTBOUND_PROCESS_TOKEN || process.env.CRON_SECRET || "").trim();
  if (!configured) return NextResponse.json({ error: "CHAT_OUTBOUND_PROCESS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  if (readToken(req) !== configured) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const limit = Number(new URL(req.url).searchParams.get("limit") || 10);
  return NextResponse.json({ ok: true, ...(await processChatOutboundJobs({ limit })) });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro ao processar fila de mensagens:", error);
    return NextResponse.json({ error: "Falha ao processar fila de mensagens." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
