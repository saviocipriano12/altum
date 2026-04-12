import { NextResponse } from "next/server";
import { AI_QUEUE_JOB_TYPE, processAiQueue } from "@/lib/server/ai/queue";
import {
  readAiWorkerHealth,
  resolveAiOperationalAlert,
  summarizeAiQueueObservability,
  upsertAiOperationalAlert,
} from "@/lib/server/ai/observability";
import { adminDb } from "@/app/lib/server/firebase-admin";

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

function wantsHealth(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = String(searchParams.get("health") || searchParams.get("mode") || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "health";
}

async function syncHealthAlerts(tenants: Array<{ tenantId: string; staleQueue: boolean; counts: { deadLetter: number } }>) {
  await Promise.all(
    tenants.map(async (tenant) => {
      if (tenant.staleQueue) {
        await upsertAiOperationalAlert({
          tenantId: tenant.tenantId,
          type: "stale_queue",
          scope: "queue",
          severity: "high",
          title: "Fila de IA parada para este tenant",
          detail: "Existem jobs prontos para execucao aguardando alem do tempo aceitavel.",
          reasonCode: "stale_queue",
          source: "ai_queue_healthcheck",
        });
      } else {
        await resolveAiOperationalAlert({
          tenantId: tenant.tenantId,
          type: "stale_queue",
          scope: "queue",
        });
      }

      if (tenant.counts.deadLetter > 0) return;
      await resolveAiOperationalAlert({
        tenantId: tenant.tenantId,
        type: "dead_letter_threshold",
        scope: "queue",
      });
    })
  );
}

async function buildHealthPayload() {
  const [jobsSnap, metricsSnap, workerHealth] = await Promise.all([
    adminDb.collection("jobs").where("type", "==", AI_QUEUE_JOB_TYPE).limit(800).get(),
    adminDb.collection("metrics").where("type", "==", "ai_queue_daily").limit(1500).get(),
    readAiWorkerHealth(),
  ]);

  const observability = summarizeAiQueueObservability({
    jobs: jobsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    })),
    metrics: metricsSnap.docs.map((doc) => doc.data() as Record<string, unknown>),
    workerHealth,
  });

  await syncHealthAlerts(observability.tenants);

  return {
    ok: true,
    health: {
      status:
        observability.worker.status === "down"
          ? "down"
          : observability.overview.highRiskTenants > 0
            ? "degraded"
            : "healthy",
      checkedAt: new Date().toISOString(),
      worker: observability.worker,
      overview: observability.overview,
      topRiskTenants: observability.tenants.slice(0, 12),
    },
  };
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

  if (wantsHealth(req)) {
    return NextResponse.json(await buildHealthPayload());
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
