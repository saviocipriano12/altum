import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  collectTenantCriticalPushSnapshot,
  listTenantsWithPushSubscriptions,
  readTenantCriticalPushState,
  saveTenantCriticalPushState,
  sendCriticalPushToTenant,
} from "@/app/lib/server/client-portal-push";
import { isWebPushEnabled } from "@/app/lib/server/web-push";

const JOB_LOCK_COLLECTION = "internal_job_locks";
const JOB_LOCK_ID = "client_portal_push_critical";
const JOB_LOCK_TTL_MS = 4 * 60 * 1000;

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  return 0;
}

async function acquireJobLock() {
  const nowMs = Date.now();
  const runId = randomUUID();
  const lockRef = adminDb.collection(JOB_LOCK_COLLECTION).doc(JOB_LOCK_ID);

  let acquired = false;
  let lockedUntilMs = 0;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const status = String(data.status || "").toLowerCase();
    const expiresAtMs = toMillis(data.expiresAtMs || data.expiresAt);

    if (status === "running" && expiresAtMs > nowMs) {
      acquired = false;
      lockedUntilMs = expiresAtMs;
      return;
    }

    acquired = true;
    lockedUntilMs = nowMs + JOB_LOCK_TTL_MS;

    tx.set(
      lockRef,
      {
        id: JOB_LOCK_ID,
        status: "running",
        runId,
        startedAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(lockedUntilMs),
        expiresAtMs: lockedUntilMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { acquired, runId, lockedUntilMs };
}

async function releaseJobLock(runId: string) {
  const lockRef = adminDb.collection(JOB_LOCK_COLLECTION).doc(JOB_LOCK_ID);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return;

    const data = snap.data() as Record<string, unknown>;
    if (String(data.runId || "") !== runId) return;

    tx.set(
      lockRef,
      {
        status: "idle",
        runId: "",
        expiresAt: new Date(0),
        expiresAtMs: 0,
        releasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

function readToken(req: Request) {
  const bearer = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return (
    String(req.headers.get("x-client-portal-push-token") || "").trim() ||
    String(req.headers.get("x-cron-secret") || "").trim()
  );
}

function getMaxTenants(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = Number(searchParams.get("maxTenants") || 60);
  if (!Number.isFinite(raw)) return 60;
  return Math.max(1, Math.min(300, Math.round(raw)));
}

function getTenantFilter(req: Request) {
  const { searchParams } = new URL(req.url);
  return String(searchParams.get("tenantId") || "").trim();
}

function parseBooleanFlag(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isDryRun(req: Request) {
  const { searchParams } = new URL(req.url);
  return parseBooleanFlag(String(searchParams.get("dryRun") || ""));
}

function isForce(req: Request) {
  const { searchParams } = new URL(req.url);
  return parseBooleanFlag(String(searchParams.get("force") || ""));
}

async function handle(req: Request) {
  if (!isWebPushEnabled()) {
    return NextResponse.json(
      { error: "Push web nao configurado no servidor." },
      { status: 503 }
    );
  }

  const expectedToken =
    String(process.env.CLIENT_PORTAL_PUSH_JOBS_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "CLIENT_PORTAL_PUSH_JOBS_TOKEN ou CRON_SECRET nao configurado." },
      { status: 503 }
    );
  }

  const token = readToken(req);
  if (!token || token !== expectedToken) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const force = isForce(req);
  let lockRunId = "";

  if (!force) {
    const lock = await acquireJobLock();
    if (!lock.acquired) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "job_already_running",
          lockedUntil: new Date(lock.lockedUntilMs).toISOString(),
        },
        { status: 202 }
      );
    }
    lockRunId = lock.runId;
  }

  const tenantFilter = getTenantFilter(req);
  const maxTenants = getMaxTenants(req);
  const dryRun = isDryRun(req);

  try {
    const tenants = tenantFilter
      ? [tenantFilter]
      : await listTenantsWithPushSubscriptions(maxTenants);

    const results: Array<Record<string, unknown>> = [];

    for (const tenantId of tenants) {
      const current = await collectTenantCriticalPushSnapshot(tenantId);
      const previous = await readTenantCriticalPushState(tenantId);

      const notifications: Array<{
        title: string;
        body: string;
        tag: string;
        url: string;
        ttl?: number;
      }> = [];

      if (previous) {
        if (current.slaBreached > previous.slaBreached) {
          notifications.push({
            title: "SLA em risco no inbox",
            body: `${current.slaBreached} conversa(s) com SLA estourado.`,
            tag: "sla_breached",
            url: "/cliente/painel/inbox?queue=sla_breached",
            ttl: 120,
          });
        }

        if (current.deadLetter > previous.deadLetter) {
          notifications.push({
            title: "Fila da IA com falhas",
            body: `${current.deadLetter} job(s) em dead-letter exigem revisao.`,
            tag: "ai_dead_letter",
            url: "/cliente/painel/automacoes",
            ttl: 120,
          });
        }

        if (current.overdueFollowUps > previous.overdueFollowUps) {
          notifications.push({
            title: "Follow-ups vencidos",
            body: `${current.overdueFollowUps} tarefa(s) comercial(is) atrasada(s).`,
            tag: "overdue_followups",
            url: "/cliente/painel/follow-ups",
            ttl: 120,
          });
        }

        if (current.aiRiskLevel === "high" && previous.aiRiskLevel !== "high") {
          notifications.push({
            title: "Risco alto no motor de IA",
            body: "Sinais de risco alto detectados na fila de automacao.",
            tag: "ai_risk_high",
            url: "/cliente/painel/ia",
            ttl: 120,
          });
        }
      }

      const dispatches: Array<Record<string, unknown>> = [];
      if (!dryRun) {
        for (const notification of notifications) {
          const delivery = await sendCriticalPushToTenant({
            tenantId,
            title: notification.title,
            body: notification.body,
            tag: notification.tag,
            url: notification.url,
            ttl: notification.ttl,
          });

          dispatches.push({
            tag: notification.tag,
            ...delivery,
          });
        }
      }

      if (!dryRun) {
        await saveTenantCriticalPushState(tenantId, current);
      }
      results.push({
        tenantId,
        dryRun,
        candidateNotifications: notifications.map((item) => item.tag),
        notifications: dispatches.length,
        dispatches,
        snapshot: current,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      force,
      runId: lockRunId || null,
      processed: tenants.length,
      results,
    });
  } finally {
    if (lockRunId) {
      await releaseJobLock(lockRunId);
    }
  }
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job de push critico do portal (GET):", error);
    return NextResponse.json(
      { error: "Falha ao processar job de push critico." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job de push critico do portal (POST):", error);
    return NextResponse.json(
      { error: "Falha ao processar job de push critico." },
      { status: 500 }
    );
  }
}
