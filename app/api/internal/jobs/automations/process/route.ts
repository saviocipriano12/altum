import { NextResponse } from "next/server";
import { processPendingAutomationActions, processWaitingReplyAutomations } from "@/lib/server/automations";
import { processInboxWatchdog } from "@/lib/server/inbox-watchdog";

function readToken(req: Request) {
  const bearer = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return String(req.headers.get("x-automation-jobs-token") || "").trim();
}

function getLimit(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = Number(searchParams.get("limit") || 40);
  if (Number.isNaN(raw)) return 40;
  return Math.min(200, Math.max(1, Math.round(raw)));
}

async function handle(req: Request) {
  const expectedToken =
    String(process.env.AUTOMATION_JOBS_PROCESS_TOKEN || "").trim() ||
    String(process.env.AI_JOBS_PROCESS_TOKEN || "").trim();

  if (!expectedToken) {
    return NextResponse.json(
      { error: "AUTOMATION_JOBS_PROCESS_TOKEN nao configurado." },
      { status: 503 }
    );
  }

  const token = readToken(req);
  if (!token || token !== expectedToken) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const limit = getLimit(req);
  const [scheduled, waitingReply, inboxWatchdog] = await Promise.all([
    processPendingAutomationActions({ limit }),
    processWaitingReplyAutomations({ limit }),
    processInboxWatchdog({ limit: Math.min(200, limit * 2) }),
  ]);
  const result = { scheduled, waitingReply, inboxWatchdog };
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro ao processar fila de automacoes (GET):", error);
    return NextResponse.json({ error: "Falha ao processar fila de automacoes." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro ao processar fila de automacoes (POST):", error);
    return NextResponse.json({ error: "Falha ao processar fila de automacoes." }, { status: 500 });
  }
}
