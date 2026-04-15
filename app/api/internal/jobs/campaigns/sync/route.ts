import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { runTenantCampaignSync } from "@/lib/server/campaigns/tenant-sync";

const LOCK_DOC_ID = "campaigns_sync";
const LOCK_TTL_MS = 14 * 60 * 1000;

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function readToken(req: Request) {
  const bearer = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return (
    String(req.headers.get("x-campaign-jobs-token") || "").trim() ||
    String(req.headers.get("x-cron-secret") || "").trim()
  );
}

function getDays(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Number(searchParams.get("days") || 1);
  return [1, 7, 30].includes(parsed) ? parsed : 1;
}

function getLimit(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Number(searchParams.get("limit") || 20);
  if (Number.isNaN(parsed)) return 20;
  return Math.min(80, Math.max(1, Math.round(parsed)));
}

function getTenantId(req: Request) {
  const { searchParams } = new URL(req.url);
  return clean(searchParams.get("tenantId"), 120);
}

function getMaxRetries(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Number(searchParams.get("retries") || 2);
  if (Number.isNaN(parsed)) return 2;
  return Math.min(4, Math.max(0, Math.round(parsed)));
}

function getRetryDelayMs(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Number(searchParams.get("retryDelayMs") || 900);
  if (Number.isNaN(parsed)) return 900;
  return Math.min(10_000, Math.max(250, Math.round(parsed)));
}

function buildRunId() {
  return `campaign_sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function acquireCampaignJobLock(owner: string) {
  const lockRef = adminDb.collection("internal_job_locks").doc(LOCK_DOC_ID);
  const nowMs = Date.now();
  const lockUntilMs = nowMs + LOCK_TTL_MS;

  const acquired = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const activeUntil = Number(data.lockedUntilMs || 0);
    if (activeUntil > nowMs) {
      return {
        ok: false as const,
        retryAfterSeconds: Math.max(1, Math.ceil((activeUntil - nowMs) / 1000)),
        lockedBy: clean(data.lockedBy, 120),
      };
    }

    tx.set(
      lockRef,
      {
        job: LOCK_DOC_ID,
        status: "running",
        lockedBy: owner,
        lockedAt: FieldValue.serverTimestamp(),
        lockedUntilMs: lockUntilMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true as const, retryAfterSeconds: 0, lockedBy: "" };
  });

  return {
    acquired: acquired.ok,
    retryAfterSeconds: acquired.retryAfterSeconds,
    lockedBy: acquired.lockedBy,
  };
}

async function releaseCampaignJobLock(owner: string) {
  const lockRef = adminDb.collection("internal_job_locks").doc(LOCK_DOC_ID);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (clean(data.lockedBy, 120) && clean(data.lockedBy, 120) !== owner) return;
    tx.set(
      lockRef,
      {
        status: "idle",
        lockedBy: null,
        lockedUntilMs: 0,
        releasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function listTenantIds(limit: number) {
  const snap = await adminDb.collection("tenant_channels").limit(limit * 12).get();
  const tenantIds = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data() as {
      tenantId?: unknown;
      status?: unknown;
      type?: unknown;
    };

    const status = clean(data.status, 40).toLowerCase();
    const type = clean(data.type, 40).toLowerCase();
    const tenantId = clean(data.tenantId, 120);

    if (!tenantId) continue;
    if (status !== "active") continue;
    if (!["meta_ads", "google_ads"].includes(type)) continue;

    tenantIds.add(tenantId);
    if (tenantIds.size >= limit) break;
  }

  return Array.from(tenantIds);
}

async function handle(req: Request) {
  const expectedToken =
    String(process.env.CAMPAIGN_SYNC_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "CAMPAIGN_SYNC_TOKEN ou CRON_SECRET nao configurado." },
      { status: 503 }
    );
  }

  const token = readToken(req);
  if (!token || token !== expectedToken) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const days = getDays(req);
  const directTenantId = getTenantId(req);
  const limit = getLimit(req);
  const maxRetriesPerDate = getMaxRetries(req);
  const retryBaseDelayMs = getRetryDelayMs(req);
  const tenantIds = directTenantId ? [directTenantId] : await listTenantIds(limit);
  const runId = buildRunId();

  const lock = await acquireCampaignJobLock(runId);
  if (!lock.acquired) {
    return NextResponse.json(
      {
        error: "Job de sync de campanhas ja esta em execucao.",
        code: "job_locked",
        retryAfterSeconds: lock.retryAfterSeconds,
        lockedBy: lock.lockedBy || null,
      },
      {
        status: 409,
        headers: {
          "Retry-After": String(lock.retryAfterSeconds),
        },
      }
    );
  }

  const runRef = adminDb.collection("internal_job_runs").doc(runId);
  await runRef.set(
    {
      runId,
      job: "campaigns_sync",
      status: "running",
      source: directTenantId ? "manual_single_tenant" : "scheduled_batch",
      mode: directTenantId ? "single" : "batch",
      tenantId: directTenantId || null,
      days,
      limit,
      maxRetriesPerDate,
      retryBaseDelayMs,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    const results = [];
    for (const tenantId of tenantIds) {
      try {
        const summary = await runTenantCampaignSync({
          tenantId,
          days,
          maxRetriesPerDate,
          retryBaseDelayMs,
          runId,
          source: "campaign_sync_job",
        });
        results.push({
          tenantId,
          ok: true,
          synced: summary.synced,
          failed: summary.failed,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao sincronizar tenant.";
        results.push({
          tenantId,
          ok: false,
          synced: 0,
          failed: 0,
          error: message,
        });
      }
    }

    const payload = {
      ok: true,
      runId,
      mode: directTenantId ? "single" : "batch",
      days,
      tenantsProcessed: results.length,
      synced: results.reduce((acc, item) => acc + Number(item.synced || 0), 0),
      failed: results.reduce((acc, item) => acc + Number(item.failed || 0), 0),
      errors: results.filter((item) => !item.ok).length,
      results,
    };

    await runRef.set(
      {
        status: "completed",
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        summary: {
          tenantsProcessed: payload.tenantsProcessed,
          synced: payload.synced,
          failed: payload.failed,
          errors: payload.errors,
        },
      },
      { merge: true }
    );

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no job de sync de campanhas.";
    await runRef.set(
      {
        status: "failed",
        error: message,
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  } finally {
    await releaseCampaignJobLock(runId).catch((error) => {
      console.error("Falha ao liberar lock do job de campanhas:", error);
    });
  }
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job interno de sync de campanhas (GET):", error);
    return NextResponse.json({ error: "Falha no job de sync de campanhas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job interno de sync de campanhas (POST):", error);
    return NextResponse.json({ error: "Falha no job de sync de campanhas." }, { status: 500 });
  }
}
