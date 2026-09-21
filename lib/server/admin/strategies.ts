import { adminDb } from "@/app/lib/server/firebase-admin";
import { RouteAuthError } from "@/app/lib/server/route-auth";
import type { strategySchema, StrategyObservation } from "@/lib/admin-strategies";
import type { z } from "zod";
export async function captureStrategyObservation(strategy: z.infer<typeof strategySchema>): Promise<StrategyObservation> {
  const collection = strategy.platform === "meta_ads" ? "meta_ads_operator_reports" : "google_ads_operator_reports";
  const snap = await adminDb.collection(collection).where("tenantId", "==", strategy.tenantId).limit(101).get();
  if (snap.size > 100) throw new RouteAuthError(409, "reports_partial", "Histórico excede o limite de leitura. Consolide os relatórios antes de medir.");
  const latest = snap.docs.filter(doc => doc.data().channelId === strategy.channelId).sort((a, b) => (b.data().generatedAt?.toMillis?.() || 0) - (a.data().generatedAt?.toMillis?.() || 0))[0];
  if (!latest) throw new RouteAuthError(409, "report_missing", "Sincronize a conta antes de registrar a estratégia.");
  const data = latest.data(); const generated = data.generatedAt?.toDate?.();
  if (!generated || Date.now() - generated.getTime() > 86400000) throw new RouteAuthError(409, "report_stale", "Atualize o relatório desta conta antes de medir.");
  const report = data.report || {};
  const campaign = (Array.isArray(report.campaigns) ? report.campaigns : []).find((row: Record<string, unknown>) => String(row.id) === strategy.campaignId);
  if (!campaign) throw new RouteAuthError(409, "campaign_missing", "Campanha ausente do último relatório.");
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const conversions = finite(strategy.platform === "meta_ads" ? campaign.leads : campaign.conversions);
  const spend = finite(campaign.spend);
  const value = strategy.metric === "conversions" ? conversions : strategy.metric === "roas" ? finite(campaign.roas) : conversions && spend !== null ? spend / conversions : null;
  return { value, conversions, currency: /^[A-Z]{3}$/.test(String(report.currency)) ? report.currency : null,
    from: String(report.from || ""), to: String(report.to || ""), generatedAt: generated.toISOString(), reportId: `${latest.id}:${generated.toISOString()}` };
}
