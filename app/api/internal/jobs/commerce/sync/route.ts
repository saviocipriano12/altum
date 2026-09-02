import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { hasCommerceCredentials } from "@/lib/server/commerce/registry";
import { syncCommerceConnection } from "@/lib/server/commerce/sync";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { hasTenantModule } from "@/lib/tenant-entitlements";

export const maxDuration = 300;

function readToken(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return String(req.headers.get("x-commerce-sync-token") || req.headers.get("x-cron-secret") || "").trim();
}

function boundedParam(url: URL, key: string, fallback: number, max: number) {
  const value = Number(url.searchParams.get(key) || fallback);
  return Number.isFinite(value) ? Math.max(1, Math.min(max, Math.round(value))) : fallback;
}

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function handle(req: Request) {
  const expected = String(process.env.COMMERCE_SYNC_TOKEN || process.env.CRON_SECRET || "").trim();
  if (!expected) return NextResponse.json({ error: "COMMERCE_SYNC_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  if (readToken(req) !== expected) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const url = new URL(req.url);
  const connectionLimit = boundedParam(url, "connectionLimit", 6, 20);
  const itemLimit = boundedParam(url, "itemLimit", 15, 30);
  const minimumIntervalMinutes = boundedParam(url, "minimumIntervalMinutes", 45, 24 * 60);
  const dueBefore = Date.now() - minimumIntervalMinutes * 60_000;
  const runId = `commerce_sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runRef = adminDb.collection("internal_job_runs").doc(runId);
  await runRef.set({
    runId,
    job: "commerce_sync",
    status: "running",
    connectionLimit,
    itemLimit,
    startedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    const snap = await adminDb.collection("ecommerce_connections").limit(160).get();
    const candidates = snap.docs
      .filter((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return data.status === "active" && hasCommerceCredentials(data.apiCredentials) && toMillis(data.lastSyncAt) < dueBefore;
      })
      .sort((a, b) => toMillis(a.data().lastSyncAt) - toMillis(b.data().lastSyncAt))
      .slice(0, connectionLimit);
    const entitlementCache = new Map<string, boolean>();
    const results: Array<Record<string, unknown>> = [];

    for (const doc of candidates) {
      const data = doc.data() as Record<string, unknown>;
      const tenantId = typeof data.tenantId === "string" ? data.tenantId.trim() : "";
      if (!tenantId) continue;
      let commerceEnabled = entitlementCache.get(tenantId);
      if (commerceEnabled === undefined) {
        const entitlements = await getTenantEntitlements(tenantId);
        commerceEnabled = hasTenantModule(entitlements, "commerce");
        entitlementCache.set(tenantId, commerceEnabled);
      }
      if (!commerceEnabled) {
        results.push({ connectionId: doc.id, tenantId, ok: false, skipped: "module_not_contracted" });
        continue;
      }
      try {
        const result = await syncCommerceConnection({
          tenantId,
          connectionId: doc.id,
          limit: itemLimit,
          actor: { id: "system", name: "Sincronizacao automatica", source: "scheduled" },
        });
        results.push({ connectionId: doc.id, tenantId, ok: true, processed: result.processed });
      } catch (error) {
        results.push({ connectionId: doc.id, tenantId, ok: false, error: error instanceof Error ? error.message.slice(0, 240) : "sync_failed" });
      }
    }

    const summary = {
      candidates: candidates.length,
      completed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok && !item.skipped).length,
      skipped: results.filter((item) => item.skipped).length,
      processed: results.reduce((total, item) => total + Number(item.processed || 0), 0),
    };
    await runRef.set({ status: "completed", summary, finishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, runId, summary, results });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "commerce_sync_job_failed";
    await runRef.set({ status: "failed", error: message, finishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("Erro no job de sincronizacao commerce:", error);
    return NextResponse.json({ error: "Falha no job de sincronizacao commerce." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
