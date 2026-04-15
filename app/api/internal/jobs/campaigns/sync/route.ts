import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { runTenantCampaignSync } from "@/lib/server/campaigns/tenant-sync";

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
  const tenantIds = directTenantId ? [directTenantId] : await listTenantIds(limit);

  const results = [];
  for (const tenantId of tenantIds) {
    try {
      const summary = await runTenantCampaignSync({ tenantId, days });
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

  return NextResponse.json({
    ok: true,
    mode: directTenantId ? "single" : "batch",
    days,
    tenantsProcessed: results.length,
    synced: results.reduce((acc, item) => acc + Number(item.synced || 0), 0),
    failed: results.reduce((acc, item) => acc + Number(item.failed || 0), 0),
    errors: results.filter((item) => !item.ok).length,
    results,
  });
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
