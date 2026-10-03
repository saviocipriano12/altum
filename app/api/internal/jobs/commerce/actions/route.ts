import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeEcommerceAutomationSettings } from "@/lib/server/ecommerce";
import { processTenantEcommerceActions } from "@/lib/server/ecommerce-agent";
import { getEcommerceAgentPerformance } from "@/lib/server/ecommerce-agent-performance";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { hasTenantModule } from "@/lib/tenant-entitlements";

export const maxDuration = 300;

function authorized(req: Request) {
  const expected = String(process.env.ECOMMERCE_AGENT_JOBS_TOKEN || process.env.CRON_SECRET || "").trim();
  if (!expected) return "missing" as const;
  const incoming = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (access === "missing") return NextResponse.json({ error: "ECOMMERCE_AGENT_JOBS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  if (!access) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const url = new URL(req.url);
    const tenantLimit = Math.max(1, Math.min(50, Number(url.searchParams.get("tenantLimit") || 20)));
    const scanLimit = Math.max(tenantLimit, Math.min(250, Number(url.searchParams.get("scanLimit") || tenantLimit * 4)));
    const stateRef = adminDb.collection("operational_job_state").doc("ecommerce_agent_actions");
    const state = (await stateRef.get()).data() as Record<string, unknown> | undefined;
    const cursor = typeof state?.cursor === "string" ? state.cursor : "";
    let settingsQuery = adminDb.collection("tenant_settings").orderBy(FieldPath.documentId()).limit(scanLimit);
    if (cursor) settingsQuery = settingsQuery.startAfter(cursor);
    let settingsSnap = await settingsQuery.get();
    if (settingsSnap.empty && cursor) {
      settingsSnap = await adminDb.collection("tenant_settings").orderBy(FieldPath.documentId()).limit(scanLimit).get();
    }
    const nextCursor = settingsSnap.docs.at(-1)?.id || "";
    const candidates = settingsSnap.docs
      .map((doc) => ({ id: doc.id, settings: doc.data() as Record<string, unknown> }))
      .map((row) => ({ ...row, automation: normalizeEcommerceAutomationSettings(row.settings.ecommerceAutomation) }))
      .filter((row) => row.automation.agent.mode !== "off")
      .slice(0, tenantLimit);
    const results: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      const entitlements = await getTenantEntitlements(candidate.id);
      if (!hasTenantModule(entitlements, "commerce")) {
        results.push({ tenantId: candidate.id, skipped: "module_not_contracted" });
        continue;
      }
      try {
        const result = await processTenantEcommerceActions({
          tenantId: candidate.id,
          automation: candidate.automation,
          actor: { id: "ecommerce_agent", name: "Agente Ecommerce Altum" },
          source: "scheduled",
        });
        await adminDb.collection("tenant_settings").doc(candidate.id).set({
          lastEcommerceAgentRunAt: new Date(),
          lastEcommerceAgentRunId: result.runId,
        }, { merge: true });
        let experimentStatus = "not_running";
        if (candidate.automation.agent.experiment.enabled) {
          const performance = await getEcommerceAgentPerformance({ tenantId: candidate.id, automation: candidate.automation });
          experimentStatus = performance.verdict.status;
          if (performance.verdict.shouldRollback) {
            const rolledBackAutomation = {
              ...candidate.automation,
              agent: {
                ...candidate.automation.agent,
                experiment: { ...candidate.automation.agent.experiment, enabled: false },
              },
            };
            await Promise.all([
              adminDb.collection("tenant_settings").doc(candidate.id).set({
                ecommerceAutomation: rolledBackAutomation,
                ecommerceAgentLastRollbackAt: FieldValue.serverTimestamp(),
                ecommerceAgentLastRollbackReason: performance.verdict.reason,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: "ecommerce_agent_guardrail",
                updatedByName: "Guardrail do agente ecommerce",
              }, { merge: true }),
              adminDb.collection("audit_logs").add({
                tenantId: candidate.id,
                type: "ecommerce_agent_auto_rollback",
                championVersion: performance.champion.version,
                challengerVersion: performance.challenger.version,
                reason: performance.verdict.reason,
                champion: performance.champion,
                challenger: performance.challenger,
                createdAt: FieldValue.serverTimestamp(),
              }),
            ]);
          }
        }
        results.push({ tenantId: candidate.id, runId: result.runId, processed: result.processed, sent: result.sent, failed: result.failed, experimentStatus });
      } catch (error) {
        results.push({ tenantId: candidate.id, error: error instanceof Error ? error.message.slice(0, 240) : "agent_failed" });
      }
    }

    await stateRef.set({
      cursor: nextCursor,
      lastRunAt: FieldValue.serverTimestamp(),
      scannedTenants: settingsSnap.size,
      processedTenants: candidates.length,
    }, { merge: true });

    return NextResponse.json({
      ok: true,
      tenants: candidates.length,
      scannedTenants: settingsSnap.size,
      nextCursor: nextCursor || null,
      processed: results.reduce((total, item) => total + Number(item.processed || 0), 0),
      sent: results.reduce((total, item) => total + Number(item.sent || 0), 0),
      failed: results.reduce((total, item) => total + Number(item.failed || (item.error ? 1 : 0)), 0),
      results,
    });
  } catch (error) {
    console.error("Erro no job do agente ecommerce:", error);
    return NextResponse.json({ error: "Falha no job do agente ecommerce." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
