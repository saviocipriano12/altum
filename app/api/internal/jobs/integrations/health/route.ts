import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { runTenantIntegrationHealthCheck } from "@/lib/server/integrations/health";

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
    String(req.headers.get("x-integrations-health-token") || "").trim() ||
    String(req.headers.get("x-cron-secret") || "").trim()
  );
}

function getLimit(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Number(searchParams.get("maxTenants") || searchParams.get("limit") || 30);
  if (Number.isNaN(parsed)) return 30;
  return Math.min(120, Math.max(1, Math.round(parsed)));
}

function getTenantId(req: Request) {
  const { searchParams } = new URL(req.url);
  return clean(searchParams.get("tenantId"), 120);
}

async function listTenantIds(limit: number) {
  const [channelsSnap, commerceSnap] = await Promise.all([
    adminDb.collection("tenant_channels").limit(limit * 20).get(),
    adminDb.collection("ecommerce_connections").limit(limit * 10).get(),
  ]);
  const tenantIds = new Set<string>();
  for (const doc of channelsSnap.docs) {
    const data = doc.data() as { tenantId?: unknown; type?: unknown };
    const tenantId = clean(data.tenantId, 120);
    const type = clean(data.type, 40).toLowerCase();
    if (!tenantId) continue;
    if (!["whatsapp", "instagram", "messenger", "meta_ads", "google_ads"].includes(type)) continue;
    tenantIds.add(tenantId);
    if (tenantIds.size >= limit) break;
  }
  if (tenantIds.size < limit) {
    for (const doc of commerceSnap.docs) {
      const tenantId = clean((doc.data() as { tenantId?: unknown }).tenantId, 120);
      if (!tenantId) continue;
      tenantIds.add(tenantId);
      if (tenantIds.size >= limit) break;
    }
  }
  return Array.from(tenantIds);
}

async function handle(req: Request) {
  const expectedToken =
    String(process.env.INTEGRATIONS_HEALTH_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "INTEGRATIONS_HEALTH_TOKEN ou CRON_SECRET nao configurado." },
      { status: 503 }
    );
  }

  const token = readToken(req);
  if (!token || token !== expectedToken) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const directTenantId = getTenantId(req);
  const limit = getLimit(req);
  const attemptRepair = new URL(req.url).searchParams.get("attemptRepair") === "1";
  const tenantIds = directTenantId ? [directTenantId] : await listTenantIds(limit);
  const runId = `integrations_health_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const runRef = adminDb.collection("internal_job_runs").doc(runId);

  await runRef.set(
    {
      runId,
      job: "integrations_health",
      status: "running",
      tenantId: directTenantId || null,
      mode: directTenantId ? "single" : "batch",
      attemptRepair,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    const results = [] as Array<{
      tenantId: string;
      ok: boolean;
      healthy?: number;
      total?: number;
      issues?: number;
      error?: string;
    }>;

    for (const tenantId of tenantIds) {
      try {
        const summary = await runTenantIntegrationHealthCheck({ tenantId, attemptRepair });
        results.push({
          tenantId,
          ok: true,
          healthy: summary.healthy,
          total: summary.total,
          issues: Math.max(0, Number(summary.total || 0) - Number(summary.healthy || 0)),
        });
      } catch (error) {
        results.push({
          tenantId,
          ok: false,
          error: error instanceof Error ? error.message : "Falha ao verificar tenant.",
        });
      }
    }

    const payload = {
      ok: true,
      runId,
      tenantsProcessed: results.length,
      healthyChannels: results.reduce((acc, item) => acc + Number(item.healthy || 0), 0),
      totalChannels: results.reduce((acc, item) => acc + Number(item.total || 0), 0),
      tenantsWithErrors: results.filter((item) => !item.ok).length,
      results,
    };

    await runRef.set(
      {
        status: "completed",
        summary: {
          tenantsProcessed: payload.tenantsProcessed,
          healthyChannels: payload.healthyChannels,
          totalChannels: payload.totalChannels,
          tenantsWithErrors: payload.tenantsWithErrors,
        },
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no job de health das integracoes.";
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
  }
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job interno de health de integracoes (GET):", error);
    return NextResponse.json({ error: "Falha no job de health de integracoes." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job interno de health de integracoes (POST):", error);
    return NextResponse.json({ error: "Falha no job de health de integracoes." }, { status: 500 });
  }
}
