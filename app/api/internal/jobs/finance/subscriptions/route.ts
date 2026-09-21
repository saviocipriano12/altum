import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcilePlatformSubscriptions } from "@/lib/server/subscription-reconciliation";
import { deliverSubscriptionReceipts } from "@/lib/server/subscription-notifications";
import { adminDb } from "@/app/lib/server/firebase-admin";

export const maxDuration = 300;
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET || process.env.CONTRACT_BILLING_JOBS_TOKEN;
  if (!expected) return NextResponse.json({ error: "Job nao configurado." }, { status: 503 });
  const incoming = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const a = Buffer.from(incoming), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  const lock = adminDb.collection("internal_job_locks").doc("subscription_reconciliation");
  const acquired = await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(lock)).data();
    if (Number(data?.until) > Date.now()) return false;
    tx.set(lock, { until: Date.now() + 360_000 }); return true;
  });
  if (!acquired) return NextResponse.json({ skipped: true });
  try { return NextResponse.json({ ok: true, ...await reconcilePlatformSubscriptions(), receipts: await deliverSubscriptionReceipts() }); }
  catch { return NextResponse.json({ error: "Falha na conciliacao." }, { status: 500 }); }
  finally { await lock.set({ until: 0 }); }
}
