import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { runContractBillingCycle } from "@/lib/server/contract-billing";

const JOB_LOCK_COLLECTION = "internal_job_locks";
const JOB_LOCK_ID = "contract_billing_cycle";
const JOB_LOCK_TTL_MS = 6 * 60 * 1000;

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

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

function parseBooleanFlag(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readToken(req: Request) {
  const bearer = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return (
    clean(req.headers.get("x-contract-billing-token"), 500) ||
    clean(req.headers.get("x-cron-secret"), 500)
  );
}

function getMaxContracts(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Number(searchParams.get("maxContracts") || 120);
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function getTenantId(req: Request) {
  const { searchParams } = new URL(req.url);
  return clean(searchParams.get("tenantId"), 140);
}

function isDryRun(req: Request) {
  const { searchParams } = new URL(req.url);
  return parseBooleanFlag(clean(searchParams.get("dryRun"), 20));
}

function isForce(req: Request) {
  const { searchParams } = new URL(req.url);
  return parseBooleanFlag(clean(searchParams.get("force"), 20));
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
    const status = clean(data.status, 40).toLowerCase();
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
    if (clean(data.runId, 120) !== runId) return;

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

async function handle(req: Request) {
  const expectedToken =
    clean(process.env.CONTRACT_BILLING_JOBS_TOKEN, 500) ||
    clean(process.env.CRON_SECRET, 500);
  if (!expectedToken) {
    return NextResponse.json(
      { error: "CONTRACT_BILLING_JOBS_TOKEN ou CRON_SECRET nao configurado." },
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

  try {
    const result = await runContractBillingCycle({
      tenantId: getTenantId(req),
      maxContracts: getMaxContracts(req),
      dryRun: isDryRun(req),
    });

    return NextResponse.json({
      ok: true,
      runId: lockRunId || null,
      ...result,
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
    console.error("Erro no job de cobranca automatica (GET):", error);
    return NextResponse.json(
      { error: "Falha ao processar cobranca automatica de contratos." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job de cobranca automatica (POST):", error);
    return NextResponse.json(
      { error: "Falha ao processar cobranca automatica de contratos." },
      { status: 500 }
    );
  }
}
