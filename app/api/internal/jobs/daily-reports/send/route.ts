import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { listTenantsForDailyReports, sendDailyReportWhatsApp, shouldRunDailyReportNow } from "@/lib/server/daily-report";

const JOB_LOCK_COLLECTION = "internal_job_locks";
const JOB_LOCK_ID = "daily_reports_send";
const JOB_LOCK_TTL_MS = 8 * 60 * 1000;

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
  if (bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  return String(req.headers.get("x-daily-reports-token") || req.headers.get("x-cron-secret") || "").trim();
}

function readBoolean(req: Request, key: string) {
  const { searchParams } = new URL(req.url);
  const value = String(searchParams.get(key) || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function readLimit(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = Number(searchParams.get("maxTenants") || 80);
  if (!Number.isFinite(raw)) return 80;
  return Math.max(1, Math.min(300, Math.round(raw)));
}

function readTenantFilter(req: Request) {
  const { searchParams } = new URL(req.url);
  return String(searchParams.get("tenantId") || "").trim();
}

function readDateKey(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = String(searchParams.get("dateKey") || searchParams.get("date") || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

async function handle(req: Request) {
  const expectedToken =
    String(process.env.DAILY_REPORTS_JOBS_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  if (!expectedToken) {
    return NextResponse.json({ error: "DAILY_REPORTS_JOBS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  }

  const token = readToken(req);
  if (!token || token !== expectedToken) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const force = readBoolean(req, "force");
  const dryRun = readBoolean(req, "dryRun");
  const tenantFilter = readTenantFilter(req);
  const dateKey = readDateKey(req);
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

  try {
    const tenants = tenantFilter
      ? [{ tenantId: tenantFilter }]
      : await listTenantsForDailyReports(readLimit(req));
    const results = [];
    const respectSendHour = readBoolean(req, "respectSendHour");
    const bypassSendWindow = !respectSendHour || force || Boolean(tenantFilter) || Boolean(dateKey);
    const now = new Date();

    for (const item of tenants) {
      const tenantId = String(item.tenantId || "").trim();
      if (!tenantId) continue;
      if (!bypassSendWindow && !shouldRunDailyReportNow({ settings: "settings" in item ? item.settings : null, now })) {
        results.push({
          tenantId,
          ok: true,
          skipped: true,
          reason: "outside_send_window",
          sent: false,
        });
        continue;
      }
      const result = await sendDailyReportWhatsApp({
        tenantId,
        dateKey,
        forceGenerate: false,
        dryRun,
      });
      results.push({
        tenantId,
        ok: result.ok,
        skipped: "skipped" in result ? result.skipped : false,
        reason: "reason" in result ? result.reason : undefined,
        sent: "sent" in result ? result.sent : false,
        error: "error" in result ? result.error : undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      force,
      runId: lockRunId || null,
      processed: results.length,
      results,
    });
  } finally {
    if (lockRunId) await releaseJobLock(lockRunId);
  }
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job de fechamento diario (GET):", error);
    return NextResponse.json({ error: "Falha ao processar fechamento diario." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job de fechamento diario (POST):", error);
    return NextResponse.json({ error: "Falha ao processar fechamento diario." }, { status: 500 });
  }
}
